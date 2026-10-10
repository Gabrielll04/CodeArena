/// <reference types="vite/client" />

declare module 'monaco-editor/esm/vs/editor/edcore.main';
declare module 'monaco-editor/esm/vs/language/typescript/monaco.contribution';
declare module 'monaco-editor/esm/vs/language/json/monaco.contribution';
declare module 'monaco-editor/esm/vs/basic-languages/javascript/javascript.contribution';
declare module 'monaco-editor/esm/vs/basic-languages/typescript/typescript.contribution';
declare module 'monaco-editor/esm/vs/basic-languages/python/python.contribution';

/** Gerado por @codearena/plugin-host/vite a partir de codearena.config.json. */
declare module 'virtual:codearena/plugins' {
  export interface InstalledPluginInfo {
    id: string;
    displayName: string;
    description: string;
    version: string;
    hasSandbox: boolean;
    /** Roda no modo isolado: a interface fica num iframe sem origem. */
    isolated: boolean;
  }
  export const installedPlugins: InstalledPluginInfo[];
  export const pluginProblems: { specifier: string; message: string }[];
  export const uiLoaders: Record<string, () => Promise<{ default?: unknown }>>;
  export const sandboxLoaders: Record<string, () => Promise<{ default?: unknown }>>;
}

/** Só importado pela página isolada (plugin-frame.html). */
declare module 'virtual:codearena/isolated-plugins' {
  export const isolatedLoaders: Record<string, () => Promise<{ default?: unknown }>>;
}
