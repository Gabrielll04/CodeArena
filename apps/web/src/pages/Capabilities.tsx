import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { capabilitiesToRecover, type CapabilityMap } from '@codearena/core';
import type { SessionHistorySummary } from '@codearena/schemas';
import { CapabilityBars, StatusLegend } from '../components/CapabilityBars';
import { CapabilityMatrix } from '../components/CapabilityMatrix';
import { TopBar } from '../components/TopBar';
import { Button, cx, Dialog, EmptyState, Icon, Input, Panel, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { byAttention, countsByCapability, questionsFor, STATUS_META, totalCounts } from '../lib/capabilities';
import { plural } from '../lib/format';
import { dateTime } from './History';

const shortDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

/** Mapa de capacidades: as atividades avaliadas juntas, por capacidade e por aluno, e a recuperação a partir delas. */
export function CapabilitiesPage() {
  const [activities, setActivities] = useState<SessionHistorySummary[] | null>(null);
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [map, setMap] = useState<CapabilityMap | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focus, setFocus] = useState<Set<string>>(new Set());
  const [students, setStudents] = useState<Set<string>>(new Set());
  const [recovery, setRecovery] = useState<string[] | null>(null);

  useEffect(() => {
    api
      .listHistory()
      .then((list) => {
        const assessments = list.filter((s) => s.mode === 'assessment').sort((a, b) => a.startedAt - b.startedAt);
        setActivities(assessments);
        setIncluded(new Set(assessments.map((s) => s.id)));
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  // Mantém o mapa anterior na tela (esmaecido) enquanto o novo carrega: nada pula de lugar.
  useEffect(() => {
    if (!activities?.length) return;
    if (included.size === 0) return setMap(null);
    let current = true;
    setLoading(true);
    api
      .capabilityMap([...included])
      .then((next) => current && setMap(next))
      .catch((err: Error) => current && setError(err.message))
      .finally(() => current && setLoading(false));
    return () => {
      current = false;
    };
  }, [activities, included]);

  const counts = useMemo(() => (map ? countsByCapability(map) : new Map()), [map]);
  const ordered = useMemo(() => (map ? byAttention(map, counts) : []), [map, counts]);
  const totals = useMemo(() => (map ? totalCounts(map) : null), [map]);

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };
  const toggleActivity = (id: string) => setIncluded((s) => toggle(s, id));
  const toggleFocus = useCallback((key: string) => setFocus((s) => toggle(s, key)), []);
  const toggleStudent = useCallback((key: string) => setStudents((s) => toggle(s, key)), []);
  const toggleAllStudents = () =>
    setStudents((s) => (map && map.students.every((st) => s.has(st.key)) ? new Set() : new Set(map?.students.map((st) => st.key))));

  /** Recuperação do que está selecionado: capacidades marcadas, senão o que os alunos marcados (ou a turma) precisam. */
  const openRecovery = () => {
    if (!map) return;
    const keys = focus.size ? [...focus] : capabilitiesToRecover(map, students.size ? [...students] : undefined);
    setRecovery(keys);
  };
  const selectionToRecover = map ? capabilitiesToRecover(map, students.size ? [...students] : undefined) : [];

  return (
    <div className="flex min-h-full flex-col">
      <TopBar logoTo="/teacher">
        <span className="text-sm font-semibold text-white/60">Área do professor</span>
      </TopBar>
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-5 py-8 pb-28">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Capacidades da turma</h1>
            <p className="mt-1 max-w-2xl text-white/50">
              Junta as atividades avaliadas e mostra o que cada aluno já desenvolveu e o que precisa recuperar. Vale a
              atividade mais recente de cada capacidade.
            </p>
          </div>
          <Link to="/teacher/historico">
            <Button variant="secondary">
              <Icon name="back" /> Histórico
            </Button>
          </Link>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">
            {error}
          </p>
        )}

        {!activities ? (
          !error && <Loading />
        ) : activities.length === 0 ? (
          <EmptyState title="Nenhuma atividade avaliada ainda">
            Abra uma sala no modo Atividade e avalie os critérios no histórico. As capacidades aparecem aqui.
          </EmptyState>
        ) : (
          <>
            <section aria-labelledby="activities-title">
              <h2 id="activities-title" className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">
                Atividades no mapa
              </h2>
              <div className="flex flex-wrap gap-2" data-testid="activity-filter">
                {activities.map((activity) => {
                  const on = included.has(activity.id);
                  return (
                    <button
                      key={activity.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleActivity(activity.id)}
                      title={dateTime.format(activity.startedAt)}
                      className={cx(
                        'flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm ring-1 transition',
                        on ? 'bg-white/[0.08] text-white ring-white/20' : 'text-white/45 ring-white/[0.07] hover:text-white/80',
                      )}
                    >
                      <span className={cx('flex h-4 w-4 items-center justify-center rounded', on ? 'bg-lime text-ink-950' : 'ring-1 ring-white/25')}>
                        {on && <Icon name="check" className="h-3 w-3" />}
                      </span>
                      <span className="font-mono text-xs text-white/40">{shortDate.format(activity.startedAt)}</span>
                      {activity.packTitle}
                    </button>
                  );
                })}
              </div>
            </section>

            {included.size === 0 ? (
              <EmptyState title="Nenhuma atividade escolhida">Marque pelo menos uma atividade acima.</EmptyState>
            ) : !map ? (
              <Loading />
            ) : map.capabilities.length === 0 ? (
              <EmptyState title="Ainda não há capacidades avaliadas">
                O mapa usa a capacidade de cada critério (campo <span className="font-mono">capability</span> do pack) e as
                marcas de atendido ou não atendido do histórico.
              </EmptyState>
            ) : (
              <div className={cx('space-y-6 transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
                <StatTiles students={map.students.length} capabilities={map.capabilities.length} totals={totals!} />

                <Panel className="p-5">
                  <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                      <h2 className="font-display text-lg font-bold">Por capacidade</h2>
                      <p className="text-sm text-white/45">As que pedem mais atenção primeiro. Clique para destacar na matriz.</p>
                    </div>
                    <StatusLegend />
                  </div>
                  <CapabilityBars capabilities={ordered} counts={counts} selected={focus} onToggle={toggleFocus} />
                </Panel>

                <Panel className="p-5">
                  <div className="mb-4">
                    <h2 className="font-display text-lg font-bold">Por aluno</h2>
                    <p className="text-sm text-white/45">
                      Passe o mouse (ou use Tab) numa célula para ver os critérios. Marque alunos para montar a recuperação.
                    </p>
                  </div>
                  <CapabilityMatrix
                    map={map}
                    capabilities={ordered}
                    highlighted={focus}
                    selectedStudents={students}
                    onToggleStudent={toggleStudent}
                    onToggleAll={toggleAllStudents}
                  />
                  <p className="mt-4 text-xs text-white/35">
                    Os alunos são reconhecidos entre atividades pelo nome digitado, sem diferenciar acentos e maiúsculas.
                  </p>
                </Panel>
              </div>
            )}
          </>
        )}
      </main>

      {map && map.capabilities.length > 0 && (
        <RecoveryBar
          students={students.size}
          focused={focus.size}
          toRecover={selectionToRecover.length}
          onClear={() => {
            setStudents(new Set());
            setFocus(new Set());
          }}
          onCreate={openRecovery}
        />
      )}

      {map && recovery && (
        <RecoveryDialog
          map={map}
          sessionIds={[...included]}
          initial={recovery}
          studentNames={map.students.filter((s) => students.has(s.key)).map((s) => s.name)}
          onClose={() => setRecovery(null)}
        />
      )}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 text-white/50">
      <Spinner className="h-4 w-4" /> Carregando
    </div>
  );
}

function StatTiles({ students, capabilities, totals }: { students: number; capabilities: number; totals: Record<string, number> }) {
  const tiles = [
    { label: 'Alunos', value: students, testId: 'stat-students' },
    { label: 'Capacidades avaliadas', value: capabilities, testId: 'stat-capabilities' },
    { label: 'A recuperar', value: totals['to-recover'] ?? 0, status: 'to-recover' as const, testId: 'stat-to-recover' },
    { label: 'Recuperadas', value: totals.recovered ?? 0, status: 'recovered' as const, testId: 'stat-recovered' },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {tiles.map((tile) => (
        <Panel key={tile.label} className="p-4" data-testid={tile.testId}>
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-white/40">
            {tile.status && (
              <span className={STATUS_META[tile.status].text}>
                <Icon name={STATUS_META[tile.status].icon} className="h-3.5 w-3.5" />
              </span>
            )}
            {tile.label}
          </p>
          <p className="mt-1 font-mono text-3xl font-bold tabular-nums">{tile.value}</p>
          {tile.status && <p className="text-[11px] text-white/35">pares aluno e capacidade</p>}
        </Panel>
      ))}
    </div>
  );
}

/** Barra fixa no rodapé: o que está selecionado e o botão da recuperação. */
function RecoveryBar({
  students,
  focused,
  toRecover,
  onClear,
  onCreate,
}: {
  students: number;
  focused: number;
  toRecover: number;
  onClear: () => void;
  onCreate: () => void;
}) {
  const summary = focused
    ? `${plural(focused, 'capacidade destacada', 'capacidades destacadas')}`
    : students
      ? `${plural(students, 'aluno selecionado', 'alunos selecionados')}, ${plural(toRecover, 'capacidade', 'capacidades')} a recuperar`
      : `Turma toda: ${plural(toRecover, 'capacidade', 'capacidades')} a recuperar`;
  const disabled = !focused && toRecover === 0;
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.07] bg-ink-900/90 backdrop-blur" data-testid="recovery-bar">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3">
        <p className="text-sm text-white/70">{summary}</p>
        <div className="flex gap-2">
          {(students > 0 || focused > 0) && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Limpar seleção
            </Button>
          )}
          <Button variant="primary" size="sm" disabled={disabled} onClick={onCreate} data-testid="open-recovery">
            Criar recuperação
          </Button>
        </div>
      </div>
    </div>
  );
}

function RecoveryDialog({
  map,
  sessionIds,
  initial,
  studentNames,
  onClose,
}: {
  map: CapabilityMap;
  sessionIds: string[];
  initial: string[];
  studentNames: string[];
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(initial));
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const counts = useMemo(() => countsByCapability(map), [map]);
  const ordered = useMemo(() => byAttention(map, counts), [map, counts]);
  const questions = questionsFor(map, chosen);
  const names = ordered.filter((c) => chosen.has(c.key)).map((c) => c.name);
  const defaultTitle = `Recuperação: ${names.join(', ')}`.slice(0, 120);

  const create = async () => {
    setCreating(true);
    setError(null);
    try {
      const stored = await api.createRecovery({
        sessions: sessionIds,
        capabilities: ordered.filter((c) => chosen.has(c.key)).map((c) => c.key),
        capabilityNames: names,
        title: title.trim() || undefined,
      });
      navigate(`/teacher?abrir=${encodeURIComponent(stored.id)}`);
    } catch (err) {
      setError((err as Error).message);
      setCreating(false);
    }
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Criar recuperação"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" loading={creating} disabled={questions.length === 0} onClick={() => void create()} data-testid="create-recovery">
            Criar pack com {plural(questions.length, 'questão', 'questões')}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <p className="text-sm text-white/60">
          O CodeArena cria um pack com as questões que avaliam essas capacidades por um critério crítico e abre a sala no
          modo Atividade. Quando a recuperação for avaliada, o mapa passa a mostrar a capacidade como recuperada.
        </p>
        {studentNames.length > 0 && (
          <p className="rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-white/70" data-testid="recovery-students">
            Para: {studentNames.join(', ')}. Passe o código da sala só para esses alunos.
          </p>
        )}

        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Capacidades</legend>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {ordered.map((capability) => {
              const toRecover = counts.get(capability.key)!['to-recover'];
              return (
                <li key={capability.key}>
                  <label className="flex cursor-pointer items-start gap-2 rounded-xl px-3 py-2 ring-1 ring-white/[0.07] hover:bg-white/[0.04]">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-lime"
                      checked={chosen.has(capability.key)}
                      onChange={() =>
                        setChosen((s) => {
                          const next = new Set(s);
                          if (next.has(capability.key)) next.delete(capability.key);
                          else next.add(capability.key);
                          return next;
                        })
                      }
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{capability.name}</span>
                      <span className="block text-[11px] text-white/40">
                        {toRecover ? `${toRecover} a recuperar` : 'Ninguém a recuperar'} ·{' '}
                        {plural(capability.questions.length, 'questão', 'questões')}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/40">Questões do pack</p>
          {questions.length === 0 ? (
            <p className="text-sm text-white/45">Escolha pelo menos uma capacidade.</p>
          ) : (
            <ol className="list-inside list-decimal space-y-0.5 text-sm text-white/75" data-testid="recovery-questions">
              {questions.map((q) => (
                <li key={q.id}>{q.title}</li>
              ))}
            </ol>
          )}
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-white/40">Nome do pack</span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle} maxLength={120} />
        </label>

        {error && (
          <p role="alert" className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}
