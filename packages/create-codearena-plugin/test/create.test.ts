import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPlugin, parseArgs } from '../index.mjs';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'codearena-create-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function allFiles(root: string): Promise<string[]> {
  return (await readdir(root, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name).slice(root.length + 1))
    .sort();
}

describe('create-codearena-plugin', () => {
  it('gera o plugin com o id, o nome e a faixa do SDK preenchidos', async () => {
    const target = createPlugin({ dir: join(dir, 'codearena-plugin-eletrica'), id: 'eletrica', name: 'Circuitos elétricos', author: 'Ana' });
    const files = await allFiles(target);
    expect(files).toEqual(
      expect.arrayContaining(['.gitignore', 'package.json', 'src/index.ts', 'src/ui.tsx', 'packs/eletrica-exemplo.json', 'docs/agents.md', '.github/workflows/ci.yml']),
    );
    expect(files).not.toContain('_gitignore');
    for (const file of files) expect(await readFile(join(target, file), 'utf8'), file).not.toMatch(/\{\{\w+\}\}/);

    const pkg = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('codearena-plugin-eletrica');
    expect(pkg.codearena).toMatchObject({ pluginId: 'eletrica', displayName: 'Circuitos elétricos', packs: ['./packs/eletrica-exemplo.json'] });
    expect(pkg.codearena.sdk).toMatch(/^\^\d+\.\d+\.\d+$/);
    expect(pkg.peerDependencies['@codearena/plugin-sdk']).toBe(pkg.codearena.sdk);
    const pack = JSON.parse(await readFile(join(target, 'packs/eletrica-exemplo.json'), 'utf8'));
    expect(pack.pack).toMatchObject({ pluginId: 'eletrica', author: 'Ana' });
  });

  it('recusa id inválido e pasta com arquivos', async () => {
    expect(() => createPlugin({ dir: join(dir, 'x'), id: 'Meu Plugin', name: 'X' })).toThrow(/id inválido/);
    await writeFile(join(dir, 'existente.txt'), '');
    expect(() => createPlugin({ dir, id: 'ok', name: 'Ok' })).toThrow(/não está vazia/);
  });

  it('lê os argumentos da linha de comando', () => {
    expect(parseArgs(['pasta', '--id', 'quimica', '--name', 'Química', '--yes'])).toEqual({
      dir: 'pasta',
      id: 'quimica',
      name: 'Química',
      author: undefined,
      yes: true,
    });
    expect(() => parseArgs(['--nao-existe'])).toThrow(/desconhecida/);
  });
});
