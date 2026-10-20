import Editor, { type OnMount } from '@monaco-editor/react';
import { useRef } from 'react';
import '../monaco';
import { Spinner } from './ui';

/** Colagem no editor: só o tamanho do texto (o conteúdo nunca sai do navegador). */
export interface PasteInfo {
  chars: number;
  /** Recusada porque a sala não permite colar. */
  blocked: boolean;
}

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  language: string;
  /** Identifica o modelo do Monaco (um por questão/arquivo). */
  path: string;
  readOnly?: boolean;
  height?: string | number;
  ariaLabel?: string;
  fontSize?: number;
  /** false: recusa colar e arrastar texto para o editor. Padrão: true. */
  allowPaste?: boolean;
  onPaste?: (paste: PasteInfo) => void;
}

const transferredText = (event: Event): string =>
  (event instanceof ClipboardEvent ? event.clipboardData : event instanceof DragEvent ? event.dataTransfer : null)?.getData('text/plain') ?? '';

export function CodeEditor({ value, onChange, language, path, readOnly, height = '100%', ariaLabel, fontSize = 14, allowPaste = true, onPaste }: CodeEditorProps) {
  // O Monaco é montado uma vez; os ouvintes leem a configuração atual por ref.
  const pastePolicy = useRef({ allowPaste, onPaste });
  pastePolicy.current = { allowPaste, onPaste };

  const handleMount: OnMount = (editor) => {
    const node = editor.getDomNode();
    // Colar pelo teclado e arrastar texto passam por eventos do DOM: recusados antes de chegar ao Monaco.
    const refuse = (event: Event) => {
      if (pastePolicy.current.allowPaste) return;
      event.preventDefault();
      event.stopPropagation();
      pastePolicy.current.onPaste?.({ chars: transferredText(event).length, blocked: true });
    };
    node?.addEventListener('paste', refuse, true);
    node?.addEventListener('drop', refuse, true);
    // Colagens que chegam por outro caminho (ex.: menu de contexto) são medidas aqui e, se proibidas, desfeitas.
    const pasted = editor.onDidPaste(({ range }) => {
      const chars = editor.getModel()?.getValueInRange(range).length ?? 0;
      if (!pastePolicy.current.allowPaste) {
        editor.trigger('codearena', 'undo', null);
        pastePolicy.current.onPaste?.({ chars, blocked: true });
        return;
      }
      if (chars > 0) pastePolicy.current.onPaste?.({ chars, blocked: false });
    });
    editor.onDidDispose(() => {
      node?.removeEventListener('paste', refuse, true);
      node?.removeEventListener('drop', refuse, true);
      pasted.dispose();
    });
  };

  return (
    <div className="h-full min-h-0 w-full" data-testid="code-editor" data-path={path} data-paste={allowPaste ? 'allowed' : 'blocked'}>
      <Editor
        value={value}
        onChange={(next) => onChange?.(next ?? '')}
        onMount={handleMount}
        language={language}
        path={path}
        theme="codearena"
        height={height}
        loading={
          <div className="flex h-full items-center justify-center gap-2 text-sm text-white/40">
            <Spinner className="h-4 w-4" /> Carregando editor
          </div>
        }
        options={{
          readOnly,
          ariaLabel: ariaLabel ?? 'Editor de código',
          fontSize,
          fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
          fontLigatures: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: 'on',
          padding: { top: 14, bottom: 14 },
          renderLineHighlight: 'line',
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          bracketPairColorization: { enabled: true },
          stickyScroll: { enabled: false },
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          domReadOnly: readOnly,
          renderValidationDecorations: 'on',
          dropIntoEditor: { enabled: allowPaste },
        }}
      />
    </div>
  );
}
