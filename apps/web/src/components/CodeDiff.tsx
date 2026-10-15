import { DiffEditor } from '@monaco-editor/react';
import '../monaco';
import { Spinner } from './ui';
import type { PublicQuestion } from '@codearena/schemas';
import { useClientPlugin } from '../plugins/registry';
import { AnswerCompare, AnswerEditor, answerLabel, hasPluginEditor } from './AnswerEditor';

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
          <div className="flex h-full items-center justify-center gap-2 text-sm text-white/40">
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

/**
 * Correção esperada ao fim da questão: texto simples em questões comuns, diff em questões de depuração.
 * Plugins visuais mostram a solução no próprio editor, somente leitura (lado a lado com o original na depuração).
 */
export function SolutionView({ solution, question }: { solution: string; question: PublicQuestion | undefined }) {
  const plugin = useClientPlugin(question?.pluginId).plugin;
  const debug = question?.kind === 'debug';
  const starter = question?.starterCode ?? '';
  if (plugin && question && hasPluginEditor(plugin)) {
    const label = answerLabel(plugin);
    return (
      <div className="mt-2 h-80" data-testid={debug ? 'solution-diff' : 'solution-view'}>
        {debug ? (
          <AnswerCompare plugin={plugin} question={question} before={starter} after={solution} beforeLabel={`${label} com defeito`} afterLabel="Correção esperada" mode="play" />
        ) : (
          <div className="h-full overflow-hidden rounded-xl bg-ink-950/60 ring-1 ring-white/10">
            <AnswerEditor plugin={plugin} question={question} value={solution} mode="play" path="" />
          </div>
        )}
      </div>
    );
  }
  const language = plugin?.editorLanguage ?? 'javascript';
  if (!debug) {
    return <pre className="mt-2 overflow-auto rounded-xl bg-ink-950/70 p-4 font-mono text-xs leading-relaxed text-white/85">{solution}</pre>;
  }
  return (
    <div className="mt-2" data-testid="solution-diff">
      <div className="mb-2 flex justify-between text-[11px] font-semibold uppercase tracking-wider text-white/45">
        <span>Código com bug</span>
        <span>Correção esperada</span>
      </div>
      <div className="h-72 overflow-hidden rounded-xl ring-1 ring-white/10">
        <CodeDiff original={starter} modified={solution} language={language} />
      </div>
    </div>
  );
}
