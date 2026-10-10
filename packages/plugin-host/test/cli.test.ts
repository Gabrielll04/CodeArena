import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main, packageName } from '../src/cli.mjs';

let dir: string;
let calls: string[];
let output: string[];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'codearena-cli-'));
  calls = [];
  output = [];
  await writeFile(join(dir, 'pnpm-workspace.yaml'), 'packages: []\n');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

async function plugin(base: string, name: string, codearena: Record<string, unknown>) {
  const packageDir = join(base, name);
  await mkdir(packageDir, { recursive: true });
  await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name, version: '1.0.0', exports: { '.': './index.js' }, codearena }));
  await writeFile(join(packageDir, 'index.js'), 'export default {};');
}

const manifest = (pluginId: string, sdk = '^0.1.0') => ({ pluginId, displayName: `Plugin ${pluginId}`, sdk });

/** O gerenciador de pacotes é simulado: os comandos são só registrados. */
const run = (...argv: string[]) =>
  main(argv, { cwd: dir, log: (m) => output.push(m), exec: (command, args) => void calls.push(`${command} ${args.join(' ')}`) });

const config = async () => JSON.parse(await readFile(join(dir, 'codearena.config.json'), 'utf8')) as { plugins: string[] };

describe('packageName', () => {
  it('tira a versão, inclusive de pacotes com escopo', () => {
    expect(packageName('codearena-plugin-x@1.2.0')).toBe('codearena-plugin-x');
    expect(packageName('@org/plugin@^2')).toBe('@org/plugin');
    expect(packageName('@org/plugin')).toBe('@org/plugin');
  });
});

describe('codearena plugins', () => {
  it('add com pacote já instalado: confere o manifesto, grava a configuração e roda o build', async () => {
    await plugin(join(dir, 'node_modules'), 'codearena-plugin-eletrica', manifest('eletrica'));
    expect(await run('plugins', 'add', 'codearena-plugin-eletrica@1.0.0', '--no-install')).toBe(0);
    expect((await config()).plugins).toEqual(['codearena-plugin-eletrica']);
    expect(calls).toEqual(['pnpm run build']);
  });

  it('add instala o pacote com pnpm na raiz', async () => {
    // Como se o "pnpm add" já tivesse colocado o pacote em node_modules.
    await plugin(join(dir, 'node_modules'), 'codearena-plugin-quimica', manifest('quimica'));
    expect(await run('plugins', 'add', 'codearena-plugin-quimica', '--no-build')).toBe(0);
    expect(calls).toEqual(['pnpm add -w codearena-plugin-quimica']);
    expect((await config()).plugins).toEqual(['codearena-plugin-quimica']);
  });

  it('add recusa SDK incompatível, desfaz a instalação e não mexe na configuração', async () => {
    await plugin(join(dir, 'node_modules'), 'codearena-plugin-futuro', manifest('futuro', '^9.0.0'));
    await writeFile(join(dir, 'codearena.config.json'), JSON.stringify({ plugins: [] }));
    expect(await run('plugins', 'add', 'codearena-plugin-futuro')).toBe(1);
    expect(calls).toEqual(['pnpm add -w codearena-plugin-futuro', 'pnpm remove -w codearena-plugin-futuro']);
    expect(output.join('\n')).toMatch(/requer o SDK \^9\.0\.0/);
    expect((await config()).plugins).toEqual([]);
  });

  it('add recusa pluginId repetido', async () => {
    await plugin(join(dir, 'node_modules'), 'a', manifest('mesmo-id'));
    await plugin(join(dir, 'node_modules'), 'b', manifest('mesmo-id'));
    await writeFile(join(dir, 'codearena.config.json'), JSON.stringify({ plugins: ['a'] }));
    expect(await run('plugins', 'add', 'b', '--no-install', '--no-build')).toBe(1);
    expect(output.join('\n')).toMatch(/já é usado por "a"/);
    expect((await config()).plugins).toEqual(['a']);
  });

  it('add com caminho local não instala nada', async () => {
    await plugin(join(dir, 'plugins'), 'meu', manifest('meu'));
    expect(await run('plugins', 'add', './plugins/meu', '--no-build')).toBe(0);
    expect(calls).toEqual([]);
    expect((await config()).plugins).toEqual(['./plugins/meu']);
  });

  it('remove pelo pluginId, desinstala e preserva os outros campos', async () => {
    await plugin(join(dir, 'node_modules'), 'codearena-plugin-eletrica', manifest('eletrica'));
    await plugin(join(dir, 'node_modules'), 'outro', manifest('outro'));
    await writeFile(join(dir, 'codearena.config.json'), JSON.stringify({ $schema: 'x', plugins: ['codearena-plugin-eletrica', 'outro'] }));
    expect(await run('plugins', 'remove', 'eletrica')).toBe(0);
    expect(await config()).toEqual({ $schema: 'x', plugins: ['outro'] });
    expect(calls).toEqual(['pnpm remove -w codearena-plugin-eletrica', 'pnpm run build']);
  });

  it('list mostra plugins e problemas', async () => {
    await plugin(join(dir, 'node_modules'), 'ok', manifest('ok'));
    await writeFile(join(dir, 'codearena.config.json'), JSON.stringify({ plugins: ['ok', 'faltando'] }));
    expect(await run('plugins', 'list')).toBe(1);
    expect(output[0]).toMatch(/^ok\s+ok\s+ok@1\.0\.0/);
    expect(output[1]).toMatch(/^ERRO.*faltando/);
  });

  it('sem argumentos mostra a ajuda', async () => {
    expect(await run()).toBe(0);
    expect(await run('plugins', 'add')).toBe(1);
    expect(output.join('\n')).toMatch(/Uso:/);
  });
});
