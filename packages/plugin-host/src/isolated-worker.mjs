/**
 * Processo filho do modo isolado no servidor. Importa o plugin (só código JavaScript já compilado) e responde
 * às chamadas pelo canal IPC. Roda com o modelo de permissões do Node: sem escrita em disco, sem processos
 * filhos, sem workers, leitura só das pastas do plugin, ambiente vazio e memória limitada.
 */
import { pathToFileURL } from 'node:url';
import { createPluginHandler } from './isolation.mjs';

// Saída do plugin não pode se misturar ao protocolo; vai para stderr, que o servidor descarta ou registra.
for (const method of ['log', 'info', 'warn', 'error', 'debug']) console[method] = (...args) => process.stderr.write(`${args.join(' ')}\n`);

// Se o servidor cair, o processo do plugin não fica órfão.
process.on('disconnect', () => process.exit(0));

const entry = process.argv[2];
let handle;

try {
  const mod = await import(pathToFileURL(entry).href);
  const value = typeof mod.default === 'function' ? await mod.default() : mod.default;
  if (!value || typeof value !== 'object') throw new Error('a entrada não tem export default com o plugin.');
  handle = createPluginHandler(value);
  process.send({ type: 'ready' });
} catch (err) {
  process.send({ type: 'fatal', error: err?.message ?? String(err) });
  process.exit(1);
}

process.on('message', async (message) => {
  if (!message || typeof message.id !== 'number') return;
  try {
    const result = await handle(message.method, message.params);
    process.send({ id: message.id, result: result ?? null });
  } catch (err) {
    process.send({ id: message.id, error: err?.message ?? String(err) });
  }
});
