/// <reference lib="webworker" />
/**
 * Web Worker que executa o código do aluno no navegador (feedback imediato e cliente HTTP).
 * Roda fora da thread da interface; o app encerra o worker em caso de timeout.
 */
import { loadProgram, type LoadedProgram } from '../runtime/sandbox-runtime.mjs';

declare const self: DedicatedWorkerGlobalScope;

let program: LoadedProgram | null = null;

const SHADOWED = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'indexedDB', 'caches'];

const evaluate = (code: string, scope: Record<string, unknown>) => {
  const names = [...Object.keys(scope), ...SHADOWED];
  const values = [...Object.values(scope), ...SHADOWED.map(() => undefined)];
  new Function(...names, code)(...values);
};

const timers = {
  setTimeout: (fn: () => void, ms: number) => self.setTimeout(fn, ms),
  clearTimeout: (handle: unknown) => self.clearTimeout(handle as number),
  setInterval: (fn: () => void, ms: number) => self.setInterval(fn, ms),
  clearInterval: (handle: unknown) => self.clearInterval(handle as number),
};

self.onmessage = async (event: MessageEvent) => {
  const message = event.data as { type: string; id?: number; code?: string; request?: unknown; requestTimeoutMs?: number };
  if (message.type === 'load') {
    const loaded = await loadProgram(String(message.code ?? ''), {
      evaluate,
      timers,
      requestTimeoutMs: message.requestTimeoutMs ?? 2000,
    });
    program = loaded.ok ? loaded : null;
    const { dispatch: _dispatch, ...rest } = loaded;
    self.postMessage({ type: 'loaded', ...rest });
  } else if (message.type === 'request') {
    const result = program?.dispatch
      ? await program.dispatch(message.request as never)
      : { error: 'not_loaded', message: 'Programa não carregado', durationMs: 0, logs: [] };
    self.postMessage({ type: 'response', id: message.id, result });
  }
};
