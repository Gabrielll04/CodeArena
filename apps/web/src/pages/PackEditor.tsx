import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { calculateXP, lintQuestion, type AuthoringWarning } from '@codearena/core';
import type { ChecklistEvaluationResult, RegexHelper } from '@codearena/plugin-sdk';
import type { ClientQuizPlugin } from '@codearena/plugin-sdk/ui';
import {
  formatZodError,
  QuestionPackSchema,
  regexCompileError,
  type ChecklistItem,
  type ChecklistRule,
  type PublicQuestion,
  type Question,
  type QuestionPack,
} from '@codearena/schemas';
import { Checklist } from '../components/Checklist';
import { CodeEditor } from '../components/CodeEditor';
import { IssueList, WarningList } from '../components/IssueList';
import { QuestionWorkspace } from '../components/QuestionWorkspace';
import { TopBar } from '../components/TopBar';
import { Badge, Button, cx, Dialog, Field, Icon, Input, Panel, Select, Spinner, Textarea, Toggle } from '../components/ui';
import { useChecklist } from '../hooks/useChecklist';
import { useDebounced } from '../hooks/useDebounced';
import { api, ApiError } from '../lib/api';
import { downloadFile, slugify } from '../lib/format';
import { GENERIC_REGEX_HELPERS } from '../lib/regexHelpers';
import { clientPlugins } from '../plugins/registry';

const RULE_LABELS: Record<ChecklistRule['type'], string> = {
  contains: 'Contém texto',
  notContains: 'Não contém texto',
  regex: 'Expressão regular',
  pluginRule: 'Validador do plugin',
};

function defaultRule(type: ChecklistRule['type'], plugin?: ClientQuizPlugin<any>): ChecklistRule {
  switch (type) {
    case 'contains':
    case 'notContains':
      return { type, value: '', caseSensitive: true, ignoreComments: false };
    case 'regex':
      return { type, pattern: '', flags: '', ignoreComments: false };
    case 'pluginRule': {
      const [name, validator] = Object.entries(plugin?.validators ?? {})[0] ?? ['', undefined];
      return { type, validator: name, params: { ...(validator?.exampleParams ?? {}) } };
    }
  }
}

function newItem(index: number): ChecklistItem {
  return { id: `item-${index}`, label: '', optional: false, rule: defaultRule('regex') };
}

function newQuestion(plugin: ClientQuizPlugin<any> | undefined, index: number): Question {
  return {
    id: `questao-${index}`,
    kind: 'build',
    prompt: '',
    timeLimitSeconds: 180,
    baseXP: 500,
    speedBonusMax: 500,
    starterCode: plugin?.authoring?.defaultStarterCode ?? '',
    solution: '',
    lockOnComplete: true,
    checklist: [newItem(1)],
    pluginData: {},
  };
}

function newPack(): QuestionPack {
  const plugin = clientPlugins.list()[0];
  return {
    pack: { title: '', description: '', pluginId: plugin?.id ?? 'react-native', version: '1.0.0', tags: [] },
    questions: [newQuestion(plugin, 1)],
  };
}

function uniqueId(base: string, taken: Set<string>): string {
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  return id;
}

export function PackEditorPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const fromId = params.get('from');
  const [draft, setDraft] = useState<QuestionPack | null>(id || fromId ? null : newPack());
  const [selected, setSelected] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const source = id ?? fromId;
    if (!source) return;
    api
      .getPack(source)
      .then((stored) => {
        const pack = structuredClone(stored.pack);
        if (!id) pack.pack.title = `${pack.pack.title} (cópia)`;
        setDraft(pack);
        setDirty(!id);
      })
      .catch((err: Error) => setLoadError(err.message));
  }, [id, fromId]);

  const validation = useMemo(() => {
    if (!draft) return null;
    const result = QuestionPackSchema.safeParse(draft);
    return result.success ? { ok: true as const, issues: [] } : { ok: false as const, issues: formatZodError(result.error) };
  }, [draft]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-coral">{loadError}</p>
        <Link to="/teacher" className="text-lime">
          Voltar
        </Link>
      </div>
    );
  }
  if (!draft || !validation) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-white/50">
        <Spinner className="h-5 w-5" /> Carregando
      </div>
    );
  }

  const plugin = clientPlugins.get(draft.pack.pluginId);
  const update = (next: QuestionPack) => {
    setDraft(next);
    setDirty(true);
    setSavedAt(null);
  };
  const updateQuestion = (index: number, question: Question) =>
    update({ ...draft, questions: draft.questions.map((q, i) => (i === index ? question : q)) });

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      if (id) {
        await api.updatePack(id, draft);
      } else {
        const created = await api.createPack(draft);
        setDirty(false);
        navigate(`/teacher/packs/${created.id}/edit`, { replace: true });
      }
      setDirty(false);
      setSavedAt(Date.now());
    } catch (err) {
      setSaveError(err instanceof ApiError && err.issues.length ? `${err.message}: ${err.issues[0]!.path} ${err.issues[0]!.message}` : (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const question = draft.questions[selected] ?? draft.questions[0]!;
  const ids = new Set(draft.questions.map((q) => q.id));

  return (
    <div className="flex h-full flex-col">
      <TopBar logoTo="/teacher">
        <Link to="/teacher" className="flex items-center gap-1 text-sm text-white/50 hover:text-white">
          <Icon name="back" /> Biblioteca
        </Link>
        <span className="truncate text-sm font-semibold">{draft.pack.title || 'Novo pack'}</span>
        {dirty ? <Badge tone="amber">Alterações não salvas</Badge> : savedAt ? <Badge tone="lime">Salvo</Badge> : null}
      </TopBar>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="min-h-0 space-y-5 overflow-auto border-b border-white/[0.07] p-4 lg:border-b-0 lg:border-r">
          <section className="space-y-3">
            <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-white/50">Pack</h2>
            <Field label="Título" htmlFor="pack-title">
              <Input id="pack-title" value={draft.pack.title} onChange={(e) => update({ ...draft, pack: { ...draft.pack, title: e.target.value } })} />
            </Field>
            <Field label="Descrição" htmlFor="pack-description">
              <Textarea
                id="pack-description"
                value={draft.pack.description}
                className="min-h-[60px]"
                onChange={(e) => update({ ...draft, pack: { ...draft.pack, description: e.target.value } })}
              />
            </Field>
            <Field label="Plugin" htmlFor="pack-plugin" hint={plugin?.description}>
              <Select id="pack-plugin" value={draft.pack.pluginId} onChange={(e) => update({ ...draft, pack: { ...draft.pack, pluginId: e.target.value } })}>
                {clientPlugins.list().map((p) => (
                  <option key={p.id} value={p.id} className="bg-ink-850">
                    {p.displayName}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Versão" htmlFor="pack-version">
                <Input id="pack-version" value={draft.pack.version} className="font-mono" onChange={(e) => update({ ...draft, pack: { ...draft.pack, version: e.target.value } })} />
              </Field>
              <Field label="Tags" htmlFor="pack-tags">
                <Input
                  id="pack-tags"
                  defaultValue={draft.pack.tags.join(', ')}
                  placeholder="mobile, ui"
                  onBlur={(e) =>
                    update({ ...draft, pack: { ...draft.pack, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) } })
                  }
                />
              </Field>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-white/50">Questões</h2>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const q = newQuestion(plugin, draft.questions.length + 1);
                  q.id = uniqueId(q.id, ids);
                  update({ ...draft, questions: [...draft.questions, q] });
                  setSelected(draft.questions.length);
                }}
              >
                <Icon name="plus" /> Nova
              </Button>
            </div>
            <ol className="space-y-1.5">
              {draft.questions.map((q, i) => (
                <li key={`${q.id}-${i}`}>
                  <div
                    className={cx(
                      'group flex items-center gap-2 rounded-xl px-3 py-2 text-sm',
                      i === selected ? 'bg-violet/20 ring-1 ring-violet/50' : 'bg-white/[0.03] hover:bg-white/[0.06]',
                    )}
                  >
                    <button type="button" className="min-w-0 flex-1 truncate text-left" onClick={() => setSelected(i)}>
                      <span className="mr-1.5 font-mono text-xs text-white/40">{i + 1}.</span>
                      {q.title || q.prompt || q.id}
                    </button>
                    <span className="flex opacity-0 transition group-hover:opacity-100">
                      <button type="button" aria-label="Mover para cima" disabled={i === 0} className="p-1 text-white/50 hover:text-white disabled:opacity-20" onClick={() => {
                        const qs = [...draft.questions];
                        [qs[i - 1], qs[i]] = [qs[i]!, qs[i - 1]!];
                        update({ ...draft, questions: qs });
                        setSelected(i - 1);
                      }}>
                        <Icon name="up" className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label="Mover para baixo" disabled={i === draft.questions.length - 1} className="p-1 text-white/50 hover:text-white disabled:opacity-20" onClick={() => {
                        const qs = [...draft.questions];
                        [qs[i + 1], qs[i]] = [qs[i]!, qs[i + 1]!];
                        update({ ...draft, questions: qs });
                        setSelected(i + 1);
                      }}>
                        <Icon name="down" className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label="Duplicar questão" className="p-1 text-white/50 hover:text-white" onClick={() => {
                        const copy = { ...structuredClone(q), id: uniqueId(`${q.id}-copia`, ids) };
                        const qs = [...draft.questions];
                        qs.splice(i + 1, 0, copy);
                        update({ ...draft, questions: qs });
                        setSelected(i + 1);
                      }}>
                        <Icon name="copy" className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label="Excluir questão" disabled={draft.questions.length === 1} className="p-1 text-white/50 hover:text-coral disabled:opacity-20" onClick={() => {
                        update({ ...draft, questions: draft.questions.filter((_, j) => j !== i) });
                        setSelected(Math.max(0, Math.min(selected, draft.questions.length - 2)));
                      }}>
                        <Icon name="trash" className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section className="space-y-2 border-t border-white/[0.07] pt-4">
            <Button variant="primary" className="w-full" disabled={!validation.ok} loading={saving} onClick={() => void save()} data-testid="save-pack">
              Salvar pack
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              disabled={!validation.ok}
              onClick={() => downloadFile(`${slugify(draft.pack.title, 'pack')}.json`, JSON.stringify(draft, null, 2))}
            >
              <Icon name="download" /> Exportar JSON
            </Button>
            {saveError && <p className="text-xs text-coral">{saveError}</p>}
            {!validation.ok && <IssueList issues={validation.issues.slice(0, 12)} title="Falta completar" />}
          </section>
        </aside>

        <main className="min-h-0 overflow-auto">
          {plugin ? (
            <QuestionEditor
              key={`${selected}-${draft.pack.pluginId}`}
              question={question}
              plugin={plugin}
              onChange={(q) => updateQuestion(selected, q)}
            />
          ) : (
            <p className="p-6 text-coral">Plugin "{draft.pack.pluginId}" não está instalado.</p>
          )}
        </main>
      </div>
    </div>
  );
}

function QuestionEditor({ question, plugin, onChange }: { question: Question; plugin: ClientQuizPlugin<any>; onChange: (q: Question) => void }) {
  const [testCode, setTestCode] = useState(question.solution || question.starterCode);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [server, setServer] = useState<{ evaluation: ChecklistEvaluationResult; warnings: AuthoringWarning[] } | { error: string } | null>(null);
  const [serverBusy, setServerBusy] = useState(false);
  const [warnings, setWarnings] = useState<AuthoringWarning[] | null>(null);
  const publicQuestion: PublicQuestion = useMemo(() => {
    const { solution: _s, ...rest } = question;
    return { ...rest, pluginId: plugin.id };
  }, [question, plugin.id]);
  const debouncedQuestion = useDebounced(question, 600);
  const debouncedPublic = useDebounced(publicQuestion, 300);
  const live = useChecklist(testCode, debouncedPublic, plugin);
  const xpHalf = calculateXP({ baseXP: question.baseXP, speedBonusMax: question.speedBonusMax, timeLimitMs: question.timeLimitSeconds * 1000, remainingMs: question.timeLimitSeconds * 500 });

  useEffect(() => {
    let cancelled = false;
    setWarnings(null);
    void lintQuestion({ ...debouncedQuestion, pluginId: plugin.id }, plugin)
      .then((w) => !cancelled && setWarnings(w))
      .catch(() => !cancelled && setWarnings([]));
    return () => {
      cancelled = true;
    };
  }, [debouncedQuestion, plugin]);

  const set = <K extends keyof Question>(key: K, value: Question[K]) => onChange({ ...question, [key]: value });
  const setItem = (index: number, item: ChecklistItem) => set('checklist', question.checklist.map((it, i) => (i === index ? item : it)));
  const helpers = [...(plugin.authoring?.regexHelpers ?? []), ...GENERIC_REGEX_HELPERS];

  const testOnServer = async () => {
    setServerBusy(true);
    try {
      setServer(await api.testQuestion(question, plugin.id, testCode));
    } catch (err) {
      setServer({ error: err instanceof ApiError && err.issues.length ? `${err.issues[0]!.path}: ${err.issues[0]!.message}` : (err as Error).message });
    } finally {
      setServerBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Editar questão</h1>
        <Button variant="violet" onClick={() => setPreviewOpen(true)} data-testid="preview-as-student">
          <Icon name="eye" /> Pré-visualizar como aluno
        </Button>
      </div>

      <Panel className="space-y-4 p-5">
        <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
          <Field label="Título curto (opcional)" htmlFor="q-title">
            <Input id="q-title" value={question.title ?? ''} maxLength={80} onChange={(e) => set('title', e.target.value || undefined)} />
          </Field>
          <Field label="Id" htmlFor="q-id" hint="Único no pack">
            <Input id="q-id" value={question.id} className="font-mono" onChange={(e) => set('id', slugify(e.target.value, ''))} />
          </Field>
        </div>
        <div className="space-y-1.5">
          <span className="block text-xs font-semibold uppercase tracking-wider text-white/55">Tipo da questão</span>
          <div role="radiogroup" aria-label="Tipo da questão" className="inline-flex rounded-xl bg-ink-950/60 p-1 ring-1 ring-white/10">
            {(
              [
                ['build', 'Construir', 'O aluno escreve a solução.'],
                ['debug', 'Depurar', 'O aluno corrige um código com bug.'],
              ] as const
            ).map(([value, label, hint]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={question.kind === value}
                title={hint}
                data-testid={`kind-${value}`}
                onClick={() => set('kind', value)}
                className={cx(
                  'rounded-lg px-4 py-1.5 text-sm font-semibold transition',
                  question.kind === value ? (value === 'debug' ? 'bg-coral/20 text-coral' : 'bg-white/10 text-white') : 'text-white/50 hover:text-white',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-xs text-white/40">
            {question.kind === 'debug'
              ? 'O código inicial é o código com bug. Descreva o sintoma no enunciado e verifique o comportamento corrigido na checklist.'
              : 'O código inicial é o ponto de partida (pode ficar vazio).'}
          </p>
        </div>
        <Field label="Enunciado" htmlFor="q-prompt" hint="Curto e objetivo. Use `crases` para destacar código.">
          <Textarea id="q-prompt" value={question.prompt} onChange={(e) => set('prompt', e.target.value)} placeholder='Ex.: Faça um app com um botão escrito "Clique aqui" em React Native.' />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tempo (segundos)" htmlFor="q-time">
            <Input id="q-time" type="number" min={10} max={3600} value={question.timeLimitSeconds} onChange={(e) => set('timeLimitSeconds', Number(e.target.value))} />
          </Field>
          <Field label="XP base" htmlFor="q-base">
            <Input id="q-base" type="number" min={0} value={question.baseXP} onChange={(e) => set('baseXP', Number(e.target.value))} />
          </Field>
          <Field label="Bônus máximo de velocidade" htmlFor="q-bonus">
            <Input id="q-bonus" type="number" min={0} value={question.speedBonusMax} onChange={(e) => set('speedBonusMax', Number(e.target.value))} />
          </Field>
        </div>
        <p className="text-xs text-white/45">
          Exemplo: quem concluir com metade do tempo restante recebe {xpHalf.base} + {xpHalf.speedBonus} = <strong className="text-white/80">{xpHalf.total} XP</strong>.
        </p>
        <Toggle label="Travar o editor após resposta correta" checked={question.lockOnComplete} onChange={(v) => set('lockOnComplete', v)} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel className="overflow-hidden">
          <p className="border-b border-white/[0.07] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white/50">
            {question.kind === 'debug' ? 'Código com bug (ponto de partida)' : 'Código inicial'}
          </p>
          <div className="h-56">
            <CodeEditor value={question.starterCode} onChange={(v) => set('starterCode', v)} language={plugin.editorLanguage} path={`file:///authoring/${question.id}/starter-${plugin.editorFileName ?? 'code'}`} fontSize={13} />
          </div>
        </Panel>
        <Panel className="overflow-hidden">
          <p className="border-b border-white/[0.07] px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-white/50">Solução esperada</p>
          <div className="h-56">
            <CodeEditor value={question.solution} onChange={(v) => set('solution', v)} language={plugin.editorLanguage} path={`file:///authoring/${question.id}/solution-${plugin.editorFileName ?? 'code'}`} fontSize={13} />
          </div>
        </Panel>
      </div>

      <Panel className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold">Checklist</h2>
          <Button
            size="sm"
            onClick={() => {
              const taken = new Set(question.checklist.map((i) => i.id));
              set('checklist', [...question.checklist, { ...newItem(question.checklist.length + 1), id: uniqueId(`item-${question.checklist.length + 1}`, taken) }]);
            }}
            disabled={question.checklist.length >= 12}
          >
            <Icon name="plus" /> Adicionar item
          </Button>
        </div>
        <p className="text-xs text-white/45">Itens objetivos, no imperativo ("Criar o componente App"). Todos os obrigatórios precisam estar concluídos para a resposta valer.</p>
        <ol className="space-y-3">
          {question.checklist.map((item, index) => (
            <ItemEditor
              key={index}
              index={index}
              item={item}
              plugin={plugin}
              helpers={helpers}
              status={live.evaluation.items.find((r) => r.id === item.id)?.status}
              onChange={(next) => setItem(index, next)}
              onRemove={question.checklist.length > 1 ? () => set('checklist', question.checklist.filter((_, i) => i !== index)) : undefined}
              onMove={(dir) => {
                const list = [...question.checklist];
                const target = index + dir;
                if (target < 0 || target >= list.length) return;
                [list[index], list[target]] = [list[target]!, list[index]!];
                set('checklist', list);
              }}
            />
          ))}
        </ol>
      </Panel>

      <Panel className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold">Testar a checklist</h2>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" onClick={() => setTestCode(question.solution)}>
              Usar solução
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setTestCode(question.starterCode)}>
              {question.kind === 'debug' ? 'Usar código com bug' : 'Usar código inicial'}
            </Button>
            <Button size="sm" loading={serverBusy} onClick={() => void testOnServer()} data-testid="test-on-server">
              Validar no servidor
            </Button>
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="h-72 overflow-hidden rounded-xl ring-1 ring-white/10">
            <CodeEditor value={testCode} onChange={setTestCode} language={plugin.editorLanguage} path={`file:///authoring/${question.id}/test-${plugin.editorFileName ?? 'code'}`} fontSize={13} />
          </div>
          <Checklist items={question.checklist} evaluation={live.evaluation} checking={live.checking} announce={false} compact />
        </div>
        {server && (
          <div className="rounded-xl bg-white/[0.03] p-3 text-sm" data-testid="server-test-result">
            {'error' in server ? (
              <p className="text-coral">{server.error}</p>
            ) : (
              <p className={server.evaluation.allRequiredDone ? 'text-lime' : 'text-amber'}>
                Servidor: {server.evaluation.requiredDone}/{server.evaluation.requiredTotal} itens obrigatórios confirmados
                {server.evaluation.allRequiredDone ? '. Resposta seria aceita.' : '. Resposta seria recusada.'}
              </p>
            )}
          </div>
        )}
      </Panel>

      <Panel className="space-y-3 p-5">
        <h2 className="font-display text-lg font-bold">Qualidade da questão</h2>
        {warnings ? <WarningList warnings={warnings} /> : <Spinner className="h-4 w-4 text-white/40" />}
      </Panel>

      <StudentPreview open={previewOpen} onClose={() => setPreviewOpen(false)} question={publicQuestion} plugin={plugin} />
    </div>
  );
}

function ItemEditor({
  item,
  index,
  plugin,
  helpers,
  status,
  onChange,
  onRemove,
  onMove,
}: {
  item: ChecklistItem;
  index: number;
  plugin: ClientQuizPlugin<any>;
  helpers: RegexHelper[];
  status?: string;
  onChange: (item: ChecklistItem) => void;
  onRemove?: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const rule = item.rule;
  const [paramsText, setParamsText] = useState(rule.type === 'pluginRule' ? JSON.stringify(rule.params, null, 2) : '{}');
  const [paramsError, setParamsError] = useState<string | null>(null);
  const [helperId, setHelperId] = useState('');
  const [helperInput, setHelperInput] = useState('');
  const helper = helpers.find((h) => h.id === helperId);
  const validators = Object.entries(plugin.validators ?? {});
  const regexError = rule.type === 'regex' && rule.pattern ? regexCompileError(rule.pattern, rule.flags) : null;

  const setRule = (next: ChecklistRule) => onChange({ ...item, rule: next });
  const setLabel = (label: string) => {
    const autoId = item.id === slugify(item.label, '') || /^item-\d+$/.test(item.id);
    onChange({ ...item, label, id: autoId && label.trim() ? slugify(label) : item.id });
  };

  const applyHelper = () => {
    if (!helper) return;
    const built = helper.build(helperInput || helper.defaultInput || '');
    onChange({
      ...item,
      label: item.label || built.label,
      id: item.label ? item.id : slugify(built.label),
      rule: { type: 'regex', pattern: built.pattern, flags: built.flags ?? '', ignoreComments: rule.type === 'regex' ? rule.ignoreComments : false },
    });
    setHelperId('');
  };

  return (
    <li className="rounded-2xl border border-white/[0.07] bg-ink-950/40 p-4" data-testid={`item-editor-${index}`}>
      <div className="flex flex-wrap items-start gap-2">
        <span
          title={status === 'done' ? 'Satisfeito pelo código de teste' : 'Não satisfeito pelo código de teste'}
          className={cx('mt-2.5 h-3 w-3 shrink-0 rounded-full', status === 'done' ? 'bg-lime' : status === 'failed' ? 'bg-coral' : 'bg-white/20')}
        />
        <Input aria-label="Texto do item" value={item.label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Criar o componente App" className="min-w-[200px] flex-1" />
        <Select aria-label="Tipo de regra" value={rule.type} onChange={(e) => {
          const type = e.target.value as ChecklistRule['type'];
          const next = defaultRule(type, plugin);
          if (next.type === 'pluginRule') setParamsText(JSON.stringify(next.params, null, 2));
          setRule(next);
        }} className="w-48">
          {(Object.keys(RULE_LABELS) as ChecklistRule['type'][]).map((t) => (
            <option key={t} value={t} className="bg-ink-850" disabled={t === 'pluginRule' && validators.length === 0}>
              {RULE_LABELS[t]}
            </option>
          ))}
        </Select>
        <span className="flex">
          <button type="button" aria-label="Mover item para cima" className="p-2 text-white/40 hover:text-white" onClick={() => onMove(-1)}>
            <Icon name="up" />
          </button>
          <button type="button" aria-label="Mover item para baixo" className="p-2 text-white/40 hover:text-white" onClick={() => onMove(1)}>
            <Icon name="down" />
          </button>
          {onRemove && (
            <button type="button" aria-label="Remover item" className="p-2 text-white/40 hover:text-coral" onClick={onRemove}>
              <Icon name="trash" />
            </button>
          )}
        </span>
      </div>

      <div className="mt-3 space-y-3 pl-5">
        {(rule.type === 'contains' || rule.type === 'notContains') && (
          <div className="flex flex-wrap items-center gap-3">
            <Input aria-label="Texto procurado" value={rule.value} onChange={(e) => setRule({ ...rule, value: e.target.value })} placeholder="Texto exato" className="flex-1 font-mono" />
            <label className="flex items-center gap-1.5 text-xs text-white/60">
              <input type="checkbox" className="accent-[#B9FF3B]" checked={rule.caseSensitive} onChange={(e) => setRule({ ...rule, caseSensitive: e.target.checked })} />
              Diferenciar maiúsculas
            </label>
            <label className="flex items-center gap-1.5 text-xs text-white/60">
              <input type="checkbox" className="accent-[#B9FF3B]" checked={rule.ignoreComments} onChange={(e) => setRule({ ...rule, ignoreComments: e.target.checked })} />
              Ignorar comentários
            </label>
          </div>
        )}

        {rule.type === 'regex' && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label="Padrão regex" value={rule.pattern} onChange={(e) => setRule({ ...rule, pattern: e.target.value })} placeholder="export\s+default\s+function\s+App\s*\(" className="min-w-[240px] flex-1 font-mono" />
              <Input aria-label="Flags" value={rule.flags} onChange={(e) => setRule({ ...rule, flags: e.target.value.replace(/[^imsu]/g, '') })} placeholder="flags" className="w-20 font-mono" />
              <label className="flex items-center gap-1.5 text-xs text-white/60">
                <input type="checkbox" className="accent-[#B9FF3B]" checked={rule.ignoreComments} onChange={(e) => setRule({ ...rule, ignoreComments: e.target.checked })} />
                Ignorar comentários
              </label>
            </div>
            {regexError && <p className="text-xs text-coral">Regex inválida: {regexError}</p>}
          </>
        )}

        {rule.type !== 'pluginRule' && (
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label="Padrões comuns" value={helperId} onChange={(e) => {
              setHelperId(e.target.value);
              setHelperInput(helpers.find((h) => h.id === e.target.value)?.defaultInput ?? '');
            }} className="w-56 text-xs">
              <option value="" className="bg-ink-850">Padrões comuns de regex</option>
              {helpers.map((h) => (
                <option key={h.id} value={h.id} className="bg-ink-850">
                  {h.label}
                </option>
              ))}
            </Select>
            {helper?.inputLabel && (
              <Input aria-label={helper.inputLabel} placeholder={helper.inputLabel} value={helperInput} onChange={(e) => setHelperInput(e.target.value)} className="w-48 text-xs" />
            )}
            {helper && (
              <Button size="sm" onClick={applyHelper}>
                Aplicar
              </Button>
            )}
          </div>
        )}

        {rule.type === 'pluginRule' && (
          <div className="space-y-2">
            <Select aria-label="Validador" value={rule.validator} onChange={(e) => {
              const v = plugin.validators?.[e.target.value];
              const params = { ...(v?.exampleParams ?? {}) };
              setParamsText(JSON.stringify(params, null, 2));
              setRule({ type: 'pluginRule', validator: e.target.value, params });
            }}>
              {validators.map(([name, v]) => (
                <option key={name} value={name} className="bg-ink-850">
                  {name} ({v.mode === 'dynamic' ? 'executa o código' : 'análise estática'})
                </option>
              ))}
            </Select>
            <p className="text-xs text-white/45">{plugin.validators?.[rule.validator]?.description}</p>
            <Textarea
              aria-label="Parâmetros do validador (JSON)"
              value={paramsText}
              spellCheck={false}
              className="min-h-[90px] font-mono text-xs"
              onChange={(e) => {
                setParamsText(e.target.value);
                try {
                  const params = JSON.parse(e.target.value);
                  if (!params || typeof params !== 'object' || Array.isArray(params)) throw new Error('Use um objeto JSON');
                  setParamsError(null);
                  setRule({ ...rule, params });
                } catch (err) {
                  setParamsError((err as Error).message);
                }
              }}
            />
            {paramsError && <p className="text-xs text-coral">JSON inválido: {paramsError}</p>}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Input aria-label="Id do item" value={item.id} onChange={(e) => onChange({ ...item, id: slugify(e.target.value, '') })} className="w-44 font-mono text-xs" />
          <Input aria-label="Dica (opcional)" value={item.hint ?? ''} onChange={(e) => onChange({ ...item, hint: e.target.value || undefined })} placeholder="Dica exibida enquanto pendente (opcional)" className="min-w-[200px] flex-1 text-xs" />
          <label className="flex items-center gap-1.5 text-xs text-white/60">
            <input type="checkbox" className="accent-[#B9FF3B]" checked={item.optional} onChange={(e) => onChange({ ...item, optional: e.target.checked })} />
            Opcional
          </label>
        </div>
      </div>
    </li>
  );
}

function StudentPreview({ open, onClose, question, plugin }: { open: boolean; onClose: () => void; question: PublicQuestion; plugin: ClientQuizPlugin<any> }) {
  const [code, setCode] = useState(question.starterCode);
  useEffect(() => {
    if (open) setCode(question.starterCode);
  }, [open, question.starterCode]);
  const live = useChecklist(code, question, plugin, { enabled: open });
  return (
    <Dialog open={open} onClose={onClose} title="Pré-visualização do aluno (sem cronômetro, sem envio)" wide="full">
      <div className="-mx-5 -my-4 h-[calc(100vh-10rem)]">
        <QuestionWorkspace
          question={question}
          plugin={plugin}
          code={code}
          onCodeChange={setCode}
          readOnly={false}
          live={live}
          mode="preview"
          modelPath={`file:///preview/${question.id}/${plugin.editorFileName ?? 'code'}`}
          onRestore={() => setCode(question.starterCode)}
        />
      </div>
    </Dialog>
  );
}
