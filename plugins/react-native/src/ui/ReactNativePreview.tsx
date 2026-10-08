import { useEffect, useRef, useState } from 'react';
import { PREVIEW_CHANNEL, type FromSandboxMessage, type PreviewError, type ToSandboxMessage } from '../protocol';

const ERROR_TITLE: Record<PreviewError['kind'], string> = {
  syntax: 'Erro de sintaxe',
  runtime: 'Erro ao executar',
  export: 'Componente não encontrado',
  module: 'Módulo indisponível',
};

export interface ReactNativePreviewProps {
  code: string;
  sandboxUrl: string;
  debounceMs?: number;
}

export function ReactNativePreview({ code, sandboxUrl, debounceMs = 350 }: ReactNativePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<PreviewError | null>(null);
  const [pending, setPending] = useState(false);
  const lastId = useRef(0);

  useEffect(() => {
    const onMessage = (event: MessageEvent<FromSandboxMessage>) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data;
      if (!data || data.channel !== PREVIEW_CHANNEL) return;
      if (data.type === 'ready') setReady(true);
      else if (data.type === 'result' && data.id === lastId.current) {
        setPending(false);
        setError(data.ok ? null : data.error);
      } else if (data.type === 'runtime-error') setError(data.error);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    if (!ready) return;
    setPending(true);
    const timer = setTimeout(() => {
      const id = ++lastId.current;
      const message: ToSandboxMessage = { channel: PREVIEW_CHANNEL, type: 'render', id, code };
      // Origem opaca (sandbox sem allow-same-origin): o alvo precisa ser "*". A resposta é filtrada por event.source.
      iframeRef.current?.contentWindow?.postMessage(message, '*');
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [code, ready, debounceMs]);

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-4" data-testid="rn-preview">
      <div className="relative aspect-[9/18.5] h-full max-h-[620px] min-h-[360px] max-w-full rounded-[2.4rem] border border-white/15 bg-[#05060a] p-[10px] shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)]">
        <div className="pointer-events-none absolute left-1/2 top-[14px] z-10 h-[18px] w-[34%] -translate-x-1/2 rounded-full bg-[#05060a]" />
        <div className="relative h-full w-full overflow-hidden rounded-[1.9rem] bg-white">
          <div className="flex h-7 items-center justify-between px-6 pt-1 text-[11px] font-semibold text-neutral-900">
            <span>9:41</span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-3 rounded-[2px] border border-neutral-900" />
            </span>
          </div>
          <iframe
            ref={iframeRef}
            title="Preview React Native"
            src={sandboxUrl}
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className="h-[calc(100%-1.75rem)] w-full border-0 bg-white"
          />
          {error && (
            <div
              role="alert"
              data-testid="rn-preview-error"
              className="absolute inset-x-2 bottom-2 max-h-[45%] overflow-auto rounded-xl bg-[#2a1220]/95 p-3 font-mono text-[11px] leading-relaxed text-[#ffd3dc] shadow-lg"
            >
              <div className="mb-1 font-sans text-xs font-semibold text-[#ff8fa6]">
                {ERROR_TITLE[error.kind]}
                {error.line ? ` · linha ${error.line}` : ''}
              </div>
              <div className="whitespace-pre-wrap break-words">{error.message}</div>
            </div>
          )}
        </div>
      </div>
      <div className="h-4 text-xs text-white/50" aria-live="polite">
        {!ready ? 'Carregando preview' : pending ? 'Atualizando' : error ? 'Corrija o erro para atualizar' : 'Preview atualizado'}
      </div>
    </div>
  );
}
