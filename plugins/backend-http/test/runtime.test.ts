import { describe, expect, it } from 'vitest';
import { evaluateChecklist } from '@codearena/core';
import { QuestionSchema, type PublicQuestion } from '@codearena/schemas';
import { checkExpectations, compileForRunner, createBackendHttpPlugin, failedSession, type BackendExecutor } from '../src';
import { loadProgram } from '../src/runtime/sandbox-runtime.mjs';
import { createChildProcessExecutor } from '../src/server';

const timers = { setTimeout, clearTimeout, setInterval, clearInterval } as never;
const evaluate = (code: string, scope: Record<string, unknown>) => {
  new Function(...Object.keys(scope), code)(...Object.values(scope));
};

async function load(source: string) {
  const compiled = compileForRunner(source);
  if (!compiled.ok) throw new Error(compiled.error);
  return loadProgram(compiled.code, { evaluate, timers, requestTimeoutMs: 300 });
}

/** Executor no mesmo processo, apenas para testes (sem isolamento). */
const inProcess: BackendExecutor = {
  kind: 'in-process-test',
  async start(code) {
    const program = await loadProgram(code, { evaluate, timers, requestTimeoutMs: 300 });
    if (!program.ok || !program.dispatch) return failedSession({ ok: false, error: program.error });
    const { dispatch, ...loadResult } = program;
    return { load: loadResult, request: dispatch, dispose: () => undefined };
  },
};

describe('runtime Express', () => {
  it('executa rotas, middlewares, params, query, body JSON e status', async () => {
    const program = await load(`
      const express = require('express');
      const app = express();
      app.use(express.json());
      app.use((req, res, next) => { res.set('X-Trace', 'abc'); next(); });
      const router = express.Router();
      router.get('/:id', (req, res) => res.json({ id: req.params.id, q: req.query.q }));
      app.use('/items', router);
      app.post('/echo', (req, res) => res.status(201).json(req.body));
      app.get('/boom', () => { throw new Error('falhou'); });
      app.get('/async', async (req, res) => { await Promise.resolve(); res.sendStatus(204); });
      app.listen(3000, () => console.log('ouvindo'));
    `);
    expect(program.ok).toBe(true);
    expect(program.routes).toEqual([
      { method: 'GET', path: '/items/:id' },
      { method: 'POST', path: '/echo' },
      { method: 'GET', path: '/boom' },
      { method: 'GET', path: '/async' },
    ]);
    const item = await program.dispatch!({ method: 'GET', path: '/items/7?q=x' });
    expect(item.response).toMatchObject({ status: 200, body: '{"id":"7","q":"x"}' });
    expect(item.response!.headers['x-trace']).toBe('abc');
    const echo = await program.dispatch!({ method: 'POST', path: '/echo', body: { a: 1 } });
    expect(echo.response).toMatchObject({ status: 201, body: '{"a":1}' });
    expect((await program.dispatch!({ method: 'GET', path: '/boom' })).response!.status).toBe(500);
    expect((await program.dispatch!({ method: 'GET', path: '/async' })).response!.status).toBe(204);
    expect((await program.dispatch!({ method: 'GET', path: '/nada' })).response).toMatchObject({ status: 404, body: 'Cannot GET /nada' });
  });

  it('sem express.json() o body fica indefinido, como no Express real', async () => {
    const program = await load(`const app = require('express')(); app.post('/x', (req, res) => res.json({ body: req.body ?? null }));`);
    const result = await program.dispatch!({ method: 'POST', path: '/x', body: { a: 1 } });
    expect(result.response!.body).toBe('{"body":null}');
    expect(program.usesJsonParser).toBe(false);
  });

  it('acusa rota que nunca responde', async () => {
    const program = await load(`const app = require('express')(); app.get('/x', (req, res) => {});`);
    const result = await program.dispatch!({ method: 'GET', path: '/x' });
    expect(result.error).toBe('timeout');
    expect(result.message).toMatch(/res\.send/);
  });

  it('bloqueia módulos fora da lista e informa quando nenhum servidor foi criado', async () => {
    expect((await load(`require('fs')`)).error).toMatch(/não está disponível/);
    expect((await load(`const x = 1;`)).error).toMatch(/Nenhum servidor/);
  });

  it('aceita sintaxe ESM e TypeScript', async () => {
    const program = await load(`import express from 'express';\nconst app = express();\napp.get('/t', (req: any, res: any) => res.send('ok'));\nexport default app;`);
    expect((await program.dispatch!({ path: '/t' })).response).toMatchObject({ status: 200, body: 'ok' });
  });
});

describe('runtime Fastify', () => {
  it('responde com retorno de handler async, reply.code e 404 no formato do Fastify', async () => {
    const program = await load(`
      const fastify = require('fastify')({ logger: true });
      fastify.get('/health', async () => ({ status: 'ok' }));
      fastify.post('/items', async (request, reply) => { reply.code(201); return { got: request.body }; });
      fastify.listen({ port: 3000 });
    `);
    expect(program.framework).toBe('fastify');
    expect((await program.dispatch!({ path: '/health' })).response).toMatchObject({ status: 200, body: '{"status":"ok"}' });
    expect((await program.dispatch!({ method: 'POST', path: '/items', body: { a: 1 } })).response).toMatchObject({ status: 201, body: '{"got":{"a":1}}' });
    expect((await program.dispatch!({ path: '/x' })).response!.status).toBe(404);
  });
});

describe('checkExpectations', () => {
  const ok = { response: { status: 200, headers: { 'content-type': 'application/json' }, body: '{"status":"ok","n":1}' }, durationMs: 1, logs: [] };
  it('explica a diferença de status e JSON', () => {
    expect(checkExpectations(ok, { status: 201 }).message).toBe('Esperado status 201, recebido 200');
    expect(checkExpectations(ok, { json: { status: 'ok' } }).passed).toBe(false);
    expect(checkExpectations(ok, { jsonIncludes: { status: 'ok' } }).passed).toBe(true);
    expect(checkExpectations(ok, { headers: { 'Content-Type': 'json' } }).passed).toBe(true);
  });
});

describe('validadores backend-http', () => {
  const question = (checklist: unknown[]): PublicQuestion => {
    const { solution: _s, ...rest } = QuestionSchema.parse({ id: 'q', prompt: 'p', timeLimitSeconds: 60, baseXP: 1, speedBonusMax: 1, checklist });
    return { ...rest, pluginId: 'backend-http' };
  };
  const health = question([
    { id: 'rota', label: 'rota', rule: { type: 'pluginRule', validator: 'httpRouteDefined', params: { method: 'get', path: '/health' } } },
    {
      id: 'ok',
      label: 'ok',
      rule: { type: 'pluginRule', validator: 'httpRequest', params: { request: { path: '/health' }, expect: { status: 200, json: { status: 'ok' } } } },
    },
    {
      id: 'atalho',
      label: 'atalho',
      rule: { type: 'pluginRule', validator: 'httpRequest', params: { method: 'GET', path: '/health', expectStatus: 200 } },
    },
  ]);
  const plugin = createBackendHttpPlugin({ executor: inProcess });

  it('valida comportamento HTTP real do código', async () => {
    const good = await evaluateChecklist(
      `const app = require('express')(); app.get('/health', (q, r) => r.status(200).json({ status: 'ok' }));`,
      health,
      { plugin },
    );
    expect(good.allRequiredDone).toBe(true);
    const bad = await evaluateChecklist(`const app = require('express')(); app.get('/health', (q, r) => r.status(500).send('x'));`, health, { plugin });
    expect(bad.items[1]).toMatchObject({ status: 'failed', message: 'Esperado status 200, recebido 500' });
  });

  it('sem executor, os validadores dinâmicos falham com mensagem explícita', async () => {
    const result = await evaluateChecklist(`const app = require('express')();`, health, { plugin: createBackendHttpPlugin() });
    expect(result.items[1]!.message).toBe('Runner indisponível neste ambiente');
  });

  it('dá dica quando falta express.json()', async () => {
    const q2 = question([
      {
        id: 'echo',
        label: 'echo',
        rule: { type: 'pluginRule', validator: 'httpRequest', params: { request: { method: 'POST', path: '/e', body: { a: 1 } }, expect: { json: { a: 1 } } } },
      },
    ]);
    const result = await evaluateChecklist(`const app = require('express')(); app.post('/e', (q, r) => r.json(q.body ?? {}));`, q2, { plugin });
    expect(result.items[0]!.message).toMatch(/express\.json\(\)/);
  });
});

describe('executor em processo filho (validação oficial do servidor)', () => {
  const executor = createChildProcessExecutor({ loadTimeoutMs: 3000, requestTimeoutMs: 500 });

  it('executa o código isolado e responde requisições', async () => {
    const compiled = compileForRunner(`const app = require('express')(); app.get('/x', (q, r) => r.json({ env: Object.keys(process.env).length }));`);
    if (!compiled.ok) throw new Error(compiled.error);
    const session = await executor.start(compiled.code);
    try {
      expect(session.load.ok).toBe(true);
      const result = await session.request({ path: '/x' });
      expect(result.response).toMatchObject({ status: 200 });
    } finally {
      session.dispose();
    }
  });

  it('nega leitura de arquivos mesmo escapando do contexto vm', async () => {
    const compiled = compileForRunner(`
      let r;
      try { const p = require.constructor('return process')(); p.getBuiltinModule('fs').readFileSync('/etc/hostname', 'utf8'); r = 'leu'; }
      catch (e) { r = e.code || e.message; }
      const app = require('express')(); app.get('/', (q, s) => s.send(r));
    `);
    if (!compiled.ok) throw new Error(compiled.error);
    const session = await executor.start(compiled.code);
    try {
      const result = await session.request({ path: '/' });
      expect(result.response!.body).not.toBe('leu');
    } finally {
      session.dispose();
    }
  });

  it('interrompe loop infinito no carregamento', async () => {
    const session = await executor.start('while (true) {}');
    expect(session.load.ok).toBe(false);
    expect(session.load.error).toMatch(/loop infinito/);
  });
});
