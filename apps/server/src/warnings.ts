/**
 * O node:sqlite (salas abertas em codearena.db) avisa que é experimental toda vez que o servidor sobe. O aviso não
 * ajuda quem roda o CodeArena, então é filtrado; os outros avisos continuam aparecendo. Precisa rodar antes de o
 * node:sqlite ser carregado (ver index.ts).
 */
const emitWarning = process.emitWarning.bind(process);
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const message = typeof warning === 'string' ? warning : warning.message;
  if (/SQLite is an experimental feature/.test(message)) return;
  return (emitWarning as (...args: unknown[]) => void)(warning, ...rest);
}) as typeof process.emitWarning;

export {};
