/**
 * Entrada da página isolada de preview (sandbox.html), carregada dentro de um iframe
 * `sandbox="allow-scripts"`. Só o runtime do plugin pedido na URL é baixado (entrada "sandbox" do manifesto).
 */
import type { SandboxEntry } from '@codearena/plugin-sdk/ui';
import { sandboxLoaders } from 'virtual:codearena/plugins';

const root = document.getElementById('root')!;
const pluginId = new URLSearchParams(window.location.search).get('plugin') ?? '';
const load = sandboxLoaders[pluginId];

if (!load) {
  root.textContent = `Preview indisponível: plugin "${pluginId}" não instalado.`;
} else {
  void load().then(async (mod) => {
    const mount = mod.default as SandboxEntry | undefined;
    if (typeof mount !== 'function') {
      root.textContent = `Preview indisponível: plugin "${pluginId}" sem runtime de preview.`;
      return;
    }
    await mount(root);
  });
}
