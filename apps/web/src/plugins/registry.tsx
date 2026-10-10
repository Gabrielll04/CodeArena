/**
 * Plugins disponíveis no navegador, gerados no build a partir de codearena.config.json
 * (ver packages/plugin-host). Cada interface de plugin só é baixada quando uma questão dele é aberta.
 */
import { useEffect, useState } from 'react';
import { definePlugin } from '@codearena/plugin-sdk';
import type { ClientPluginEntry, ClientQuizPlugin } from '@codearena/plugin-sdk/ui';
import { installedPlugins, pluginProblems, uiLoaders, type InstalledPluginInfo } from 'virtual:codearena/plugins';

export type { InstalledPluginInfo };

/** Plugins ativos nesta instalação, sem carregar o código deles. */
export const pluginCatalog: readonly InstalledPluginInfo[] = installedPlugins;

if (pluginProblems.length) console.warn('[codearena] Plugins com problema:', pluginProblems);

export function isPluginInstalled(id: string): boolean {
  return id in uiLoaders;
}

export function pluginInfo(id: string): InstalledPluginInfo | undefined {
  return installedPlugins.find((p) => p.id === id);
}

export const sandboxUrlFor = (id: string) => `/sandbox.html?plugin=${encodeURIComponent(id)}`;

const loaded = new Map<string, ClientQuizPlugin<any>>();
const pending = new Map<string, Promise<ClientQuizPlugin<any> | undefined>>();

/** Baixa (uma vez) e devolve a interface do plugin; `undefined` se ele não estiver instalado. */
export function loadClientPlugin(id: string): Promise<ClientQuizPlugin<any> | undefined> {
  const ready = loaded.get(id);
  if (ready) return Promise.resolve(ready);
  const loader = uiLoaders[id];
  if (!loader) return Promise.resolve(undefined);
  let promise = pending.get(id);
  if (!promise) {
    promise = loader()
      .then(async (mod) => {
        const entry = mod.default as ClientPluginEntry | undefined;
        if (!entry) throw new Error(`O plugin "${id}" não exporta uma interface (export default).`);
        const plugin = definePlugin(typeof entry === 'function' ? await entry({ sandboxUrl: sandboxUrlFor(id) }) : entry);
        if (plugin.id !== id) throw new Error(`O plugin "${id}" carregou com id "${plugin.id}".`);
        loaded.set(id, plugin);
        return plugin;
      })
      .finally(() => pending.delete(id));
    pending.set(id, promise);
  }
  return promise;
}

export type PluginState =
  | { status: 'loading'; plugin?: undefined }
  | { status: 'ready'; plugin: ClientQuizPlugin<any> }
  | { status: 'missing'; plugin?: undefined }
  | { status: 'error'; plugin?: undefined; error: string };

function initialState(id: string | undefined): PluginState {
  if (!id || !isPluginInstalled(id)) return { status: 'missing' };
  const plugin = loaded.get(id);
  return plugin ? { status: 'ready', plugin } : { status: 'loading' };
}

/** Interface do plugin para um componente React, carregada sob demanda. */
export function useClientPlugin(id: string | undefined): PluginState {
  const [state, setState] = useState<{ id: string | undefined; value: PluginState }>(() => ({ id, value: initialState(id) }));
  const current = state.id === id ? state.value : initialState(id);

  useEffect(() => {
    if (current.status !== 'loading' || !id) return;
    let alive = true;
    loadClientPlugin(id).then(
      (plugin) => alive && setState({ id, value: plugin ? { status: 'ready', plugin } : { status: 'missing' } }),
      (err: Error) => alive && setState({ id, value: { status: 'error', error: err.message } }),
    );
    return () => {
      alive = false;
    };
  }, [id, current.status]);

  return current;
}
