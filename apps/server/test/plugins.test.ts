import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadServerPlugins } from '../src/plugins';

const repoRoot = resolve(import.meta.dirname, '../../..');
let dir: string;

beforeAll(async () => {
  // Dentro do repositório: o Vitest resolve caminhos absolutos fora da raiz do projeto como relativos a ela.
  await mkdir(join(repoRoot, 'node_modules/.cache'), { recursive: true });
  dir = await mkdtemp(join(repoRoot, 'node_modules/.cache/codearena-plugins-'));
});

afterAll(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function localPlugin(name: string, pluginId: string, source: string) {
  const packageDir = join(dir, name);
  await mkdir(packageDir, { recursive: true });
  await writeFile(
    join(packageDir, 'package.json'),
    JSON.stringify({ name, type: 'module', exports: { '.': './index.mjs' }, codearena: { pluginId, displayName: name, sdk: '^0.1.0' } }),
  );
  await writeFile(join(packageDir, 'index.mjs'), source);
}

describe('loadServerPlugins', () => {
  it('carrega os plugins de codearena.config.json, com a versão de servidor quando existe', async () => {
    const { registry, samplePacks, problems } = await loadServerPlugins({ rootDir: repoRoot });
    expect(problems).toEqual([]);
    expect(registry.list().map((p) => p.id).sort()).toEqual(['backend-http', 'react-native']);
    expect(samplePacks.map((s) => `${s.pluginId}:${s.file.split(/[\\/]/).pop()}`).sort()).toEqual([
      'backend-http:backend-http-basico.json',
      'backend-http:depuracao-backend-http.json',
      'react-native:depuracao-react-native.json',
      'react-native:react-native-fundamentos.json',
    ]);
  });

  it('registra os plugins válidos e informa os que falharam', async () => {
    const plugin = (id: string) =>
      `{ id: '${id}', displayName: 'Demo', description: '', version: '1.0.0', editorLanguage: 'plaintext', getStarterCode: (q) => q.starterCode }`;
    await localPlugin('objeto', 'objeto', `export default ${plugin('objeto')};`);
    await localPlugin('fabrica', 'fabrica', `export default async () => (${plugin('fabrica')});`);
    await localPlugin('id-trocado', 'id-trocado', `export default ${plugin('outro-id')};`);
    await localPlugin('sem-default', 'sem-default', `export const x = 1;`);
    await localPlugin('quebrado', 'quebrado', `throw new Error('falha ao importar');`);
    const configPath = join(dir, 'codearena.config.json');
    await writeFile(configPath, JSON.stringify({ plugins: ['./objeto', './fabrica', './id-trocado', './sem-default', './quebrado'] }));

    const logged: string[] = [];
    const { registry, problems } = await loadServerPlugins({ rootDir: repoRoot, configPath, log: (m) => logged.push(m) });
    expect(registry.list().map((p) => p.id)).toEqual(['objeto', 'fabrica']);
    expect(problems.map((p) => p.specifier)).toEqual(['./id-trocado', './sem-default', './quebrado']);
    expect(problems[0]!.message).toMatch(/declara "id-trocado", mas o plugin tem id "outro-id"/);
    expect(problems[1]!.message).toMatch(/export default/);
    expect(problems[2]!.message).toMatch(/falha ao importar/);
    expect(logged).toHaveLength(3);
  });
});
