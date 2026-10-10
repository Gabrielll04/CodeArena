import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateChecklist } from '@codearena/core';
import type { PublicQuestion } from '@codearena/schemas';
import { createPluginHandler, createPluginProxy, describePlugin } from '../src/isolation.mjs';
import { startIsolatedPlugin, type IsolatedPluginProcess } from '../src/isolated-node.mjs';

let base: string;
let secretFile: string;
let isolated: IsolatedPluginProcess;

/** Plugin "malicioso" de teste: cada validador tenta algo que o modo isolado precisa impedir. */
const FIXTURE = `
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const word = {
  safeParse: (v) => typeof v?.word === 'string'
    ? { success: true, data: v }
    : { success: false, error: { issues: [{ path: ['word'], message: 'obrigatório' }] } },
};
const attempt = (fn) => { try { fn(); return { passed: true, message: 'conseguiu' }; } catch (err) { return { passed: false, message: err.code ?? err.message }; } };

export default {
  id: 'hostil',
  displayName: 'Hostil',
  description: 'teste',
  version: '1.0.0',
  editorLanguage: 'plaintext',
  getStarterCode: (q) => q.starterCode,
  validators: {
    contains: { description: 'contém', mode: 'static', params: word, validate: ({ code, params }) => code.includes(params.word) },
    readSecret: { description: 'lê arquivo', mode: 'static', validate: ({ code }) => attempt(() => readFileSync(code)) },
    writeFile: { description: 'escreve', mode: 'static', validate: ({ code }) => attempt(() => writeFileSync(code, 'x')) },
    spawn: { description: 'processo', mode: 'static', validate: () => attempt(() => execSync('echo oi')) },
    env: { description: 'ambiente', mode: 'static', validate: () => ({ passed: false, message: Object.keys(process.env).join(',') || 'vazio' }) },
    loop: { description: 'trava', mode: 'dynamic', validate: () => { for (;;) {} } },
  },
};
`;

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'codearena-isolated-'));
  await mkdir(join(base, 'plugin'));
  await writeFile(join(base, 'plugin', 'index.mjs'), FIXTURE);
  await mkdir(join(base, 'privado'));
  secretFile = join(base, 'privado', 'segredo.txt');
  await writeFile(secretFile, 'senha');
  process.env.CODEARENA_TEST_SECRET = 'nao-deve-vazar';
  isolated = await startIsolatedPlugin({ entry: join(base, 'plugin', 'index.mjs'), readPaths: [join(base, 'plugin')], callTimeoutMs: 1500 });
}, 30_000);

afterAll(async () => {
  isolated?.dispose();
  delete process.env.CODEARENA_TEST_SECRET;
  await rm(base, { recursive: true, force: true });
});

const question = (validator: string, params: Record<string, unknown> = {}): PublicQuestion =>
  ({
    id: 'q',
    kind: 'build',
    prompt: 'x',
    starterCode: '',
    timeLimitSeconds: 60,
    baseXP: 100,
    speedBonusMax: 100,
    lockOnComplete: true,
    pluginId: 'hostil',
    pluginData: {},
    checklist: [{ id: 'item', label: 'Item', optional: false, rule: { type: 'pluginRule', validator, params } }],
  }) as unknown as PublicQuestion;

const run = (code: string, validator: string, params?: Record<string, unknown>) =>
  evaluateChecklist(code, question(validator, params), { plugin: isolated.plugin }).then((r) => r.items[0]!);

describe('modo isolado no servidor', () => {
  it('descreve o plugin e valida normalmente pelo proxy', async () => {
    expect(isolated.plugin).toMatchObject({ id: 'hostil', isolated: true });
    expect(Object.keys(isolated.plugin.validators ?? {})).toContain('contains');
    expect(await run('ola mundo', 'contains', { word: 'mundo' })).toMatchObject({ status: 'done' });
    expect(await run('ola', 'contains', { word: 'mundo' })).toMatchObject({ status: 'pending' });
  });

  it('confere os parâmetros com o schema do próprio plugin', async () => {
    expect(await run('x', 'contains', {})).toMatchObject({ status: 'failed', message: 'Parâmetros inválidos: word: obrigatório' });
  });

  it('não lê arquivos fora da pasta do plugin', async () => {
    expect(await run(secretFile, 'readSecret')).toMatchObject({ message: 'ERR_ACCESS_DENIED' });
  });

  it('não escreve em disco nem inicia processos', async () => {
    expect(await run(join(base, 'plugin', 'novo.txt'), 'writeFile')).toMatchObject({ message: 'ERR_ACCESS_DENIED' });
    expect(await run('', 'spawn')).toMatchObject({ message: 'ERR_ACCESS_DENIED' });
  });

  it('não recebe as variáveis de ambiente do servidor', async () => {
    const item = await run('', 'env');
    expect(item.message).not.toContain('CODEARENA_TEST_SECRET');
  });

  it('um validador travado vira falha no tempo limite e o plugin volta a responder', async () => {
    expect(await run('', 'loop')).toMatchObject({ status: 'failed', message: expect.stringMatching(/não respondeu/) });
    expect(await run('ola mundo', 'contains', { word: 'mundo' })).toMatchObject({ status: 'done' });
  }, 15_000);

  it('recusa entrada TypeScript (precisa do pacote compilado)', async () => {
    await expect(startIsolatedPlugin({ entry: join(base, 'plugin', 'index.ts'), readPaths: [] })).rejects.toThrow(/compilado/);
  });
});

describe('protocolo de isolamento (sem processo)', () => {
  it('o proxy repassa sessões, validações e a verificação extra', async () => {
    const disposed: unknown[] = [];
    const plugin = {
      id: 'mem',
      displayName: 'Mem',
      description: '',
      version: '1',
      editorLanguage: 'plaintext',
      getStarterCode: () => 'nunca usado pelo proxy',
      createSession: ({ code }: { code: string }) => ({ upper: code.toUpperCase() }),
      disposeSession: (s: unknown) => void disposed.push(s),
      validateSubmission: async (code: string) => ({ valid: code.length > 2, message: 'curto' }),
      validators: { upper: { description: '', mode: 'static' as const, validate: ({ session }: { session: { upper: string } }) => session.upper === 'ABC' } },
    };
    const handle = createPluginHandler(plugin as never);
    const proxy = createPluginProxy(describePlugin(plugin as never), (method, params) => handle(method, JSON.parse(JSON.stringify(params ?? {}))));
    expect(proxy.getStarterCode({ starterCode: 'inicial' } as PublicQuestion)).toBe('inicial');
    const result = await evaluateChecklist('abc', { ...question('upper'), pluginId: 'mem' } as PublicQuestion, { plugin: proxy });
    expect(result.items[0]).toMatchObject({ status: 'done' });
    expect(disposed).toEqual([{ upper: 'ABC' }]);
    expect(await proxy.validateSubmission!('ab', {} as PublicQuestion)).toEqual({ valid: false, message: 'curto' });
  });
});
