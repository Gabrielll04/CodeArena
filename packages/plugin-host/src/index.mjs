/**
 * Carrega a lista de plugins da instalação (codearena.config.json) e resolve os pacotes declarados.
 * Escrito em JavaScript puro para rodar tanto no servidor (tsx) quanto na configuração do Vite.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import semver from 'semver';
import { z } from 'zod';

export const CONFIG_FILE = 'codearena.config.json';

const PLUGIN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SUBPATH = /^\.(\/[\w.-]+)*$/;

export const HostConfigSchema = z
  .object({
    $schema: z.string().optional(),
    plugins: z.array(z.string().min(1)).default([]),
  })
  .strict();

export const PluginManifestSchema = z
  .object({
    pluginId: z.string().regex(PLUGIN_ID, 'use letras minúsculas, números e "-"'),
    displayName: z.string().min(1),
    sdk: z.string().refine((range) => semver.validRange(range) !== null, 'faixa de versão inválida'),
    server: z.string().regex(SUBPATH, 'use um subcaminho de exports, como "./server"').optional(),
    ui: z.string().regex(SUBPATH, 'use um subcaminho de exports, como "./ui"').optional(),
    sandbox: z.string().regex(SUBPATH, 'use um subcaminho de exports, como "./sandbox"').optional(),
    /** Packs de exemplo distribuídos com o plugin (arquivos JSON dentro do pacote). */
    packs: z.array(z.string().regex(/^\.\/[\w./-]+\.json$/, 'use um caminho como "./packs/exemplo.json"')).optional(),
  })
  .strict();

export class PluginLoadError extends Error {
  /** @param {string} specifier @param {string} message */
  constructor(specifier, message) {
    super(`Plugin "${specifier}": ${message}`);
    this.name = 'PluginLoadError';
    this.specifier = specifier;
  }
}

/** Versão do @codearena/plugin-sdk visível a partir de `fromDir`. */
export function installedSdkVersion(fromDir) {
  for (let dir = resolve(fromDir); ; dir = resolve(dir, '..')) {
    const file = join(dir, 'node_modules', '@codearena', 'plugin-sdk', 'package.json');
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8')).version;
    if (resolve(dir, '..') === dir) return undefined;
  }
}

/** Lê codearena.config.json. Sem arquivo, a instalação não tem plugins. */
export function readHostConfig(rootDir, configPath = join(rootDir, CONFIG_FILE)) {
  if (!existsSync(configPath)) return { path: configPath, exists: false, plugins: [] };
  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (err) {
    throw new Error(`${configPath}: JSON inválido (${err.message})`);
  }
  const parsed = HostConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`).join('; ');
    throw new Error(`${configPath}: ${issues}`);
  }
  return { path: configPath, exists: true, plugins: [...new Set(parsed.data.plugins)] };
}

function isPathSpecifier(specifier) {
  return specifier.startsWith('.') || isAbsolute(specifier);
}

/** Encontra a pasta do pacote subindo pelos node_modules a partir de rootDir (como o Node faz). */
function findPackageDir(name, rootDir) {
  for (let dir = rootDir; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    if (dirname(dir) === dir) return null;
  }
}

/** Resolve um subcaminho de "exports" (string ou condições import/default). */
function resolveExport(pkg, packageDir, subpath) {
  const exportsField = pkg.exports;
  let target;
  if (typeof exportsField === 'string' || Array.isArray(exportsField)) {
    target = subpath === '.' ? exportsField : undefined;
  } else if (exportsField && typeof exportsField === 'object') {
    const keys = Object.keys(exportsField);
    target = keys.length && keys.every((k) => !k.startsWith('.')) ? (subpath === '.' ? exportsField : undefined) : exportsField[subpath];
  } else if (subpath === '.') {
    target = pkg.module ?? pkg.main ?? './index.js';
  }
  while (target && typeof target === 'object') {
    target = Array.isArray(target) ? target[0] : (target.import ?? target.browser ?? target.default ?? target.node);
  }
  if (typeof target !== 'string') return null;
  const file = resolve(packageDir, target);
  return existsSync(file) ? file : null;
}

/**
 * Resolve um item de "plugins": nome de pacote (instalado a partir de rootDir) ou caminho local
 * (relativo a baseDir, a pasta do codearena.config.json).
 * @returns {import('./index.d.mts').ResolvedPlugin}
 */
export function resolvePlugin(specifier, { rootDir, baseDir = rootDir, sdkVersion }) {
  const localDir = isPathSpecifier(specifier) ? resolve(baseDir, specifier) : null;
  const packageDir = localDir
    ? existsSync(localDir)
      ? realpathSync(localDir)
      : null
    : findPackageDir(specifier, rootDir);
  if (!packageDir || !existsSync(join(packageDir, 'package.json'))) {
    throw new PluginLoadError(
      specifier,
      isPathSpecifier(specifier) ? 'pasta não encontrada' : `pacote não instalado. Rode "pnpm add ${specifier}" na raiz.`,
    );
  }
  const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
  if (!pkg.codearena) throw new PluginLoadError(specifier, 'o package.json não tem o manifesto "codearena".');
  const parsed = PluginManifestSchema.safeParse(pkg.codearena);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `codearena.${i.path.join('.')}: ${i.message}`).join('; ');
    throw new PluginLoadError(specifier, `manifesto inválido (${issues})`);
  }
  const manifest = parsed.data;
  if (sdkVersion && !semver.satisfies(sdkVersion, manifest.sdk, { includePrerelease: true })) {
    throw new PluginLoadError(specifier, `requer o SDK ${manifest.sdk}, mas esta instalação usa o SDK ${sdkVersion}.`);
  }

  const entry = (subpath, field) => {
    if (!subpath) return undefined;
    const file = resolveExport(pkg, packageDir, subpath);
    if (!file) throw new PluginLoadError(specifier, `codearena.${field} aponta para "${subpath}", que não existe em "exports".`);
    return file;
  };
  const main = entry('.', 'main');
  if (!main) throw new PluginLoadError(specifier, 'o pacote não exporta ".".');

  const packs = (manifest.packs ?? []).map((file) => {
    const absolute = resolve(packageDir, file);
    if (!absolute.startsWith(packageDir) || !existsSync(absolute)) {
      throw new PluginLoadError(specifier, `codearena.packs: "${file}" não existe no pacote.`);
    }
    return absolute;
  });

  return {
    specifier,
    packageName: pkg.name ?? specifier,
    version: pkg.version ?? '0.0.0',
    description: pkg.description ?? '',
    packageDir,
    manifest,
    entries: {
      main,
      server: entry(manifest.server, 'server'),
      ui: entry(manifest.ui, 'ui'),
      sandbox: entry(manifest.sandbox, 'sandbox'),
    },
    packs,
  };
}

/**
 * Resolve todos os plugins da configuração. Um plugin com problema não impede os outros:
 * ele vai para `problems` e os packs que dependem dele aparecem como "Plugin não instalado".
 */
export function resolveHostPlugins({ rootDir, configPath, sdkVersion }) {
  const config = readHostConfig(rootDir, configPath);
  const plugins = [];
  const problems = [];
  for (const specifier of config.plugins) {
    try {
      const plugin = resolvePlugin(specifier, { rootDir, baseDir: dirname(config.path), sdkVersion });
      const duplicate = plugins.find((p) => p.manifest.pluginId === plugin.manifest.pluginId);
      if (duplicate) {
        throw new PluginLoadError(specifier, `pluginId "${plugin.manifest.pluginId}" já usado por "${duplicate.specifier}".`);
      }
      plugins.push(plugin);
    } catch (err) {
      problems.push({ specifier, message: err instanceof PluginLoadError ? err.message : `Plugin "${specifier}": ${err.message}` });
    }
  }
  return { config, plugins, problems };
}
