/** Nome do pacote sem a versão: "pkg@1.2.0" -> "pkg". */
export declare function packageName(spec: string): string;

/** Executa `codearena <args>` e devolve o código de saída. */
export declare function main(
  argv: string[],
  io?: { cwd?: string; exec?: (command: string, args: string[], cwd: string) => void; log?: (message: string) => void },
): Promise<number>;
