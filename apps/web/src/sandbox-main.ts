/**
 * Entrada da página isolada de preview (sandbox.html), carregada dentro de um iframe
 * `sandbox="allow-scripts"`. Cada plugin com preview em iframe registra seu runtime em ./plugins/sandboxes.
 */
import { sandboxRuntimes } from './plugins/sandboxes';

const root = document.getElementById('root')!;
const pluginId = new URLSearchParams(window.location.search).get('plugin') ?? '';
const load = sandboxRuntimes[pluginId];

if (!load) {
  root.textContent = `Preview indisponível: plugin "${pluginId}" não registrado.`;
} else {
  void load().then((mount) => mount(root));
}
