/**
 * Página dos plugins no modo isolado (plugin-frame.html), sempre carregada num iframe `sandbox="allow-scripts"`:
 * origem opaca, sem acesso ao app, aos cookies nem ao armazenamento. O app só conversa com ela por postMessage.
 *
 * ?role=logic   validadores e metadados (iframe invisível, um por plugin)
 * ?role=preview painel de preview do plugin
 * ?role=side    painel de ferramentas do plugin
 */
import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import type { ClientPluginEntry, ClientQuizPlugin, PluginUIContext } from '@codearena/plugin-sdk/ui';
import { createPluginHandler, describePlugin, ISOLATION_CHANNEL } from '@codearena/plugin-host/isolation';
import { isolatedLoaders } from 'virtual:codearena/isolated-plugins';
import './styles.css';

const params = new URLSearchParams(window.location.search);
const pluginId = params.get('plugin') ?? '';
const role = params.get('role') ?? 'logic';
const root = document.getElementById('root')!;

function post(message: Record<string, unknown>) {
  window.parent.postMessage({ channel: ISOLATION_CHANNEL, ...message }, '*');
}

/** Só aceita mensagens da página que contém este iframe. */
function onParentMessage(handler: (data: Record<string, any>) => void) {
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent || event.data?.channel !== ISOLATION_CHANNEL) return;
    handler(event.data);
  });
}

async function loadPlugin(): Promise<ClientQuizPlugin<any>> {
  const load = isolatedLoaders[pluginId];
  if (!load) throw new Error(`Plugin "${pluginId}" não está instalado no modo isolado.`);
  const entry = (await load()).default as ClientPluginEntry | undefined;
  if (!entry) throw new Error(`O plugin "${pluginId}" não exporta uma interface (export default).`);
  return typeof entry === 'function' ? entry({ sandboxUrl: `/sandbox.html?plugin=${encodeURIComponent(pluginId)}` }) : entry;
}

function Panel({ plugin, kind }: { plugin: ClientQuizPlugin<any>; kind: 'preview' | 'side' }) {
  const [context, setContext] = useState<PluginUIContext | null>(null);
  useEffect(() => {
    onParentMessage((data) => {
      if (data.type === 'context') setContext(data.context as PluginUIContext);
    });
    post({ type: 'ready' });
  }, []);
  if (!context) return null;
  return <>{kind === 'preview' ? plugin.renderPreview?.(context) : plugin.renderSidePanel?.(context)}</>;
}

loadPlugin().then(
  (plugin) => {
    if (role === 'logic') {
      const handle = createPluginHandler(plugin);
      onParentMessage(async (data) => {
        if (data.type !== 'call') return;
        try {
          post({ type: 'result', id: data.id, result: (await handle(data.method, data.params)) ?? null });
        } catch (err) {
          post({ type: 'result', id: data.id, error: err instanceof Error ? err.message : String(err) });
        }
      });
      post({
        type: 'ready',
        description: describePlugin(plugin),
        ui: {
          previewTitle: plugin.previewTitle,
          sidePanelTitle: plugin.sidePanelTitle,
          hasPreview: typeof plugin.renderPreview === 'function',
          hasSidePanel: typeof plugin.renderSidePanel === 'function',
        },
      });
      return;
    }
    createRoot(root).render(<Panel plugin={plugin} kind={role === 'preview' ? 'preview' : 'side'} />);
  },
  (err: Error) => {
    post({ type: 'fatal', error: err.message });
    root.textContent = err.message;
  },
);
