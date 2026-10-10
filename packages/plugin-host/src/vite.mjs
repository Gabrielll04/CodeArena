/**
 * Plugin do Vite que inclui no build só os plugins listados em codearena.config.json.
 * Gera o módulo "virtual:codearena/plugins" com import() sob demanda de cada interface e runtime de preview.
 */
import { join, resolve } from 'node:path';
import { CONFIG_FILE, installedSdkVersion, resolveHostPlugins } from './index.mjs';

export const VIRTUAL_ID = 'virtual:codearena/plugins';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

/** Pastas de código dos plugins configurados, para o `content` do Tailwind. */
export function pluginContentGlobs({ rootDir, configPath }) {
  return resolveHostPlugins({ rootDir, configPath }).plugins.map(
    (p) => `${p.packageDir.replace(/\\/g, '/')}/{src,dist}/**/*.{js,jsx,ts,tsx,mjs}`,
  );
}

function renderModule(plugins, problems) {
  const info = plugins.map((p) => ({
    id: p.manifest.pluginId,
    displayName: p.manifest.displayName,
    description: p.description,
    version: p.version,
    hasSandbox: Boolean(p.entries.sandbox),
  }));
  const loaders = (pick) =>
    plugins
      .filter((p) => pick(p))
      .map((p) => `  ${JSON.stringify(p.manifest.pluginId)}: () => import(${JSON.stringify(pick(p))}),`)
      .join('\n');
  return [
    `export const installedPlugins = ${JSON.stringify(info)};`,
    `export const pluginProblems = ${JSON.stringify(problems)};`,
    `export const uiLoaders = {\n${loaders((p) => p.entries.ui ?? p.entries.main)}\n};`,
    `export const sandboxLoaders = {\n${loaders((p) => p.entries.sandbox)}\n};`,
  ].join('\n');
}

/**
 * @param {{ rootDir: string; configPath?: string; htmlEntries?: string[] }} options
 * @returns {import('vite').Plugin}
 */
export function codearenaPlugins(options) {
  const configPath = resolve(options.configPath ?? process.env.CODEARENA_CONFIG ?? join(options.rootDir, CONFIG_FILE));
  let state = { plugins: [], problems: [] };

  return {
    name: 'codearena-plugins',
    enforce: 'pre',
    config(userConfig) {
      const root = resolve(userConfig.root ?? process.cwd());
      state = resolveHostPlugins({ rootDir: options.rootDir, configPath, sdkVersion: installedSdkVersion(root) });
      const entries = state.plugins.flatMap((p) => [p.entries.ui ?? p.entries.main, p.entries.sandbox]).filter(Boolean);
      // O pré-empacotamento do Vite percorre também as entradas dos plugins (dependências como react-native-web).
      return {
        optimizeDeps: { entries: [...(options.htmlEntries ?? ['index.html']), ...entries] },
        // Um plugin fora do repositório (caminho local) traz as próprias cópias destas dependências;
        // o app precisa de uma só (React com duas cópias quebra os hooks).
        resolve: { dedupe: ['react', 'react-dom', '@codearena/plugin-sdk', '@codearena/schemas', '@codearena/core'] },
      };
    },
    configResolved(config) {
      for (const problem of state.problems) config.logger.warn(`[codearena] ${problem.message}`);
      if (!state.plugins.length) config.logger.warn(`[codearena] Nenhum plugin ativo em ${configPath}.`);
    },
    configureServer(server) {
      const watched = [configPath, ...state.plugins.map((p) => join(p.packageDir, 'package.json'))];
      server.watcher.add(watched);
      server.watcher.on('change', (file) => {
        if (watched.includes(resolve(file))) {
          server.config.logger.info('[codearena] Plugins alterados; reiniciando o servidor de desenvolvimento.');
          void server.restart();
        }
      });
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      return id === RESOLVED_ID ? renderModule(state.plugins, state.problems) : undefined;
    },
  };
}
