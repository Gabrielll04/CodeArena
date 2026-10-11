import Editor from '@monaco-editor/react';
import '../monaco';
import { Spinner } from './ui';

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
}

export function CodeEditor({ value, onChange, language, path, readOnly, height = '100%', ariaLabel, fontSize = 14 }: CodeEditorProps) {
  return (
    <div className="h-full min-h-0 w-full" data-testid="code-editor" data-path={path}>
      <Editor
        value={value}
        onChange={(next) => onChange?.(next ?? '')}
        language={language}
        path={path}
        theme="codearena"
        height={height}
        loading={
          <div className="flex h-full items-center justify-center gap-2 text-sm text-fg/55">
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
        }}
      />
    </div>
  );
}
