import type { DispatchResult, LogEntry, RequestInput, RouteInfo } from './runtime/sandbox-runtime.mjs';

export type { DispatchResult, HttpResponseData, LogEntry, RequestInput, RouteInfo } from './runtime/sandbox-runtime.mjs';

export interface LoadResult {
  ok: boolean;
  error: string | null;
  /** Linha do erro de sintaxe, quando houver. */
  line?: number | null;
  logs: LogEntry[];
  routes: RouteInfo[];
  listening: { port: number } | null;
  framework?: 'express' | 'fastify';
  usesJsonParser?: boolean;
}

/** Uma execução do código do aluno, capaz de responder várias requisições (estado compartilhado). */
export interface BackendSession {
  load: LoadResult;
  request(input: RequestInput): Promise<DispatchResult>;
  dispose(): void;
}

/** Ambiente que executa o código: Web Worker no navegador, processo filho no servidor. */
export interface BackendExecutor {
  /** `kind` aparece na interface para deixar claro onde o código roda. */
  readonly kind: 'browser-worker' | 'node-child-process' | 'in-process-test';
  start(code: string): Promise<BackendSession>;
}

export function failedSession(load: Omit<LoadResult, 'logs' | 'routes' | 'listening'> & Partial<LoadResult>): BackendSession {
  const full: LoadResult = { logs: [], routes: [], listening: null, ...load };
  return {
    load: full,
    request: async () => ({ error: 'not_loaded', message: full.error ?? 'Programa não carregado', durationMs: 0, logs: [] }),
    dispose: () => undefined,
  };
}
