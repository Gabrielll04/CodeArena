import { useState, type ReactNode } from 'react';
import type { ClientQuizPlugin } from '@codearena/plugin-sdk/ui';
import type { PublicQuestion } from '@codearena/schemas';
import type { LiveChecklist } from '../hooks/useChecklist';
import { Checklist } from './Checklist';
import { DebugBar } from './DebugBar';
import { CodeEditor } from './CodeEditor';
import { PluginPanel, pluginPanelTitle } from './PluginPanel';
import { Prompt } from './Prompt';
import { Badge, cx } from './ui';

export interface QuestionWorkspaceProps {
  question: PublicQuestion;
  plugin: ClientQuizPlugin<any> | undefined;
  code: string;
  onCodeChange: (code: string) => void;
  readOnly: boolean;
  live: LiveChecklist;
  mode: 'play' | 'preview' | 'authoring';
  modelPath: string;
  /** Conteúdo abaixo da checklist (status da resposta). */
  status?: ReactNode;
  /** Sobreposição no topo do editor (ex.: resposta registrada). */
  editorOverlay?: ReactNode;
  heading?: ReactNode;
  /** Volta o editor ao código inicial (usado nas questões de depuração). */
  onRestore?: () => void;
}

type MobileTab = 'task' | 'code' | 'panel';

export function MissingPlugin({ pluginId }: { pluginId: string }) {
  return (
    <div role="alert" className="m-6 rounded-2xl border border-tomato/30 bg-tomato/[0.07] p-6">
      <p className="font-display text-lg font-bold text-tomato">Plugin não instalado</p>
      <p className="mt-1 text-sm text-fg/70">
        Esta questão usa o plugin <code className="font-mono text-tomato">{pluginId}</code>, que não está registrado neste app.
        Registre-o em <code className="font-mono">apps/web/src/plugins/registry.tsx</code> ou corrija o <code className="font-mono">pluginId</code> do pack.
      </p>
    </div>
  );
}

export function QuestionWorkspace(props: QuestionWorkspaceProps) {
  const { question, plugin, code, onCodeChange, readOnly, live, mode, modelPath, status, editorOverlay, heading, onRestore } = props;
  const [tab, setTab] = useState<MobileTab>('code');

  if (!plugin) return <MissingPlugin pluginId={question.pluginId} />;

  const { evaluation } = live;
  const remaining = evaluation.requiredTotal - evaluation.requiredDone;
  const panelTitle = pluginPanelTitle(plugin);

  const mobileTabs: { id: MobileTab; label: string }[] = [
    { id: 'task', label: `Tarefa ${evaluation.requiredDone}/${evaluation.requiredTotal}` },
    { id: 'code', label: 'Código' },
    { id: 'panel', label: panelTitle },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="flex gap-1 border-b border-fg/10 bg-surface px-2 py-1.5 lg:hidden" aria-label="Seções da questão">
        {mobileTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cx(
              'flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold',
              tab === t.id ? 'bg-ink text-white' : 'text-fg/65',
              t.id === 'task' && evaluation.allRequiredDone && tab !== t.id && 'text-mint',
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)_minmax(320px,400px)]">
        <aside className={cx('min-h-0 flex-col gap-4 overflow-auto p-4 lg:flex', tab === 'task' ? 'flex' : 'hidden')}>
          {heading}
          <div className="rounded-2xl border border-fg/[0.09] bg-surface p-4" data-testid="question-prompt">
            {question.kind === 'debug' && (
              <Badge tone="tomato" className="mb-2">
                Depuração
              </Badge>
            )}
            {question.title && <h2 className="mb-2 font-display text-xl font-extrabold leading-tight">{question.title}</h2>}
            <Prompt text={question.prompt} />
          </div>
          <Checklist items={question.checklist} evaluation={evaluation} checking={live.checking} announce={mode !== 'authoring'} />
          {status ?? (
            <p className="text-sm text-fg/60" aria-live="polite">
              {evaluation.allRequiredDone ? 'Checklist completa.' : `Faltam ${remaining} ${remaining === 1 ? 'item' : 'itens'}.`}
            </p>
          )}
        </aside>

        <section className={cx('workbench relative min-h-[50vh] flex-col lg:flex lg:min-h-0 lg:rounded-tl-2xl', tab === 'code' ? 'flex' : 'hidden')} aria-label="Editor">
          <div className="flex items-center justify-between border-b border-fg/[0.08] px-4 py-2 text-xs text-fg/60">
            <span className="font-mono">{plugin.editorFileName ?? 'codigo'}</span>
            <span className="flex items-center gap-3">
              <span className="lg:hidden" aria-live="polite">
                {evaluation.requiredDone}/{evaluation.requiredTotal}
              </span>
              {readOnly && <span className="font-semibold text-mint">Somente leitura</span>}
            </span>
          </div>
          {question.kind === 'debug' && (
            <DebugBar
              original={plugin.getStarterCode(question)}
              current={code}
              language={plugin.editorLanguage}
              readOnly={readOnly}
              onRestore={() => onRestore?.()}
            />
          )}
          <div className="relative min-h-0 flex-1">
            <CodeEditor
              value={code}
              onChange={readOnly ? undefined : onCodeChange}
              language={plugin.editorLanguage}
              path={modelPath}
              readOnly={readOnly}
              ariaLabel="Editor de código da resposta"
            />
            {editorOverlay}
          </div>
        </section>

        <aside className={cx('workbench min-h-0 flex-col lg:flex lg:border-l lg:border-fg/[0.08]', tab === 'panel' ? 'flex' : 'hidden')} aria-label={panelTitle}>
          <PluginPanel plugin={plugin} context={{ question, code, readOnly, evaluation, mode }} />
        </aside>
      </div>
    </div>
  );
}
