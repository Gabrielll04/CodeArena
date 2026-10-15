/**
 * Plugins no modo isolado, do lado do app: o código do plugin roda em iframes `sandbox="allow-scripts"`
 * (origem opaca) servidos por plugin-frame.html. O app nunca importa o módulo do plugin; ele recebe só
 * metadados e respostas por postMessage e mostra os painéis do plugin dentro de iframes.
 */
import { useEffect, useRef } from 'react';
import type { ClientQuizPlugin, PluginEditorContext, PluginUIContext } from '@codearena/plugin-sdk/ui';
import { MAX_CODE_LENGTH } from '@codearena/schemas';
import { createPluginProxy, ISOLATION_CHANNEL, type IsolatedPluginDescription } from '@codearena/plugin-host/isolation';

const READY_TIMEOUT_MS = 15_000;
const CALL_TIMEOUT_MS = 5_000;

type FrameRole = 'logic' | 'preview' | 'side' | 'editor';

const frameUrl = (pluginId: string, role: FrameRole) =>
  `/plugin-frame.html?plugin=${encodeURIComponent(pluginId)}&role=${role}`;

function createFrame(pluginId: string, role: FrameRole): HTMLIFrameElement {
  const frame = document.createElement('iframe');
  // Sem allow-same-origin: o plugin não acessa o DOM, os cookies nem o armazenamento do app.
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.src = frameUrl(pluginId, role);
  return frame;
}

interface UiInfo {
  previewTitle?: string;
  sidePanelTitle?: string;
  hasPreview: boolean;
  hasSidePanel: boolean;
  hasEditor?: boolean;
}

/** Inicia o iframe de lógica do plugin e devolve um ClientQuizPlugin que encaminha as chamadas para ele. */
export function loadIsolatedPlugin(pluginId: string): Promise<ClientQuizPlugin<any>> {
  let frame: HTMLIFrameElement | undefined;
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let ready!: Promise<{ description: IsolatedPluginDescription; ui: UiInfo }>;

  function start() {
    frame?.remove();
    for (const call of pending.values()) call.reject(new Error('O plugin foi reiniciado.'));
    pending.clear();
    frame = createFrame(pluginId, 'logic');
    frame.style.display = 'none';
    frame.dataset.testid = `isolated-logic-${pluginId}`;
    const current = frame;
    ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`O plugin "${pluginId}" não respondeu ao iniciar.`)), READY_TIMEOUT_MS);
      const listener = (event: MessageEvent) => {
        if (event.source !== current.contentWindow || event.data?.channel !== ISOLATION_CHANNEL) return;
        const data = event.data;
        if (data.type === 'ready') {
          clearTimeout(timer);
          resolve({ description: data.description, ui: data.ui });
        } else if (data.type === 'fatal') {
          clearTimeout(timer);
          reject(new Error(data.error));
        } else if (data.type === 'result') {
          const call = pending.get(data.id);
          if (!call) return;
          pending.delete(data.id);
          if ('error' in data) call.reject(new Error(data.error));
          else call.resolve(data.result);
        }
      };
      window.addEventListener('message', listener);
    });
    document.body.appendChild(frame);
  }

  async function call(method: string, params?: Record<string, unknown>) {
    await ready;
    const target = frame!;
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        // Um validador travado: recarrega o iframe do plugin para as próximas chamadas.
        start();
        reject(new Error(`O plugin não respondeu em ${CALL_TIMEOUT_MS / 1000} s.`));
      }, CALL_TIMEOUT_MS);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      // Clona via JSON: só dados simples atravessam (nada de funções ou objetos do app).
      target.contentWindow?.postMessage({ channel: ISOLATION_CHANNEL, type: 'call', id, method, params: JSON.parse(JSON.stringify(params ?? {})) }, '*');
    });
  }

  start();
  return ready.then(({ description, ui }) => {
    if (description.id !== pluginId) throw new Error(`O plugin "${pluginId}" carregou com id "${description.id}".`);
    return {
      ...createPluginProxy(description, call),
      previewTitle: ui.previewTitle,
      sidePanelTitle: ui.sidePanelTitle,
      ...(ui.hasPreview && { renderPreview: (context: PluginUIContext) => <IsolatedPanel pluginId={pluginId} role="preview" context={context} /> }),
      ...(ui.hasSidePanel && { renderSidePanel: (context: PluginUIContext) => <IsolatedPanel pluginId={pluginId} role="side" context={context} /> }),
      ...(ui.hasEditor && { renderEditor: (context: PluginEditorContext) => <IsolatedPanel pluginId={pluginId} role="editor" context={context} /> }),
    };
  });
}

/**
 * Painel ou editor do plugin dentro de um iframe isolado. Recebe o contexto (questão pública, resposta, avaliação)
 * por postMessage. No papel "editor", o iframe pode devolver uma resposta nova: só texto, dentro do limite de
 * tamanho, vindo deste iframe e enquanto o app aceitar edição. O servidor valida a resposta de novo de qualquer forma.
 */
function IsolatedPanel({ pluginId, role, context }: { pluginId: string; role: 'preview' | 'side' | 'editor'; context: PluginUIContext | PluginEditorContext }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const latest = useRef(context);
  latest.current = context;

  const send = () => {
    const { onChange, ...data } = latest.current as PluginEditorContext;
    // Funções não atravessam; o iframe só sabe se pode editar.
    const payload = role === 'editor' ? { ...data, readOnly: data.readOnly || !onChange } : data;
    ref.current?.contentWindow?.postMessage({ channel: ISOLATION_CHANNEL, type: 'context', context: JSON.parse(JSON.stringify(payload)) }, '*');
  };

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== ref.current?.contentWindow || event.data?.channel !== ISOLATION_CHANNEL) return;
      if (event.data.type === 'ready') send();
      if (event.data.type === 'change' && role === 'editor') {
        const value: unknown = event.data.value;
        const { onChange, readOnly } = latest.current as PluginEditorContext;
        if (readOnly || !onChange || typeof value !== 'string' || value.length > MAX_CODE_LENGTH) return;
        onChange(value);
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  useEffect(send, [context]);

  return (
    <iframe
      ref={ref}
      title={role === 'editor' ? `Editor do plugin ${pluginId}` : `Painel do plugin ${pluginId}`}
      sandbox="allow-scripts"
      src={frameUrl(pluginId, role)}
      className="block h-full min-h-[240px] w-full border-0 bg-transparent"
      data-testid={`isolated-panel-${role}`}
    />
  );
}
