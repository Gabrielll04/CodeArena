export interface LogEntry {
  level: 'log' | 'info' | 'warn' | 'error' | 'debug';
  message: string;
}

export interface RouteInfo {
  method: string;
  path: string;
}

export interface RequestInput {
  method?: string;
  path?: string;
  url?: string;
  headers?: Record<string, string>;
  query?: Record<string, string>;
  body?: unknown;
}

export interface HttpResponseData {
  status: number;
  headers: Record<string, string>;
  body: string;
}

export interface DispatchResult {
  response?: HttpResponseData;
  error?: 'timeout' | 'exception' | 'crashed' | 'not_loaded';
  message?: string;
  durationMs: number;
  logs: LogEntry[];
}

export interface LoadedProgram {
  ok: boolean;
  error: string | null;
  logs: LogEntry[];
  routes: RouteInfo[];
  listening: { port: number } | null;
  framework?: 'express' | 'fastify';
  usesJsonParser?: boolean;
  dispatch: ((input: RequestInput) => Promise<DispatchResult>) | null;
}

export interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
}

export function loadProgram(
  compiledCode: string,
  options: {
    evaluate: (code: string, scope: Record<string, unknown>) => void;
    timers: Timers;
    randomUUID?: () => string;
    requestTimeoutMs?: number;
  },
): Promise<LoadedProgram>;

export function compilePath(
  pattern: string,
): (pathname: string, prefix?: boolean) => { params: Record<string, string>; rest: string } | null;

export function normalizeRequest(input: RequestInput): {
  method: string;
  path: string;
  url: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string | undefined;
};

export function formatError(err: unknown): string;
