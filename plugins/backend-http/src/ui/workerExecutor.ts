import type { DispatchResult, RequestInput } from '../runtime/sandbox-runtime.mjs';
import { failedSession, type BackendExecutor, type BackendSession, type LoadResult } from '../types';

export interface WorkerExecutorOptions {
  loadTimeoutMs?: number;
  requestTimeoutMs?: number;
}

function createWorker(): Worker {
  return new Worker(new URL('./backend.worker.ts', import.meta.url), { type: 'module', name: 'codearena-backend-runner' });
}

/** Executa o código em um Web Worker descartável por sessão. */
export function createWorkerExecutor(options: WorkerExecutorOptions = {}): BackendExecutor {
  const { loadTimeoutMs = 2500, requestTimeoutMs = 2000 } = options;
  return {
    kind: 'browser-worker',
    async start(code: string): Promise<BackendSession> {
      let worker: Worker;
      try {
        worker = createWorker();
      } catch (err) {
        return failedSession({ ok: false, error: `Não foi possível iniciar o runner: ${(err as Error).message}` });
      }
      let terminated = false;
      let nextId = 1;
      const pending = new Map<number, (result: DispatchResult) => void>();
      const terminate = (reason: string) => {
        if (terminated) return;
        terminated = true;
        worker.terminate();
        for (const resolve of pending.values()) resolve({ error: 'crashed', message: reason, durationMs: 0, logs: [] });
        pending.clear();
      };

      const load = await new Promise<LoadResult>((resolve) => {
        const timer = setTimeout(() => {
          terminate('timeout');
          resolve({
            ok: false,
            error: `O código não terminou de carregar em ${loadTimeoutMs / 1000} s (loop infinito no topo do arquivo?)`,
            logs: [],
            routes: [],
            listening: null,
          });
        }, loadTimeoutMs);
        worker.onmessage = (event: MessageEvent) => {
          const data = event.data as { type: string; id?: number; result?: DispatchResult } & LoadResult;
          if (data.type === 'loaded') {
            clearTimeout(timer);
            const { type: _type, ...rest } = data;
            resolve(rest as LoadResult);
          } else if (data.type === 'response' && typeof data.id === 'number') {
            pending.get(data.id)?.(data.result!);
            pending.delete(data.id);
          }
        };
        worker.onerror = (event) => {
          clearTimeout(timer);
          event.preventDefault();
          terminate(event.message);
          resolve({ ok: false, error: event.message || 'Erro no runner', logs: [], routes: [], listening: null });
        };
        worker.postMessage({ type: 'load', code, requestTimeoutMs });
      });

      if (!load.ok) {
        terminate('load failed');
        return failedSession(load);
      }

      return {
        load,
        request: (input: RequestInput) =>
          new Promise<DispatchResult>((resolve) => {
            if (terminated) {
              resolve({ error: 'crashed', message: 'O runner foi encerrado. Envie novamente.', durationMs: 0, logs: [] });
              return;
            }
            const id = nextId++;
            const timer = setTimeout(() => {
              pending.delete(id);
              terminate('timeout');
              resolve({
                error: 'timeout',
                message: 'A requisição travou o runner (loop infinito?). O servidor foi reiniciado.',
                durationMs: requestTimeoutMs,
                logs: [],
              });
            }, requestTimeoutMs + 1000);
            pending.set(id, (result) => {
              clearTimeout(timer);
              resolve(result);
            });
            worker.postMessage({ type: 'request', id, request: input });
          }),
        dispose: () => terminate('disposed'),
      };
    },
  };
}
