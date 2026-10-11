import { DiffEditor } from '@monaco-editor/react';
import '../monaco';
import { Spinner } from './ui';
import { useClientPlugin } from '../plugins/registry';

export interface CodeDiffProps {
  original: string;
  modified: string;
  language: string;
  fontSize?: number;
}

/** Diff lado a lado (Monaco) somente leitura, com o tema do jogo. */
export function CodeDiff({ original, modified, language, fontSize = 13 }: CodeDiffProps) {
  return (
    <div className="h-full min-h-0 w-full" data-testid="code-diff">
      <DiffEditor
        original={original}
        modified={modified}
        language={language}
        theme="codearena"
        height="100%"
        loading={
          <div className="flex h-full items-center justify-center gap-2 text-sm text-fg/55">
            <Spinner className="h-4 w-4" /> Carregando diferenças
          </div>
        }
        options={{
          readOnly: true,
          originalEditable: false,
          renderSideBySide: true,
          automaticLayout: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize,
          fontFamily: '"JetBrains Mono Variable", ui-monospace, monospace',
          wordWrap: 'on',
          renderOverviewRuler: false,
          padding: { top: 12, bottom: 12 },
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        }}
      />
    </div>
  );
}

/** Correção esperada ao fim da questão: texto simples em questões comuns, diff em questões de depuração. */
export function SolutionView({ solution, starter, debug, pluginId }: { solution: string; starter: string; debug: boolean; pluginId: string }) {
  const language = useClientPlugin(pluginId).plugin?.editorLanguage ?? 'javascript';
  if (!debug) {
    return <pre className="mt-2 overflow-auto rounded-xl bg-sunken p-4 font-mono text-xs leading-relaxed text-fg/85">{solution}</pre>;
  }
  return (
    <div className="mt-2" data-testid="solution-diff">
      <div className="mb-2 flex justify-between text-xs font-bold text-fg/60">
        <span>Código com bug</span>
        <span>Correção esperada</span>
      </div>
      <div className="h-72 overflow-hidden rounded-xl ring-1 ring-fg/10">
        <CodeDiff original={starter} modified={solution} language={language} />
      </div>
    </div>
  );
}
