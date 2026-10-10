/**
 * Modo isolado no servidor: o plugin roda num processo Node filho com permissões restritas e o servidor
 * conversa com ele por IPC (ver isolated-worker.mjs). Um processo travado (laço infinito) é encerrado no
 * tempo limite e reiniciado na próxima chamada.
 */
import { spawn } from 'node:child_process';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPluginProxy } from './isolation.mjs';

const workerPath = fileURLToPath(new URL('./isolated-worker.mjs', import.meta.url));

function permissionFlags(readPaths) {
  const reads = [dirname(workerPath), ...readPaths].map((p) => `--allow-fs-read=${p}`);
  if (process.allowedNodeEnvironmentFlags.has('--permission')) return ['--permission', ...reads];
  if (process.allowedNodeEnvironmentFlags.has('--experimental-permission')) return ['--experimental-permission', ...reads];
  throw new Error('o modo isolado precisa do modelo de permissões do Node (Node 22.13 ou mais novo).');
}

/**
 * @param {{ entry: string; readPaths: string[]; memoryLimitMb?: number; callTimeoutMs?: number; startTimeoutMs?: number; log?: (m: string) => void }} options
 */
export async function startIsolatedPlugin(options) {
  const { entry, readPaths, memoryLimitMb = 128, callTimeoutMs = 5000, startTimeoutMs = 15000, log } = options;
  if (!/\.(m?js|cjs)$/.test(entry)) {
    throw new Error('o modo isolado precisa do pacote compilado (entrada .js); rode o build do plugin.');
  }
  const flags = permissionFlags(readPaths);
  let worker = null;
  let nextId = 1;

  function startWorker() {
    const child = spawn(process.execPath, [...flags, `--max-old-space-size=${memoryLimitMb}`, workerPath, entry], {
      stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      env: {},
      cwd: dirname(entry),
    });
    const pending = new Map();
    const state = { child, pending, ready: null, alive: true };
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => log?.(`[plugin isolado] ${String(chunk).trim()}`));
    state.ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`o plugin não iniciou em ${startTimeoutMs / 1000} s.`));
      }, startTimeoutMs);
      child.on('message', (message) => {
        if (message?.type === 'ready') {
          clearTimeout(timer);
          resolve();
        } else if (message?.type === 'fatal') {
          clearTimeout(timer);
          reject(new Error(message.error));
        } else if (typeof message?.id === 'number') {
          const call = pending.get(message.id);
          if (!call) return;
          pending.delete(message.id);
          if ('error' in message) call.reject(new Error(message.error));
          else call.resolve(message.result);
        }
      });
      child.on('exit', (code, signal) => {
        clearTimeout(timer);
        state.alive = false;
        if (worker === state) worker = null;
        const reason = new Error(`o processo do plugin terminou (${signal ?? `código ${code}`}).`);
        reject(reason);
        for (const call of pending.values()) call.reject(reason);
        pending.clear();
      });
    });
    return state;
  }

  async function call(method, params) {
    if (!worker || !worker.alive) worker = startWorker();
    const current = worker;
    await current.ready;
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        current.pending.delete(id);
        // Um validador travado prende o processo inteiro: encerra; a próxima chamada inicia outro.
        current.alive = false;
        if (worker === current) worker = null;
        current.child.kill('SIGKILL');
        reject(new Error(`O plugin não respondeu em ${callTimeoutMs / 1000} s.`));
      }, callTimeoutMs);
      current.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      current.child.send({ id, method, params });
    });
  }

  const description = await call('describe');
  return {
    plugin: createPluginProxy(description, call),
    dispose: () => {
      worker?.child.kill('SIGKILL');
      worker = null;
    },
  };
}
