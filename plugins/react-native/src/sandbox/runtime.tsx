/// <reference path="../rnw.d.ts" />
/**
 * Runtime executado DENTRO do iframe `sandbox="allow-scripts"` (origem opaca):
 * não tem acesso ao DOM, cookies ou localStorage do app principal.
 * Recebe o código do aluno via postMessage, transpila (sucrase), executa e renderiza com react-native-web.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import * as RNW from 'react-native-web';
import { transform } from 'sucrase';
import { addLoopGuards, parseSource } from '../ast';
import { SUPPORTED_COMPONENTS } from '../index';
import { PREVIEW_CHANNEL, type FromSandboxMessage, type PreviewError, type ToSandboxMessage } from '../protocol';

const LOOP_LIMIT_MS = 1500;
let loopCount = 0;
let loopStart = 0;
(globalThis as Record<string, unknown>).__codearenaLoopGuard = () => {
  if (loopCount === 0) {
    loopStart = performance.now();
    setTimeout(() => {
      loopCount = 0;
    }, 0);
  }
  loopCount++;
  if ((loopCount & 1023) === 0 && performance.now() - loopStart > LOOP_LIMIT_MS) {
    loopCount = 0;
    throw new Error('Um laço executou por tempo demais (possível loop infinito).');
  }
};

function post(message: FromSandboxMessage) {
  window.parent.postMessage(message, '*');
}

function toastAlert(title?: string, message?: string) {
  const el = document.createElement('div');
  el.setAttribute('role', 'alertdialog');
  el.style.cssText =
    'position:fixed;left:16px;right:16px;top:40%;padding:16px;border-radius:14px;background:#1f2333;color:#fff;font:14px system-ui;box-shadow:0 10px 30px rgba(0,0,0,.35);z-index:9999;text-align:center';
  el.innerHTML = '';
  const strong = document.createElement('strong');
  strong.textContent = title ?? '';
  const p = document.createElement('div');
  p.style.marginTop = '6px';
  p.textContent = message ?? '';
  el.append(strong, p);
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

const reactNativeModule: Record<string, unknown> = {
  ...(RNW as Record<string, unknown>),
  Alert: { alert: (title?: string, message?: string) => toastAlert(title, message) },
};

const scopeNames = ['React', ...SUPPORTED_COMPONENTS];
const scopeValues = scopeNames.map((name) => (name === 'React' ? React : reactNativeModule[name]));

function requireShim(name: string): unknown {
  if (name === 'react') return React;
  if (name === 'react-native' || name === 'react-native-web') return reactNativeModule;
  throw Object.assign(new Error(`O módulo "${name}" não está disponível no preview. Use "react" e "react-native".`), {
    previewKind: 'module',
  });
}

function asPreviewError(err: unknown, kind: PreviewError['kind'] = 'runtime'): PreviewError {
  const e = err as Error & { previewKind?: PreviewError['kind'] };
  return { kind: e?.previewKind ?? kind, message: e?.message ?? String(err) };
}

type CompileResult = { ok: true; component: React.ComponentType } | { ok: false; error: PreviewError };

function compile(code: string): CompileResult {
  const parsed = parseSource(code);
  if (!parsed.ok) return { ok: false, error: { kind: 'syntax', message: parsed.error.message, line: parsed.error.line } };
  let compiled: string;
  try {
    compiled = transform(addLoopGuards(code), {
      transforms: ['typescript', 'jsx', 'imports'],
      jsxRuntime: 'classic',
      production: true,
      filePath: 'App.tsx',
    }).code;
  } catch (err) {
    return { ok: false, error: asPreviewError(err, 'syntax') };
  }
  const module: { exports: Record<string, unknown> } = { exports: {} };
  try {
    const run = new Function('require', 'module', 'exports', ...scopeNames, compiled);
    run(requireShim, module, module.exports, ...scopeValues);
  } catch (err) {
    return { ok: false, error: asPreviewError(err) };
  }
  const candidate = module.exports.default ?? module.exports.App;
  if (typeof candidate !== 'function') {
    return {
      ok: false,
      error: { kind: 'export', message: 'Nenhum componente exportado. Use "export default function App() { ... }".' },
    };
  }
  return { ok: true, component: candidate as React.ComponentType };
}

class Boundary extends React.Component<
  { renderId: number; children: React.ReactNode },
  { error: Error | null }
> {
  override state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    post({ channel: PREVIEW_CHANNEL, type: 'result', id: this.props.renderId, ok: false, error: asPreviewError(error) });
  }

  override render() {
    if (this.state.error) return null;
    return this.props.children;
  }
}

function Committed({ renderId }: { renderId: number }) {
  React.useEffect(() => {
    post({ channel: PREVIEW_CHANNEL, type: 'result', id: renderId, ok: true });
  }, [renderId]);
  return null;
}

export function mountReactNativeSandbox(container: HTMLElement): void {
  let root: Root | null = null;
  const View = RNW.View as React.ComponentType<{ style?: unknown; children?: React.ReactNode }>;

  window.addEventListener('error', (event) => {
    post({ channel: PREVIEW_CHANNEL, type: 'runtime-error', error: asPreviewError(event.error ?? event.message) });
  });
  window.addEventListener('unhandledrejection', (event) => {
    post({ channel: PREVIEW_CHANNEL, type: 'runtime-error', error: asPreviewError(event.reason) });
  });

  window.addEventListener('message', (event: MessageEvent<ToSandboxMessage>) => {
    const data = event.data;
    if (event.source !== window.parent || !data || data.channel !== PREVIEW_CHANNEL || data.type !== 'render') return;
    const result = compile(String(data.code ?? ''));
    if (!result.ok) {
      post({ channel: PREVIEW_CHANNEL, type: 'result', id: data.id, ok: false, error: result.error });
      return;
    }
    const Component = result.component;
    root?.unmount();
    root = createRoot(container);
    root.render(
      <Boundary renderId={data.id} key={data.id}>
        <View style={{ flex: 1 }}>
          <Component />
        </View>
        <Committed renderId={data.id} />
      </Boundary>,
    );
  });

  post({ channel: PREVIEW_CHANNEL, type: 'ready' });
}

/** Entrada "sandbox" do manifesto. */
export default mountReactNativeSandbox;
