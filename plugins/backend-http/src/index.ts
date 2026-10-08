import { parse } from '@babel/parser';
import { z } from 'zod';
import {
  definePlugin,
  escapeRegExp,
  jsonContains,
  jsonEqual,
  type ChecklistValidator,
  type QuizPlugin,
} from '@codearena/plugin-sdk';
import type { PublicQuestion } from '@codearena/schemas';
import { compileForRunner } from './compile';
import { failedSession, type BackendExecutor, type BackendSession, type DispatchResult } from './types';

export * from './types';
export { compileForRunner } from './compile';

export const BACKEND_HTTP_PLUGIN_ID = 'backend-http';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export const HttpRequestSpecSchema = z.object({
  method: z
    .string()
    .transform((m) => m.toUpperCase())
    .pipe(z.enum(HTTP_METHODS))
    .default('GET'),
  path: z.string().startsWith('/', 'path deve começar com "/"'),
  headers: z.record(z.string()).default({}),
  query: z.record(z.string()).optional(),
  body: z.unknown().optional(),
});
export type HttpRequestSpec = z.infer<typeof HttpRequestSpecSchema>;

export const HttpExpectSchema = z
  .object({
    status: z.number().int().min(100).max(599).optional(),
    /** Body JSON idêntico (comparação profunda). */
    json: z.unknown().optional(),
    /** Body JSON contém estes campos (comparação parcial). */
    jsonIncludes: z.unknown().optional(),
    bodyContains: z.string().optional(),
    /** Cabeçalhos esperados; o valor recebido precisa conter o valor informado. */
    headers: z.record(z.string()).optional(),
  })
  .refine((e) => Object.values(e).some((v) => v !== undefined), 'expect precisa de pelo menos um critério');
export type HttpExpect = z.infer<typeof HttpExpectSchema>;

/** Aceita o formato completo ({ request, expect }) e o atalho ({ method, path, expectStatus, expectJson }). */
export const HttpRequestParamsSchema = z.preprocess(
  (raw) => {
    if (!raw || typeof raw !== 'object' || 'request' in raw) return raw;
    const r = raw as Record<string, unknown>;
    return {
      request: { method: r.method, path: r.path, headers: r.headers, query: r.query, body: r.body },
      expect: { status: r.expectStatus, json: r.expectJson, jsonIncludes: r.expectJsonIncludes, bodyContains: r.expectBodyContains },
      setup: r.setup,
    };
  },
  z.object({
    request: HttpRequestSpecSchema,
    expect: HttpExpectSchema,
    /** Requisições executadas antes (ex.: criar um recurso antes de listá-lo). */
    setup: z.array(HttpRequestSpecSchema).max(10).optional(),
  }),
);
export type HttpRequestParams = z.infer<typeof HttpRequestParamsSchema>;

export interface BackendSessionState {
  syntaxError: string | null;
  runtime: BackendSession | null;
}

type V<P> = ChecklistValidator<P, BackendSessionState>;

function truncate(text: string, max = 160): string {
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

/** Compara uma resposta com as expectativas e explica a diferença em linguagem direta. */
export function checkExpectations(
  result: DispatchResult,
  expect: HttpExpect,
  hint?: string,
): { passed: boolean; message?: string } {
  if (!result.response) return { passed: false, message: result.message ?? 'Sem resposta' };
  const { status, body, headers } = result.response;
  const withHint = (message: string) => ({ passed: false, message: hint ? `${message}. ${hint}` : message });
  if (expect.status !== undefined && status !== expect.status) {
    return withHint(`Esperado status ${expect.status}, recebido ${status}`);
  }
  if (expect.json !== undefined || expect.jsonIncludes !== undefined) {
    let data: unknown;
    try {
      data = JSON.parse(body);
    } catch {
      return withHint(`A resposta não é JSON válido: ${truncate(body || '(vazio)')}`);
    }
    if (expect.json !== undefined && !jsonEqual(data, expect.json)) {
      return withHint(`JSON diferente do esperado. Recebido: ${truncate(JSON.stringify(data))}`);
    }
    if (expect.jsonIncludes !== undefined && !jsonContains(data, expect.jsonIncludes)) {
      return withHint(`O JSON não contém ${truncate(JSON.stringify(expect.jsonIncludes))}. Recebido: ${truncate(JSON.stringify(data))}`);
    }
  }
  if (expect.bodyContains !== undefined && !body.includes(expect.bodyContains)) {
    return withHint(`O body não contém "${expect.bodyContains}"`);
  }
  for (const [name, value] of Object.entries(expect.headers ?? {})) {
    const actual = headers[name.toLowerCase()];
    if (!actual || !actual.toLowerCase().includes(value.toLowerCase())) {
      return withHint(`Cabeçalho ${name} esperado contendo "${value}", recebido "${actual ?? '(ausente)'}"`);
    }
  }
  return { passed: true };
}

function runtimeUnavailable(state: BackendSessionState): { passed: false; message: string } | null {
  if (state.syntaxError) return { passed: false, message: state.syntaxError };
  if (!state.runtime) return { passed: false, message: 'Runner indisponível neste ambiente' };
  if (!state.runtime.load.ok) return { passed: false, message: `Erro ao iniciar o servidor: ${state.runtime.load.error}` };
  return null;
}

/** Extrai as requisições usadas por regras httpRequest de uma questão (atalhos no cliente HTTP). */
export function requestPresets(question: PublicQuestion): HttpRequestSpec[] {
  const presets: HttpRequestSpec[] = [];
  for (const item of question.checklist) {
    if (item.rule.type !== 'pluginRule' || item.rule.validator !== 'httpRequest') continue;
    const parsed = HttpRequestParamsSchema.safeParse(item.rule.params);
    if (!parsed.success) continue;
    const { request } = parsed.data;
    if (!presets.some((p) => p.method === request.method && p.path === request.path)) presets.push(request);
  }
  return presets;
}

const validators = {
  backendCompiles: {
    description: 'O código não tem erros de sintaxe.',
    mode: 'static',
    exampleParams: {},
    validate: ({ code }) => {
      try {
        parse(code, { sourceType: 'unambiguous', plugins: ['typescript'] });
        return true;
      } catch (err) {
        const e = err as Error & { loc?: { line: number } };
        return { passed: false, message: `Erro de sintaxe${e.loc ? ` na linha ${e.loc.line}` : ''}` };
      }
    },
  } satisfies V<unknown>,

  httpRequest: {
    description:
      'Executa o código, envia uma requisição HTTP e compara status, JSON, texto e cabeçalhos da resposta com o esperado.',
    mode: 'dynamic',
    params: HttpRequestParamsSchema,
    exampleParams: {
      request: { method: 'GET', path: '/health' },
      expect: { status: 200, json: { status: 'ok' } },
    },
    validate: async ({ session, params }) => {
      const unavailable = runtimeUnavailable(session);
      if (unavailable) return unavailable;
      const runtime = session.runtime!;
      for (const step of params.setup ?? []) {
        const setupResult = await runtime.request(step);
        if (!setupResult.response) {
          return { passed: false, message: `Preparação ${step.method} ${step.path} falhou: ${setupResult.message}` };
        }
      }
      const result = await runtime.request(params.request);
      const sendsJsonBody = params.request.body !== undefined && typeof params.request.body !== 'string';
      const hint =
        sendsJsonBody && runtime.load.framework === 'express' && !runtime.load.usesJsonParser
          ? 'Dica: use app.use(express.json()) para ler o body JSON'
          : undefined;
      return checkExpectations(result, params.expect, hint);
    },
  } satisfies V<HttpRequestParams>,

  httpRouteDefined: {
    description: 'Executa o código e verifica se a rota (método + caminho) foi registrada.',
    mode: 'dynamic',
    params: z.object({
      method: z
        .string()
        .transform((m) => m.toUpperCase())
        .pipe(z.enum(HTTP_METHODS)),
      path: z.string().startsWith('/'),
    }),
    exampleParams: { method: 'GET', path: '/health' },
    validate: ({ session, params }) => {
      const unavailable = runtimeUnavailable(session);
      if (unavailable) return unavailable;
      const found = session.runtime!.load.routes.some(
        (r) => (r.method === params.method || r.method === 'ALL') && r.path === params.path,
      );
      return found ? true : { passed: false, message: `Rota ${params.method} ${params.path} não encontrada` };
    },
  } satisfies V<{ method: string; path: string }>,
};

export type BackendValidatorName = keyof typeof validators;

const DEFAULT_STARTER = `const express = require('express');
const app = express();
app.use(express.json());

// escreva suas rotas aqui

app.listen(3000);
`;

export interface BackendHttpPluginOptions {
  /** Ambiente de execução. Sem executor, validadores dinâmicos falham com mensagem explícita. */
  executor?: BackendExecutor;
}

function needsRuntime(question: PublicQuestion): boolean {
  return question.checklist.some(
    (item) =>
      item.rule.type === 'pluginRule' &&
      validators[item.rule.validator as BackendValidatorName]?.mode === 'dynamic',
  );
}

export function createBackendHttpPlugin(options: BackendHttpPluginOptions = {}): QuizPlugin<BackendSessionState> {
  return definePlugin<QuizPlugin<BackendSessionState>>({
    id: BACKEND_HTTP_PLUGIN_ID,
    displayName: 'Backend HTTP',
    description: 'Servidores Node (Express ou Fastify) validados por requisições HTTP reais ao código do aluno.',
    version: '1.0.0',
    editorLanguage: 'javascript',
    editorFileName: 'server.js',
    getStarterCode: (question) => question.starterCode,
    createSession: async ({ code, question, modes }) => {
      if (!modes.has('dynamic') || !needsRuntime(question)) return { syntaxError: null, runtime: null };
      const compiled = compileForRunner(code);
      if (!compiled.ok) return { syntaxError: compiled.error, runtime: null };
      if (!options.executor) return { syntaxError: null, runtime: null };
      return { syntaxError: null, runtime: await options.executor.start(compiled.code) };
    },
    disposeSession: (state) => state.runtime?.dispose(),
    validators,
    authoring: {
      defaultStarterCode: DEFAULT_STARTER,
      docsPath: 'docs/agents/plugin-backend-http.md',
      regexHelpers: [
        {
          id: 'creates-route',
          label: 'Cria rota',
          inputLabel: 'MÉTODO /caminho',
          defaultInput: 'GET /health',
          build: (input) => {
            const [method = 'GET', path = '/'] = input.trim().split(/\s+/);
            const m = method.toLowerCase();
            return {
              pattern: `\\.${escapeRegExp(m)}\\(\\s*["'\`]${escapeRegExp(path)}["'\`]`,
              label: `Criar rota ${method.toUpperCase()} ${path}`,
            };
          },
        },
        {
          id: 'returns-status',
          label: 'Retorna status',
          inputLabel: 'Status',
          defaultInput: '200',
          build: (status) => ({
            pattern: `\\.(status|code|sendStatus)\\(\\s*${escapeRegExp(status)}\\s*\\)`,
            label: `Retornar status ${status}`,
          }),
        },
        {
          id: 'uses-json-parser',
          label: 'Lê body JSON (express.json)',
          build: () => ({ pattern: `express\\.json\\(\\s*\\)`, label: 'Usar express.json() para ler o body' }),
        },
      ],
    },
  });
}

/** Instância sem executor, útil para documentação, lint e validação estática. */
export const backendHttpPlugin = createBackendHttpPlugin();
export default backendHttpPlugin;

export { failedSession };
