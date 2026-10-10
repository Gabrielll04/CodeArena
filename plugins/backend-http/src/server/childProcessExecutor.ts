import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { DispatchResult, RequestInput } from '../runtime/sandbox-runtime.mjs';
import { failedSession, type BackendExecutor, type BackendSession, type LoadResult } from '../types';

// Código-fonte: src/server -> src/runtime. Pacote publicado: dist/server.js -> dist/runtime.
const runnerPath = [new URL('./runtime/runner.mjs', import.meta.url), new URL('../runtime/runner.mjs', import.meta.url)]
  .map((url) => fileURLToPath(url))
  .find((path) => existsSync(path))!;
const runtimeDir = dirname(runnerPath);

export interface ChildProcessExecutorOptions {
  /** Processos simultâneos (validações concorrentes). */
  maxConcurrent?: number;
  loadTimeoutMs?: number;
  requestTimeoutMs?: number;
  /** Vida máxima de um processo, independentemente do que esteja fazendo. */
  sessionTimeoutMs?: number;
  memoryLimitMb?: number;
}

/** Flags do modelo de permissões do Node (Node >= 22.13 usa --permission; versões antigas, --experimental-permission). */
export function permissionFlags(): string[] {
  const flags = process.allowedNodeEnvironmentFlags;
  if (flags.has('--permission')) return ['--permission', `--allow-fs-read=${runtimeDir}`];
  if (flags.has('--experimental-permission')) return ['--experimental-permission', `--allow-fs-read=${runtimeDir}`];
  return [];
}

class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active >= this.max) await new Promise<void>((resolve) => this.queue.push(resolve));
    this.active++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active--;
      this.queue.shift()?.();
    };
  }
}

/**
 * Executa o código do aluno em um processo Node filho por sessão, com permissões restritas,
 * ambiente vazio, limite de memória e tempo. Usado pelo servidor na validação oficial.
 */
export function createChildProcessExecutor(options: ChildProcessExecutorOptions = {}): BackendExecutor {
  const {
    maxConcurrent = 4,
    loadTimeoutMs = 3000,
    requestTimeoutMs = 2000,
    sessionTimeoutMs = 15000,
    memoryLimitMb = 64,
  } = options;
  const semaphore = new Semaphore(maxConcurrent);
  const flags = permissionFlags();

  return {
    kind: 'node-child-process',
    async start(code: string): Promise<BackendSession> {
      const release = await semaphore.acquire();
      let child: ChildProcessWithoutNullStreams;
      try {
        child = spawn(process.execPath, [...flags, `--max-old-space-size=${memoryLimitMb}`, runnerPath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {},
          cwd: runtimeDir,
        });
      } catch (err) {
        release();
        return failedSession({ ok: false, error: `Não foi possível iniciar o runner: ${(err as Error).message}` });
      }

      let exited = false;
      let nextId = 1;
      const pending = new Map<number, (result: DispatchResult) => void>();
      let onLoaded: ((load: LoadResult) => void) | null = null;
      let stderr = '';

      const lifetime = setTimeout(() => child.kill('SIGKILL'), sessionTimeoutMs);
      const finish = (reason: string) => {
        if (exited) return;
        exited = true;
        clearTimeout(lifetime);
        release();
        onLoaded?.({ ok: false, error: reason, logs: [], routes: [], listening: null });
        for (const resolve of pending.values()) resolve({ error: 'crashed', message: reason, durationMs: 0, logs: [] });
        pending.clear();
      };

      child.stderr.on('data', (chunk: Buffer) => {
        if (stderr.length < 4000) stderr += chunk.toString();
      });
      child.on('error', (err) => finish(`Falha no runner: ${err.message}`));
      child.on('exit', (codeOrNull, signal) => {
        const memory = /heap out of memory|Allocation failed/i.test(stderr);
        finish(
          memory
            ? 'O código excedeu o limite de memória do runner'
            : signal === 'SIGKILL'
              ? 'O código excedeu o tempo limite do runner (loop infinito?)'
              : `O runner terminou inesperadamente (código ${codeOrNull ?? signal})`,
        );
      });

      createInterface({ input: child.stdout }).on('line', (line) => {
        let message: { type: string; id?: number; result?: DispatchResult } & Partial<LoadResult>;
        try {
          message = JSON.parse(line);
        } catch {
          return;
        }
        if (message.type === 'loaded' && onLoaded) {
          const { type: _type, ...load } = message;
          onLoaded(load as LoadResult);
        } else if (message.type === 'response' && typeof message.id === 'number') {
          pending.get(message.id)?.(message.result!);
          pending.delete(message.id);
        }
      });

      const send = (payload: unknown) => {
        if (!exited) child.stdin.write(`${JSON.stringify(payload)}\n`);
      };

      const load = await new Promise<LoadResult>((resolve) => {
        const timer = setTimeout(() => child.kill('SIGKILL'), loadTimeoutMs);
        onLoaded = (result) => {
          clearTimeout(timer);
          onLoaded = null;
          resolve(result);
        };
        send({ type: 'load', code, requestTimeoutMs });
      });

      const dispose = () => {
        if (!exited) {
          child.stdin.end();
          child.kill('SIGKILL');
        }
      };

      if (!load.ok) {
        dispose();
        return failedSession(load);
      }

      return {
        load,
        request: (input: RequestInput) =>
          new Promise<DispatchResult>((resolve) => {
            if (exited) {
              resolve({ error: 'crashed', message: 'O runner já foi encerrado', durationMs: 0, logs: [] });
              return;
            }
            const id = nextId++;
            const timer = setTimeout(() => {
              pending.delete(id);
              child.kill('SIGKILL');
              resolve({ error: 'timeout', message: 'A requisição excedeu o tempo limite (loop infinito?)', durationMs: requestTimeoutMs, logs: [] });
            }, requestTimeoutMs + 1000);
            pending.set(id, (result) => {
              clearTimeout(timer);
              resolve(result);
            });
            send({ type: 'request', id, request: input });
          }),
        dispose,
      };
    },
  };
}
