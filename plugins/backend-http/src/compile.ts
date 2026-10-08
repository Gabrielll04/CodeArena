import { parse } from '@babel/parser';
import { transform } from 'sucrase';

export type CompileResult = { ok: true; code: string } | { ok: false; error: string; line: number | null };

/** Valida a sintaxe (Babel) e converte ESM/TypeScript para CommonJS (sucrase), formato aceito pelo runner. */
export function compileForRunner(source: string): CompileResult {
  try {
    parse(source, { sourceType: 'unambiguous', plugins: ['typescript'], allowReturnOutsideFunction: false });
  } catch (err) {
    const e = err as Error & { loc?: { line: number } };
    const message = (e.message ?? String(err)).replace(/\s*\(\d+:\d+\)\s*$/, '');
    return { ok: false, error: `Erro de sintaxe${e.loc ? ` na linha ${e.loc.line}` : ''}: ${message}`, line: e.loc?.line ?? null };
  }
  try {
    const usesEsm = /^\s*(import|export)\s/m.test(source);
    const transforms: ('typescript' | 'imports')[] = usesEsm ? ['typescript', 'imports'] : ['typescript'];
    return { ok: true, code: transform(source, { transforms, filePath: 'server.ts', production: true }).code };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), line: null };
  }
}
