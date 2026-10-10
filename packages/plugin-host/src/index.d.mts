import type { z } from 'zod';

export declare const CONFIG_FILE: 'codearena.config.json';

export declare const HostConfigSchema: z.ZodType<{ $schema?: string; plugins: string[] }>;

export interface PluginManifest {
  /** Igual ao `id` do plugin e ao `pluginId` dos packs. */
  pluginId: string;
  displayName: string;
  /** Faixa de versões do `@codearena/plugin-sdk` suportada (semver). */
  sdk: string;
  /** Subcaminho de `exports` com a versão de servidor. Sem ele, o servidor usa ".". */
  server?: string;
  /** Subcaminho de `exports` com o ClientQuizPlugin. Sem ele, o navegador usa "." sem painéis. */
  ui?: string;
  /** Subcaminho de `exports` com o runtime do iframe isolado de preview. */
  sandbox?: string;
  /** Packs de exemplo distribuídos com o plugin (caminhos relativos ao pacote, como "./packs/exemplo.json"). */
  packs?: string[];
}

export declare const PluginManifestSchema: z.ZodType<PluginManifest>;

export interface HostConfig {
  path: string;
  exists: boolean;
  plugins: string[];
}

export interface ResolvedPlugin {
  /** Como aparece em codearena.config.json (nome de pacote ou caminho). */
  specifier: string;
  packageName: string;
  version: string;
  description: string;
  packageDir: string;
  manifest: PluginManifest;
  /** Arquivos absolutos de cada entrada. */
  entries: { main: string; server?: string; ui?: string; sandbox?: string };
  /** Arquivos absolutos dos packs de exemplo. */
  packs: string[];
}

export interface PluginProblem {
  specifier: string;
  message: string;
}

export declare class PluginLoadError extends Error {
  readonly specifier: string;
  constructor(specifier: string, message: string);
}

/** Versão do `@codearena/plugin-sdk` visível a partir de `fromDir`. */
export declare function installedSdkVersion(fromDir: string): string | undefined;

export declare function readHostConfig(rootDir: string, configPath?: string): HostConfig;

/** Nomes de pacote são procurados nos node_modules a partir de rootDir; caminhos locais são relativos a baseDir. */
export declare function resolvePlugin(
  specifier: string,
  options: { rootDir: string; baseDir?: string; sdkVersion?: string },
): ResolvedPlugin;

export declare function resolveHostPlugins(options: { rootDir: string; configPath?: string; sdkVersion?: string }): {
  config: HostConfig;
  plugins: ResolvedPlugin[];
  problems: PluginProblem[];
};
