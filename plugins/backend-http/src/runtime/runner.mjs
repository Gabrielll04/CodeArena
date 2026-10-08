/**
 * Processo filho que executa o código do aluno para validação oficial no servidor.
 *
 * Isolamento (em camadas):
 *  1. processo separado, iniciado com o modelo de permissões do Node (--permission):
 *     sem escrita/leitura de arquivos fora desta pasta, sem child_process, sem workers;
 *  2. variáveis de ambiente vazias (nenhum segredo do servidor é herdado);
 *  3. limite de memória (--max-old-space-size) e tempo total (o pai mata o processo);
 *  4. código executado num contexto vm separado, com timeout para o carregamento síncrono
 *     e sem eval/new Function dentro do contexto;
 *  5. APIs de rede globais (fetch, WebSocket) removidas.
 *
 * Protocolo: JSON por linha em stdin/stdout.
 *  -> {"type":"load","code":"...","requestTimeoutMs":2000}
 *  <- {"type":"loaded","ok":true,"routes":[...],"logs":[...]}
 *  -> {"type":"request","id":1,"request":{"method":"GET","path":"/health"}}
 *  <- {"type":"response","id":1,"result":{...}}
 */
import vm from 'node:vm';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { loadProgram } from './sandbox-runtime.mjs';

for (const key of ['fetch', 'WebSocket', 'EventSource', 'XMLHttpRequest', 'Request', 'Response']) {
  try {
    delete globalThis[key];
  } catch {
    // ignorado
  }
}

const out = process.stdout;
const send = (message) => out.write(`${JSON.stringify(message)}\n`);
const timers = { setTimeout, clearTimeout, setInterval, clearInterval };

const evaluate = (code, scope) => {
  const context = vm.createContext({ ...scope }, { codeGeneration: { strings: false, wasm: false } });
  try {
    new vm.Script(code, { filename: 'server.js' }).runInContext(context, { timeout: 1000 });
  } catch (err) {
    if (err && err.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') {
      throw new Error('O código não terminou de carregar em 1 s (loop infinito no topo do arquivo?)');
    }
    throw err;
  }
};

let program = null;
const rl = readline.createInterface({ input: process.stdin });

rl.on('line', async (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }
  if (message.type === 'load') {
    const loaded = await loadProgram(String(message.code ?? ''), {
      evaluate,
      timers,
      randomUUID,
      requestTimeoutMs: Number(message.requestTimeoutMs ?? 2000),
    });
    program = loaded.ok ? loaded : null;
    const { dispatch: _dispatch, ...rest } = loaded;
    send({ type: 'loaded', ...rest });
  } else if (message.type === 'request') {
    if (!program) {
      send({ type: 'response', id: message.id, result: { error: 'not_loaded', message: 'Programa não carregado', durationMs: 0, logs: [] } });
      return;
    }
    const result = await program.dispatch(message.request ?? {});
    send({ type: 'response', id: message.id, result });
  }
});

rl.on('close', () => process.exit(0));
