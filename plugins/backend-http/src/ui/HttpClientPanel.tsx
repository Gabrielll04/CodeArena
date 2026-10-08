import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { PluginUIContext } from '@codearena/plugin-sdk/ui';
import { compileForRunner } from '../compile';
import { requestPresets, type HttpRequestSpec } from '../index';
import type { BackendExecutor, BackendSession, DispatchResult, LoadResult } from '../types';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

interface HeaderRow {
  key: string;
  value: string;
}

function statusTone(status: number): string {
  if (status < 300) return 'bg-emerald-400/15 text-emerald-300 ring-emerald-400/30';
  if (status < 400) return 'bg-sky-400/15 text-sky-300 ring-sky-400/30';
  if (status < 500) return 'bg-amber-400/15 text-amber-300 ring-amber-400/30';
  return 'bg-rose-400/15 text-rose-300 ring-rose-400/30';
}

function prettyBody(body: string, contentType: string | undefined): string {
  if (contentType?.includes('json') || /^[[{]/.test(body.trim())) {
    try {
      return JSON.stringify(JSON.parse(body), null, 2);
    } catch {
      return body;
    }
  }
  return body;
}

function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-1" role="tablist">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="tab"
          aria-selected={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
            value === option.id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white/80'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export interface HttpClientPanelProps {
  context: PluginUIContext;
  executor: BackendExecutor;
}

export function HttpClientPanel({ context, executor }: HttpClientPanelProps) {
  const presets = useMemo(() => requestPresets(context.question), [context.question]);
  const first = presets[0];
  const [method, setMethod] = useState<string>(first?.method ?? 'GET');
  const [path, setPath] = useState(first?.path ?? '/');
  const [body, setBody] = useState(first?.body !== undefined ? JSON.stringify(first.body, null, 2) : '');
  const [headers, setHeaders] = useState<HeaderRow[]>([{ key: 'Content-Type', value: 'application/json' }]);
  const [requestTab, setRequestTab] = useState<'body' | 'headers'>('body');
  const [responseTab, setResponseTab] = useState<'body' | 'headers' | 'console'>('body');
  const [load, setLoad] = useState<LoadResult | null>(null);
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [sending, setSending] = useState(false);
  const [restarted, setRestarted] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);
  const sessionRef = useRef<{ code: string; session: Promise<BackendSession> } | null>(null);

  const ensureSession = useCallback(
    (code: string) => {
      if (sessionRef.current?.code === code) return sessionRef.current.session;
      const previous = sessionRef.current;
      if (previous) {
        void previous.session.then((s) => s.dispose());
        setRestarted(true);
      }
      const compiled = compileForRunner(code);
      const session: Promise<BackendSession> = compiled.ok
        ? executor.start(compiled.code)
        : Promise.resolve({
            load: { ok: false, error: compiled.error, line: compiled.line, logs: [], routes: [], listening: null },
            request: async () => ({ error: 'not_loaded' as const, message: compiled.error, durationMs: 0, logs: [] }),
            dispose: () => undefined,
          });
      sessionRef.current = { code, session };
      void session.then((s) => {
        if (sessionRef.current?.session === session) setLoad(s.load);
      });
      return session;
    },
    [executor],
  );

  // Carrega o servidor em segundo plano para mostrar rotas e erros de inicialização.
  useEffect(() => {
    const timer = setTimeout(() => void ensureSession(context.code), 700);
    return () => clearTimeout(timer);
  }, [context.code, ensureSession]);

  useEffect(
    () => () => {
      void sessionRef.current?.session.then((s) => s.dispose());
      sessionRef.current = null;
    },
    [],
  );

  const applyPreset = (preset: HttpRequestSpec) => {
    setMethod(preset.method);
    setPath(preset.path);
    setBody(preset.body !== undefined ? JSON.stringify(preset.body, null, 2) : '');
    if (preset.headers && Object.keys(preset.headers).length) {
      setHeaders(Object.entries(preset.headers).map(([key, value]) => ({ key, value })));
    }
  };

  const send = async () => {
    setInputError(null);
    let parsedBody: unknown = undefined;
    if (BODY_METHODS.has(method) && body.trim()) {
      try {
        parsedBody = JSON.parse(body);
      } catch {
        parsedBody = body;
      }
    }
    if (!path.startsWith('/')) {
      setInputError('O caminho deve começar com "/"');
      return;
    }
    setSending(true);
    setRestarted(false);
    try {
      const session = await ensureSession(context.code);
      const headerMap = Object.fromEntries(headers.filter((h) => h.key.trim()).map((h) => [h.key.trim(), h.value]));
      const outcome = await session.request({
        method,
        path,
        headers: headerMap,
        body: typeof parsedBody === 'string' ? parsedBody : parsedBody,
      });
      setResult(outcome);
      setResponseTab(outcome.response ? 'body' : 'console');
    } finally {
      setSending(false);
    }
  };

  const response = result?.response;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 text-sm text-white" data-testid="http-client">
      <section className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/50">Seu servidor</span>
          <span className="text-[11px] text-white/40">
            {executor.kind === 'browser-worker' ? 'Executa no navegador (Web Worker)' : 'Executa em processo isolado'}
          </span>
        </div>
        {!load ? (
          <p className="text-xs text-white/50">Iniciando</p>
        ) : load.ok ? (
          <div className="flex flex-wrap gap-1.5" data-testid="http-routes">
            {load.routes.length === 0 && <span className="text-xs text-white/50">Nenhuma rota registrada ainda</span>}
            {load.routes.map((route) => (
              <button
                type="button"
                key={`${route.method} ${route.path}`}
                onClick={() => {
                  setMethod(route.method === 'ALL' ? 'GET' : route.method);
                  setPath(route.path.replace(/:(\w+)/g, '1'));
                }}
                className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[11px] text-white/80 ring-1 ring-white/10 hover:bg-white/10"
              >
                {route.method} {route.path}
              </button>
            ))}
          </div>
        ) : (
          <p className="whitespace-pre-wrap font-mono text-xs text-rose-300" role="alert">
            {load.error}
          </p>
        )}
      </section>

      <section className="rounded-xl border border-white/10 bg-black/20 p-3">
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <select
            aria-label="Método HTTP"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="rounded-lg bg-white/10 px-2 py-1.5 font-mono text-xs font-semibold outline-none ring-1 ring-white/10 focus:ring-white/40"
          >
            {METHODS.map((m) => (
              <option key={m} value={m} className="bg-neutral-900">
                {m}
              </option>
            ))}
          </select>
          <input
            aria-label="Caminho"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            className="min-w-0 flex-1 rounded-lg bg-white/10 px-2 py-1.5 font-mono text-xs outline-none ring-1 ring-white/10 focus:ring-white/40"
            placeholder="/rota"
          />
          <button
            type="submit"
            disabled={sending}
            className="rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-neutral-900 transition hover:bg-white/85 disabled:opacity-50"
          >
            {sending ? 'Enviando' : 'Enviar'}
          </button>
        </form>
        {inputError && <p className="mt-2 text-xs text-rose-300">{inputError}</p>}
        {presets.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-white/40">Da checklist:</span>
            {presets.map((preset) => (
              <button
                type="button"
                key={`${preset.method} ${preset.path}`}
                onClick={() => applyPreset(preset)}
                className="rounded-md bg-white/5 px-2 py-0.5 font-mono text-[11px] text-white/70 hover:bg-white/10"
              >
                {preset.method} {preset.path}
              </button>
            ))}
          </div>
        )}
        <div className="mt-3">
          <Tabs
            value={requestTab}
            onChange={setRequestTab}
            options={[
              { id: 'body', label: 'Body' },
              { id: 'headers', label: `Headers (${headers.filter((h) => h.key).length})` },
            ]}
          />
          {requestTab === 'body' ? (
            <textarea
              aria-label="Body da requisição"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              disabled={!BODY_METHODS.has(method)}
              placeholder={BODY_METHODS.has(method) ? '{ "nome": "valor" }' : `${method} não envia body`}
              className="mt-2 h-20 w-full resize-y rounded-lg bg-black/30 p-2 font-mono text-xs outline-none ring-1 ring-white/10 focus:ring-white/30 disabled:opacity-40"
            />
          ) : (
            <div className="mt-2 space-y-1.5">
              {headers.map((row, index) => (
                <div key={index} className="flex gap-1.5">
                  <input
                    aria-label="Nome do header"
                    value={row.key}
                    onChange={(e) => setHeaders(headers.map((h, i) => (i === index ? { ...h, key: e.target.value } : h)))}
                    className="w-2/5 rounded-md bg-black/30 px-2 py-1 font-mono text-xs outline-none ring-1 ring-white/10"
                  />
                  <input
                    aria-label="Valor do header"
                    value={row.value}
                    onChange={(e) => setHeaders(headers.map((h, i) => (i === index ? { ...h, value: e.target.value } : h)))}
                    className="min-w-0 flex-1 rounded-md bg-black/30 px-2 py-1 font-mono text-xs outline-none ring-1 ring-white/10"
                  />
                  <button
                    type="button"
                    aria-label="Remover header"
                    onClick={() => setHeaders(headers.filter((_, i) => i !== index))}
                    className="rounded-md px-2 text-white/40 hover:bg-white/10 hover:text-white"
                  >
                    x
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setHeaders([...headers, { key: '', value: '' }])}
                className="text-xs text-white/60 hover:text-white"
              >
                Adicionar header
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-white/10 bg-black/20 p-3" aria-live="polite">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-white/50">Resposta</span>
          {response && (
            <span className="flex items-center gap-2">
              <span
                data-testid="http-status"
                className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold ring-1 ${statusTone(response.status)}`}
              >
                {response.status}
              </span>
              <span className="text-[11px] text-white/40">{result?.durationMs} ms</span>
            </span>
          )}
        </div>
        {restarted && !result && (
          <p className="mb-2 text-[11px] text-white/40">O código mudou: o servidor foi reiniciado e o estado em memória foi zerado.</p>
        )}
        {!result ? (
          <p className="text-xs text-white/40">Envie uma requisição para ver status, headers e body.</p>
        ) : (
          <>
            <Tabs
              value={responseTab}
              onChange={setResponseTab}
              options={[
                { id: 'body', label: 'Body' },
                { id: 'headers', label: 'Headers' },
                { id: 'console', label: `Console (${result.logs.length})` },
              ]}
            />
            <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-lg bg-black/30 p-2 font-mono text-xs">
              {!response && responseTab !== 'console' ? (
                <p className="whitespace-pre-wrap text-rose-300" role="alert">
                  {result.message}
                </p>
              ) : responseTab === 'body' && response ? (
                <pre className="whitespace-pre-wrap break-words text-white/90" data-testid="http-body">
                  {prettyBody(response.body, response.headers['content-type']) || '(vazio)'}
                </pre>
              ) : responseTab === 'headers' && response ? (
                <dl className="space-y-0.5">
                  {Object.entries(response.headers).map(([k, v]) => (
                    <div key={k} className="flex gap-2">
                      <dt className="text-white/50">{k}:</dt>
                      <dd className="break-all text-white/90">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="space-y-0.5">
                  {result.message && !response && <p className="text-rose-300">{result.message}</p>}
                  {result.logs.length === 0 && <p className="text-white/40">Sem saída de console nesta requisição.</p>}
                  {result.logs.map((log, i) => (
                    <p key={i} className={log.level === 'error' ? 'text-rose-300' : log.level === 'warn' ? 'text-amber-300' : 'text-white/80'}>
                      {log.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
