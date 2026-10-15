import type { ChecklistEvaluationResult } from '@codearena/plugin-sdk';
import type { ClientQuizPlugin, PluginUIContext } from '@codearena/plugin-sdk/ui';
import type { PublicQuestion } from '@codearena/schemas';
import { CodeEditor } from './CodeEditor';

/** O plugin desenha o próprio editor de resposta (plugins visuais: topologias, circuitos, diagramas). */
export const hasPluginEditor = (plugin: ClientQuizPlugin<any> | undefined): boolean => typeof plugin?.renderEditor === 'function';

/** Nome da resposta na interface: "Código" para plugins de código, ou o que o plugin declarar (ex.: "Topologia"). */
export const answerLabel = (plugin: ClientQuizPlugin<any> | undefined): string => plugin?.answerLabel?.trim() || 'Código';

export interface AnswerEditorProps {
  plugin: ClientQuizPlugin<any>;
  question: PublicQuestion;
  value: string;
  /** Ausente: somente leitura. */
  onChange?: (value: string) => void;
  mode: PluginUIContext['mode'];
  /** Modelo do Monaco (um por questão/arquivo); ignorado pelos editores de plugin. */
  path: string;
  evaluation?: ChecklistEvaluationResult | null;
  fontSize?: number;
  ariaLabel?: string;
}

/**
 * Editor da resposta do aluno. Plugins de código usam o editor de código do app; plugins visuais trocam por
 * `renderEditor`. Nos dois casos a resposta é texto e segue o mesmo caminho até o servidor.
 */
export function AnswerEditor({ plugin, question, value, onChange, mode, path, evaluation = null, fontSize, ariaLabel }: AnswerEditorProps) {
  const readOnly = !onChange;
  if (plugin.renderEditor) {
    return (
      <div className="h-full min-h-0 w-full" data-testid="plugin-editor" data-readonly={readOnly}>
        {plugin.renderEditor({ question, code: value, readOnly, evaluation, mode, onChange })}
      </div>
    );
  }
  return (
    <CodeEditor
      value={value}
      onChange={onChange}
      language={plugin.editorLanguage}
      path={path}
      readOnly={readOnly}
      fontSize={fontSize}
      ariaLabel={ariaLabel}
    />
  );
}

/** Duas respostas lado a lado, somente leitura, desenhadas pelo editor do plugin (comparação de plugins visuais). */
export function AnswerCompare({
  plugin,
  question,
  before,
  after,
  beforeLabel,
  afterLabel,
  mode,
}: {
  plugin: ClientQuizPlugin<any>;
  question: PublicQuestion;
  before: string;
  after: string;
  beforeLabel: string;
  afterLabel: string;
  mode: PluginUIContext['mode'];
}) {
  return (
    <div className="grid h-full min-h-0 gap-3 md:grid-cols-2" data-testid="answer-compare">
      {[
        { label: beforeLabel, value: before, key: 'before' },
        { label: afterLabel, value: after, key: 'after' },
      ].map((side) => (
        <section key={side.key} className="flex min-h-[240px] flex-col overflow-hidden rounded-xl ring-1 ring-white/10" aria-label={side.label}>
          <p className="border-b border-white/[0.07] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/45">{side.label}</p>
          <div className="min-h-0 flex-1 bg-ink-950/60">
            <AnswerEditor plugin={plugin} question={question} value={side.value} mode={mode} path="" />
          </div>
        </section>
      ))}
    </div>
  );
}
