/**
 * Plugins do servidor (validação oficial), carregados a partir de codearena.config.json.
 * O núcleo não importa nenhum plugin concreto: para ativar um plugin, instale o pacote e liste-o na configuração.
 */
import { pathToFileURL } from 'node:url';
import { PluginRegistry, type PluginEntry, type QuizPlugin } from '@codearena/plugin-sdk';
import { installedSdkVersion, resolveHostPlugins, type PluginProblem } from '@codearena/plugin-host';

export interface LoadedServerPlugins {
  registry: PluginRegistry<QuizPlugin<any>>;
  problems: PluginProblem[];
}

export async function loadServerPlugins(options: {
  rootDir: string;
  configPath?: string;
  log?: (message: string) => void;
}): Promise<LoadedServerPlugins> {
  const { plugins, problems } = resolveHostPlugins({
    rootDir: options.rootDir,
    configPath: options.configPath,
    sdkVersion: installedSdkVersion(import.meta.dirname),
  });
  const registry = new PluginRegistry<QuizPlugin<any>>();

  for (const resolved of plugins) {
    try {
      const mod = (await import(pathToFileURL(resolved.entries.server ?? resolved.entries.main).href)) as { default?: PluginEntry };
      if (!mod.default) throw new Error('a entrada não tem export default.');
      const plugin = typeof mod.default === 'function' ? await mod.default() : mod.default;
      if (plugin.id !== resolved.manifest.pluginId) {
        throw new Error(`o manifesto declara "${resolved.manifest.pluginId}", mas o plugin tem id "${plugin.id}".`);
      }
      registry.register(plugin);
    } catch (err) {
      problems.push({ specifier: resolved.specifier, message: `Plugin "${resolved.specifier}": ${(err as Error).message}` });
    }
  }

  problems.forEach((problem) => options.log?.(problem.message));
  return { registry, problems };
}
