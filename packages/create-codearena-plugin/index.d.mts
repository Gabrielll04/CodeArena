export declare function parseArgs(argv: string[]): { dir?: string; id?: string; name?: string; author?: string; yes: boolean };

/** Gera o plugin a partir do modelo e devolve a pasta criada. */
export declare function createPlugin(options: { dir: string; id: string; name: string; author?: string; sdkRange?: string }): string;
