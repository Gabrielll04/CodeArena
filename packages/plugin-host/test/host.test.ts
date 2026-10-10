import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readHostConfig, resolveHostPlugins } from '../src/index.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'codearena-host-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function writeJson(file: string, value: unknown) {
  await mkdir(resolve(file, '..'), { recursive: true });
  await writeFile(file, JSON.stringify(value));
}

/** Cria um pacote de plugin falso em <base>/<folder>. */
async function fakePlugin(base: string, folder: string, pkg: Record<string, unknown>, files: string[] = ['index.js']) {
  const packageDir = join(base, folder);
  await writeJson(join(packageDir, 'package.json'), pkg);
  for (const file of files) {
    await mkdir(resolve(join(packageDir, file), '..'), { recursive: true });
    await writeFile(join(packageDir, file), 'export default {};');
  }
  return packageDir;
}

const manifest = (pluginId: string, extra: Record<string, unknown> = {}) => ({
  pluginId,
  displayName: `Plugin ${pluginId}`,
  sdk: '^0.1.0',
  ...extra,
});

describe('readHostConfig', () => {
  it('sem arquivo, a instalação não tem plugins', () => {
    expect(readHostConfig(dir)).toMatchObject({ exists: false, plugins: [] });
  });

  it('recusa JSON inválido e campos desconhecidos', async () => {
    await writeFile(join(dir, 'codearena.config.json'), '{ "plugins": [ }');
    expect(() => readHostConfig(dir)).toThrow(/JSON inválido/);
    await writeJson(join(dir, 'codearena.config.json'), { plugins: [], extra: true });
    expect(() => readHostConfig(dir)).toThrow(/extra/);
  });

  it('remove itens repetidos', async () => {
    await writeJson(join(dir, 'codearena.config.json'), { plugins: ['a', 'a', 'b'] });
    expect(readHostConfig(dir).plugins).toEqual(['a', 'b']);
  });
});

describe('resolveHostPlugins', () => {
  it('resolve os plugins oficiais configurados no repositório', () => {
    const { plugins, problems } = resolveHostPlugins({ rootDir: repoRoot, sdkVersion: '0.1.0' });
    expect(problems).toEqual([]);
    const byId = Object.fromEntries(plugins.map((p) => [p.manifest.pluginId, p]));
    expect(Object.keys(byId).sort()).toEqual(['backend-http', 'react-native']);
    expect(byId['react-native']!.entries.sandbox).toMatch(/sandbox[\\/]runtime\.tsx$/);
    expect(byId['react-native']!.entries.server).toBeUndefined();
    expect(byId['backend-http']!.entries.server).toMatch(/server[\\/]index\.ts$/);
    expect(byId['backend-http']!.entries.sandbox).toBeUndefined();
  });

  it('encontra pacotes instalados e resolve exports com condições', async () => {
    await fakePlugin(join(dir, 'node_modules'), 'codearena-plugin-demo', {
      name: 'codearena-plugin-demo',
      version: '1.2.0',
      exports: { '.': { types: './index.d.ts', import: './dist/index.js' }, './ui': { default: './dist/ui.js' } },
      codearena: manifest('demo', { ui: './ui' }),
    }, ['dist/index.js', 'dist/ui.js']);
    await writeJson(join(dir, 'codearena.config.json'), { plugins: ['codearena-plugin-demo'] });

    const { plugins, problems } = resolveHostPlugins({ rootDir: dir, sdkVersion: '0.1.3' });
    expect(problems).toEqual([]);
    expect(plugins[0]).toMatchObject({ packageName: 'codearena-plugin-demo', version: '1.2.0' });
    expect(plugins[0]!.entries.main).toMatch(/dist[\\/]index\.js$/);
    expect(plugins[0]!.entries.ui).toMatch(/dist[\\/]ui\.js$/);
  });

  it('aceita caminho local relativo ao arquivo de configuração', async () => {
    await fakePlugin(dir, 'meus-plugins/eletrica', { name: 'codearena-plugin-eletrica', exports: { '.': './index.js' }, codearena: manifest('eletrica') });
    await writeJson(join(dir, 'config', 'codearena.config.json'), { plugins: ['../meus-plugins/eletrica'] });

    const { plugins, problems } = resolveHostPlugins({ rootDir: dir, configPath: join(dir, 'config', 'codearena.config.json') });
    expect(problems).toEqual([]);
    expect(plugins.map((p) => p.manifest.pluginId)).toEqual(['eletrica']);
  });

  it('um plugin com problema não impede os outros', async () => {
    const modules = join(dir, 'node_modules');
    await fakePlugin(modules, 'ok', { name: 'ok', exports: { '.': './index.js' }, codearena: manifest('ok') });
    await fakePlugin(modules, 'sem-manifesto', { name: 'sem-manifesto', exports: { '.': './index.js' } });
    await fakePlugin(modules, 'sdk-novo', { name: 'sdk-novo', exports: { '.': './index.js' }, codearena: manifest('novo', { sdk: '^2.0.0' }) });
    await fakePlugin(modules, 'repetido', { name: 'repetido', exports: { '.': './index.js' }, codearena: manifest('ok') });
    await fakePlugin(modules, 'id-ruim', { name: 'id-ruim', exports: { '.': './index.js' }, codearena: manifest('Id Ruim') });
    await fakePlugin(modules, 'sem-ui', { name: 'sem-ui', exports: { '.': './index.js' }, codearena: manifest('sem-ui', { ui: './ui' }) });
    await writeJson(join(dir, 'codearena.config.json'), {
      plugins: ['ok', 'sem-manifesto', 'sdk-novo', 'repetido', 'id-ruim', 'sem-ui', 'nao-instalado'],
    });

    const { plugins, problems } = resolveHostPlugins({ rootDir: dir, sdkVersion: '0.1.0' });
    expect(plugins.map((p) => p.specifier)).toEqual(['ok']);
    const message = (specifier: string) => problems.find((p) => p.specifier === specifier)?.message;
    expect(message('sem-manifesto')).toMatch(/manifesto "codearena"/);
    expect(message('sdk-novo')).toMatch(/requer o SDK \^2\.0\.0.*SDK 0\.1\.0/);
    expect(message('repetido')).toMatch(/já usado por "ok"/);
    expect(message('id-ruim')).toMatch(/codearena\.pluginId/);
    expect(message('sem-ui')).toMatch(/codearena\.ui aponta para "\.\/ui"/);
    expect(message('nao-instalado')).toMatch(/pnpm add nao-instalado/);
  });
});
