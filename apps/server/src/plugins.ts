/**
 * Plugins do servidor (validação oficial), carregados a partir de codearena.config.json.
 * O núcleo não importa nenhum plugin concreto: para ativar um plugin, instale o pacote e liste-o na configuração.
 */
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PluginRegistry, type PluginEntry, type QuizPlugin } from '@codearena/plugin-sdk';
import { installedSdkVersion, resolveHostPlugins, type PluginProblem, type ResolvedPlugin } from '@codearena/plugin-host';
import { startIsolatedPlugin } from '@codearena/plugin-host/isolated-node';

/** Pack de exemplo distribuído por um plugin (campo `codearena.packs` do manifesto). */
export interface SamplePackFile {
  pluginId: string;
  file: string;
}

export interface LoadedServerPlugins {
  registry: PluginRegistry<QuizPlugin<any>>;
  /** Packs de exemplo dos plugins carregados com sucesso. */
  samplePacks: SamplePackFile[];
  problems: PluginProblem[];
  /** Encerra os processos dos plugins isolados. */
  dispose(): void;
}

async function importPlugin(resolved: ResolvedPlugin): Promise<QuizPlugin<any>> {
  const mod = (await import(pathToFileURL(resolved.entries.server ?? resolved.entries.main).href)) as { default?: PluginEntry };
  if (!mod.default) throw new Error('a entrada não tem export default.');
  return typeof mod.default === 'function' ? await mod.default() : mod.default;
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
  const samplePacks: SamplePackFile[] = [];
  const disposers: (() => void)[] = [];

  for (const resolved of plugins) {
    try {
      let plugin: QuizPlugin<any>;
      if (resolved.isolated) {
        // Plugin de terceiro não revisado: roda num processo restrito, nunca no processo do servidor.
        const isolated = await startIsolatedPlugin({
          entry: resolved.entries.server ?? resolved.entries.main,
          readPaths: [resolved.packageDir, join(options.rootDir, 'node_modules')],
          log: options.log,
        });
        disposers.push(isolated.dispose);
        plugin = isolated.plugin;
      } else {
        plugin = await importPlugin(resolved);
      }
      if (plugin.id !== resolved.manifest.pluginId) {
        throw new Error(`o manifesto declara "${resolved.manifest.pluginId}", mas o plugin tem id "${plugin.id}".`);
      }
      registry.register(plugin);
      samplePacks.push(...resolved.packs.map((file) => ({ pluginId: plugin.id, file })));
    } catch (err) {
      problems.push({ specifier: resolved.specifier, message: `Plugin "${resolved.specifier}": ${(err as Error).message}` });
    }
  }

  problems.forEach((problem) => options.log?.(problem.message));
  return { registry, samplePacks, problems, dispose: () => disposers.forEach((dispose) => dispose()) };
}
