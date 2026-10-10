#!/usr/bin/env node
/**
 * codearena plugins list | add <pacote ou caminho> | remove <pacote, caminho ou id>
 *
 * add:    instala o pacote na raiz, confere o manifesto e a versão do SDK, acrescenta em codearena.config.json e roda o build.
 * remove: tira da configuração, desinstala o pacote e roda o build.
 * Opções: --isolated (add), --no-install, --no-build, --config <arquivo>, --root <pasta>.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  CONFIG_FILE,
  HOST_VERSION,
  isPathSpecifier,
  readHostConfig,
  resolveHostPlugins,
  resolvePlugin,
  writeHostConfig,
} from './index.mjs';

const USAGE = `Uso:
  codearena plugins list
  codearena plugins add <pacote[@versão] | caminho> [--isolated] [--no-install] [--no-build]
  codearena plugins remove <pacote | caminho | id> [--no-install] [--no-build]

Opções:
  --isolated          roda o plugin no modo isolado (para plugins de terceiros não revisados)
  --config <arquivo>  outro arquivo de configuração (padrão: ${CONFIG_FILE} na raiz)
  --root <pasta>      raiz da instalação (padrão: pasta atual)`;

/** Nome do pacote sem a versão: "pkg@1.2.0" -> "pkg", "@org/pkg@^1" -> "@org/pkg". */
export function packageName(spec) {
  const at = spec.indexOf('@', spec.startsWith('@') ? 1 : 0);
  return at > 0 ? spec.slice(0, at) : spec;
}

function packageManager(rootDir) {
  if (existsSync(join(rootDir, 'pnpm-lock.yaml')) || existsSync(join(rootDir, 'pnpm-workspace.yaml'))) return 'pnpm';
  if (existsSync(join(rootDir, 'package-lock.json'))) return 'npm';
  return 'pnpm';
}

function defaultExec(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) throw new Error(`"${command} ${args.join(' ')}" terminou com erro.`);
}

function installArgs(manager, action, spec) {
  if (manager === 'npm') return [action === 'add' ? 'install' : 'uninstall', spec];
  return [action, '-w', spec];
}

/**
 * @param {string[]} argv
 * @param {{ cwd?: string; exec?: (cmd: string, args: string[], cwd: string) => void; log?: (msg: string) => void }} [io]
 * @returns {Promise<number>} código de saída
 */
export async function main(argv, io = {}) {
  const log = io.log ?? ((m) => console.log(m));
  const exec = io.exec ?? defaultExec;
  const args = [...argv];
  const flag = (name) => {
    const i = args.indexOf(name);
    if (i === -1) return false;
    args.splice(i, 1);
    return true;
  };
  const option = (name) => {
    const i = args.indexOf(name);
    if (i === -1) return undefined;
    const [, value] = args.splice(i, 2);
    return value;
  };
  const isolated = flag('--isolated');
  const noInstall = flag('--no-install');
  const noBuild = flag('--no-build');
  const rootDir = resolve(io.cwd ?? process.cwd(), option('--root') ?? '.');
  const configPath = resolve(rootDir, option('--config') ?? CONFIG_FILE);
  const [group, command, target] = args;

  if (group !== 'plugins' || !['list', 'add', 'remove'].includes(command ?? '') || (command !== 'list' && !target)) {
    log(USAGE);
    return group === undefined || group === '--help' || group === '-h' ? 0 : 1;
  }

  const manager = packageManager(rootDir);
  const build = () => {
    if (noBuild) {
      log(`Rode "${manager} build" para atualizar a interface.`);
      return;
    }
    log('Gerando o app com os plugins atualizados...');
    exec(manager, ['run', 'build'], rootDir);
  };

  if (command === 'list') {
    const { config, plugins, problems } = resolveHostPlugins({ rootDir, configPath, sdkVersion: HOST_VERSION });
    if (!config.plugins.length) log(`Nenhum plugin em ${configPath}.`);
    for (const p of plugins) {
      const extras = [p.entries.server && 'servidor', p.entries.ui && 'interface', p.entries.sandbox && 'preview isolado'].filter(Boolean);
      const mode = p.isolated ? ', isolado' : '';
      log(`ok    ${p.manifest.pluginId.padEnd(18)} ${p.packageName}@${p.version}  (${extras.join(', ') || 'só validadores'}; packs de exemplo: ${p.packs.length}${mode})`);
    }
    for (const problem of problems) log(`ERRO  ${problem.message}`);
    return problems.length ? 1 : 0;
  }

  const config = readHostConfig(rootDir, configPath);

  if (command === 'add') {
    const local = isPathSpecifier(target);
    const entry = local ? target : packageName(target);
    if (config.plugins.includes(entry)) {
      log(`"${entry}" já está em ${configPath}.`);
      return 0;
    }
    const installed = !local && !noInstall;
    if (installed) exec(manager, installArgs(manager, 'add', target), rootDir);
    try {
      const plugin = resolvePlugin(entry, { rootDir, baseDir: dirname(configPath), sdkVersion: HOST_VERSION });
      const clash = resolveHostPlugins({ rootDir, configPath }).plugins.find((p) => p.manifest.pluginId === plugin.manifest.pluginId);
      if (clash) throw new Error(`o pluginId "${plugin.manifest.pluginId}" já é usado por "${clash.specifier}".`);
      if (isolated && !/\.(m?js|cjs)$/.test(plugin.entries.server ?? plugin.entries.main)) {
        throw new Error('o modo isolado precisa do pacote compilado (entrada .js); rode o build do plugin.');
      }
      writeHostConfig(configPath, [...config.plugins, entry], isolated ? [...config.isolated, entry] : config.isolated);
      log(`Plugin "${plugin.manifest.displayName}" (${plugin.manifest.pluginId}) ativado${isolated ? ' no modo isolado' : ''} em ${configPath}.`);
    } catch (err) {
      log(`ERRO  ${err.message}`);
      if (installed) exec(manager, installArgs(manager, 'remove', entry), rootDir);
      return 1;
    }
    build();
    return 0;
  }

  // remove: aceita o item da configuração, o nome do pacote ou o pluginId.
  const { plugins } = resolveHostPlugins({ rootDir, configPath });
  const entry =
    config.plugins.find((p) => p === target || p === packageName(target)) ??
    plugins.find((p) => p.manifest.pluginId === target || p.packageName === target)?.specifier;
  if (!entry) {
    log(`"${target}" não está em ${configPath}.`);
    return 1;
  }
  writeHostConfig(configPath, config.plugins.filter((p) => p !== entry), config.isolated.filter((p) => p !== entry));
  log(`"${entry}" removido de ${configPath}. Os packs desse plugin ficam marcados como "Plugin não instalado".`);
  if (!isPathSpecifier(entry) && !noInstall) exec(manager, installArgs(manager, 'remove', entry), rootDir);
  build();
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
