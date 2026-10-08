/**
 * Remove comentários `//` e `/* *\/` de código JS/TS, preservando strings
 * ('...', "...", `...`) e quebras de linha. Não interpreta regex literais nem texto JSX:
 * por isso a opção `ignoreComments` das regras é opt-in.
 */
export function stripComments(code: string): string {
  let out = '';
  let i = 0;
  const n = code.length;
  while (i < n) {
    const ch = code[i]!;
    const next = code[i + 1];
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      out += ch;
      i++;
      while (i < n) {
        const c = code[i]!;
        out += c;
        i++;
        if (c === '\\' && i < n) {
          out += code[i];
          i++;
          continue;
        }
        if (c === quote) break;
        if (c === '\n' && quote !== '`') break;
      }
      continue;
    }
    if (ch === '/' && next === '/') {
      while (i < n && code[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && next === '*') {
      i += 2;
      while (i < n && !(code[i] === '*' && code[i + 1] === '/')) {
        if (code[i] === '\n') out += '\n';
        i++;
      }
      i += 2;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}
