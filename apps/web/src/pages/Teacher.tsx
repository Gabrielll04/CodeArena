import { motion } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { parseQuestionPackJson, resolveQuestions, type QuestionPack, type ValidationIssue } from '@codearena/schemas';
import { IssueList } from '../components/IssueList';
import { TopBar } from '../components/TopBar';
import { Badge, Button, Dialog, EmptyState, Icon, Panel, Spinner, Textarea, Toggle } from '../components/ui';
import { api, ApiError, type PackSummary, type StoredPack } from '../lib/api';
import { downloadFile, plural } from '../lib/format';
import { clientPlugins } from '../plugins/registry';
import { useHost } from '../stores/host';

export function TeacherPage() {
  const [packs, setPacks] = useState<PackSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [roomDialog, setRoomDialog] = useState<{ summary: PackSummary; stored: StoredPack } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = useCallback(() => {
    api
      .listPacks()
      .then(setPacks)
      .catch((err: Error) => setError(err.message));
  }, []);
  useEffect(load, [load]);

  const exportPack = async (id: string) => {
    const stored = await api.getPack(id);
    downloadFile(`${stored.id}.json`, JSON.stringify(stored.pack, null, 2));
  };

  // Busca o pack antes de abrir o diálogo: assim ele já aparece completo, sem spinner e sem mudar de tamanho.
  const openRoom = async (pack: PackSummary) => {
    setOpening(pack.id);
    setError(null);
    try {
      setRoomDialog({ summary: pack, stored: await api.getPack(pack.id) });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setOpening(null);
    }
  };

  const removePack = async (pack: PackSummary) => {
    if (!window.confirm(`Excluir "${pack.title}"? Esta ação não pode ser desfeita.`)) return;
    await api.deletePack(pack.id).catch((err: Error) => setError(err.message));
    load();
  };

  return (
    <div className="flex min-h-full flex-col">
      <TopBar>
        <span className="text-sm font-semibold text-white/60">Área do professor</span>
      </TopBar>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Biblioteca de questões</h1>
            <p className="mt-1 text-white/50">Importe um JSON, crie um pack ou abra uma sala com um pack existente.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(true)} data-testid="open-import">
              <Icon name="upload" /> Importar JSON
            </Button>
            <Button variant="violet" onClick={() => navigate('/teacher/packs/new')}>
              <Icon name="plus" /> Novo pack
            </Button>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">
            {error}
          </p>
        )}

        {!packs ? (
          <div className="flex items-center gap-2 text-white/50">
            <Spinner className="h-4 w-4" /> Carregando packs
          </div>
        ) : packs.length === 0 ? (
          <EmptyState title="Nenhum pack ainda">Importe um arquivo JSON ou crie um pack manualmente.</EmptyState>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="pack-list">
            {packs.map((pack, i) => {
              const missing = pack.pluginIds.filter((id) => !clientPlugins.has(id));
              return (
                <motion.li key={pack.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <Panel className="flex h-full flex-col p-5" data-testid={`pack-${pack.id}`}>
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      {pack.pluginIds.map((id) => (
                        <Badge key={id} tone={id === 'react-native' ? 'cyan' : id === 'backend-http' ? 'amber' : 'violet'}>
                          {clientPlugins.get(id)?.displayName ?? id}
                        </Badge>
                      ))}
                      {pack.source === 'builtin' && <Badge>Exemplo</Badge>}
                      <span className="ml-auto font-mono text-[11px] text-white/35">v{pack.version}</span>
                    </div>
                    <h2 className="font-display text-lg font-bold leading-snug">{pack.title}</h2>
                    {pack.description && <p className="mt-1 line-clamp-2 text-sm text-white/55">{pack.description}</p>}
                    <p className="mt-2 text-xs text-white/40">{plural(pack.questionCount, 'questão', 'questões')}</p>
                    {missing.length > 0 && <p className="mt-2 text-xs text-coral">Plugin não instalado: {missing.join(', ')}</p>}
                    <div className="mt-auto flex flex-wrap gap-2 pt-4">
                      <Button variant="primary" size="sm" onClick={() => void openRoom(pack)} disabled={missing.length > 0 || opening !== null} data-testid="open-room">
                        <Icon name="play" /> Abrir sala
                      </Button>
                      {pack.source === 'user' ? (
                        <Link to={`/teacher/packs/${pack.id}/edit`}>
                          <Button size="sm">Editar</Button>
                        </Link>
                      ) : (
                        <Link to={`/teacher/packs/new?from=${pack.id}`}>
                          <Button size="sm">
                            <Icon name="copy" /> Duplicar
                          </Button>
                        </Link>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => void exportPack(pack.id)} aria-label={`Exportar ${pack.title}`}>
                        <Icon name="download" />
                      </Button>
                      {pack.source === 'user' && (
                        <Button size="sm" variant="ghost" onClick={() => void removePack(pack)} aria-label={`Excluir ${pack.title}`}>
                          <Icon name="trash" />
                        </Button>
                      )}
                    </div>
                  </Panel>
                </motion.li>
              );
            })}
          </ul>
        )}
      </main>

      <ImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImported={() => {
          setImportOpen(false);
          load();
        }}
      />
      {roomDialog && <CreateRoomDialog pack={roomDialog.summary} stored={roomDialog.stored} onClose={() => setRoomDialog(null)} />}
    </div>
  );
}

function ImportDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (pack: StoredPack) => void }) {
  const [text, setText] = useState('');
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [valid, setValid] = useState<QuestionPack | null>(null);
  const [saving, setSaving] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setText('');
      setIssues([]);
      setValid(null);
    }
  }, [open]);

  const validate = (content: string) => {
    setText(content);
    if (!content.trim()) {
      setIssues([]);
      setValid(null);
      return;
    }
    const result = parseQuestionPackJson(content);
    if (!result.ok) {
      setIssues(result.issues);
      setValid(null);
      return;
    }
    const missing = [...new Set(resolveQuestions(result.value).map((q) => q.pluginId))].filter((id) => !clientPlugins.has(id));
    setIssues(missing.map((id) => ({ path: 'pack.pluginId', message: `plugin "${id}" não está instalado neste app` })));
    setValid(missing.length ? null : result.value);
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    validate(await file.text());
  };

  const save = async () => {
    if (!valid) return;
    setSaving(true);
    try {
      onImported(await api.createPack(valid));
    } catch (err) {
      setIssues(err instanceof ApiError && err.issues.length ? err.issues : [{ path: '(servidor)', message: (err as Error).message }]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Importar question pack"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!valid} loading={saving} onClick={() => void save()} data-testid="confirm-import">
            Importar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void readFile(e.dataTransfer.files[0]);
          }}
          className={`flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed p-6 text-center transition ${dragging ? 'border-lime bg-lime/5' : 'border-white/10'}`}
        >
          <p className="text-sm text-white/60">Arraste um arquivo .json aqui ou</p>
          <Button size="sm" onClick={() => fileRef.current?.click()}>
            Escolher arquivo
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            data-testid="import-file"
            onChange={(e) => void readFile(e.target.files?.[0])}
          />
        </div>
        <Textarea
          aria-label="Conteúdo JSON do pack"
          value={text}
          onChange={(e) => validate(e.target.value)}
          placeholder='{ "pack": { ... }, "questions": [ ... ] }'
          className="h-48 font-mono text-xs"
          spellCheck={false}
          data-testid="import-text"
        />
        <IssueList issues={issues} title="O arquivo tem problemas" />
        {valid && (
          <div className="rounded-xl border border-lime/30 bg-lime/[0.06] p-3 text-sm" data-testid="import-valid">
            <p className="font-semibold text-lime">Pack válido</p>
            <p className="mt-1 text-white/70">
              {valid.pack.title} · {plural(valid.questions.length, 'questão', 'questões')} · plugin {valid.pack.pluginId} · v{valid.pack.version}
            </p>
          </div>
        )}
        <p className="text-xs text-white/40">
          Formato documentado em <code className="font-mono">docs/agents/question-pack-schema.md</code>. Agentes de IA podem gerar packs com os prompts de{' '}
          <code className="font-mono">docs/agents/prompt-templates.md</code>.
        </p>
      </div>
    </Dialog>
  );
}

function CreateRoomDialog({ pack, stored, onClose }: { pack: PackSummary; stored: StoredPack; onClose: () => void }) {
  const navigate = useNavigate();
  const create = useHost((s) => s.create);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(stored.pack.questions.map((q) => q.id)));
  const [discreetMode, setDiscreet] = useState(false);
  const [streakEnabled, setStreak] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setCreating(true);
    setError(null);
    const questionIds = stored.pack.questions.filter((q) => selected.has(q.id)).map((q) => q.id);
    const res = await create({ packId: pack.id, questionIds, settings: { discreetMode, streakEnabled } });
    setCreating(false);
    if (!res.ok) return setError(res.error);
    navigate(`/host/${res.code}`);
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Abrir sala: ${pack.title}`}
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={creating} disabled={!selected.size} onClick={() => void submit()} data-testid="create-room">
            Criar sala com {plural(selected.size, 'questão', 'questões')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-white/55">Questões</p>
              <button
                type="button"
                className="text-xs text-white/50 hover:text-white"
                onClick={() =>
                  setSelected(selected.size === stored.pack.questions.length ? new Set() : new Set(stored.pack.questions.map((q) => q.id)))
                }
              >
                {selected.size === stored.pack.questions.length ? 'Desmarcar todas' : 'Marcar todas'}
              </button>
            </div>
            <ul className="max-h-64 space-y-1.5 overflow-auto">
              {stored.pack.questions.map((q, i) => (
                <li key={q.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-white/[0.03] p-3 hover:bg-white/[0.06]">
                    <input
                      type="checkbox"
                      className="mt-1 accent-[#B9FF3B]"
                      checked={selected.has(q.id)}
                      onChange={(e) => {
                        const next = new Set(selected);
                        if (e.target.checked) next.add(q.id);
                        else next.delete(q.id);
                        setSelected(next);
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {i + 1}. {q.title ?? q.prompt}
                      </span>
                      <span className="text-xs text-white/40">
                        {q.timeLimitSeconds} s · {q.baseXP} + até {q.speedBonusMax} XP · {plural(q.checklist.length, 'item', 'itens')}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4 rounded-2xl bg-white/[0.03] p-4">
            <Toggle label="Modo discreto" description="Alunos veem só o top 3 e a própria posição; sem pódio." checked={discreetMode} onChange={setDiscreet} />
            <Toggle label="Bônus de sequência" description="XP extra para acertos consecutivos." checked={streakEnabled} onChange={setStreak} />
          </div>
          {error && <p className="text-sm text-coral">{error}</p>}
      </div>
    </Dialog>
  );
}
