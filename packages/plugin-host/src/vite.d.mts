import type { Plugin } from 'vite';

export declare const VIRTUAL_ID: 'virtual:codearena/plugins';
export declare const ISOLATED_VIRTUAL_ID: 'virtual:codearena/isolated-plugins';

export declare function pluginContentGlobs(options: { rootDir: string; configPath?: string }): string[];

export declare function codearenaPlugins(options: { rootDir: string; configPath?: string; htmlEntries?: string[] }): Plugin;
