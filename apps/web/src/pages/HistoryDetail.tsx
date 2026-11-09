import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { QuestionGradeResult } from '@codearena/core';
import type {
  AnswerEvaluation,
  CriterionMark,
  EvaluationEntry,
  HistoryAnswer,
  HistoryAnswerStatus,
  ResolvedQuestion,
  SessionHistory,
} from '@codearena/schemas';
import { Avatar } from '../components/Avatar';
import { CapabilityText, CriterionBadge } from '../components/Criteria';
import { Prompt } from '../components/Prompt';
import { TopBar } from '../components/TopBar';
import { Badge, Button, cx, Dialog, EmptyState, Icon, Panel, Select, Spinner, Textarea } from '../components/ui';
import { buildAiFile, parseAiReply, type AiImport } from '../lib/aiExport';
import { api } from '../lib/api';
import { answerIndex, answerKey, evaluationIndex, gradesCsv, pseudonym, studentGrades } from '../lib/evaluation';
import { downloadFile, formatXP, plural, slugify } from '../lib/format';
import { dateTime } from './History';

const questionTitle = (question: ResolvedQuestion) => question.title ?? question.prompt.slice(0, 60);

/** Aplica as alterações localmente (antes da resposta do servidor), com a mesma regra do servidor. */
function applyEntries(record: SessionHistory, entries: EvaluationEntry[]): SessionHistory {
  const evaluations = record.evaluations.map((e) => ({ ...e, marks: { ...e.marks } }));
  for (const entry of entries) {
    let evaluation = evaluations.find((e) => e.playerId === entry.playerId && e.questionId === entry.questionId);
    if (!evaluation) {
      evaluation = { playerId: entry.playerId, questionId: entry.questionId, marks: {}, updatedAt: Date.now() };
      evaluations.push(evaluation);
    }
    for (const [itemId, mark] of Object.entries(entry.marks)) {
      if (mark) evaluation.marks[itemId] = mark;
      else delete evaluation.marks[itemId];
    }
    if (entry.comment !== undefined) evaluation.comment = entry.comment.trim() || undefined;
  }
  return { ...record, evaluations };
}

export function HistoryDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [record, setRecord] = useState<SessionHistory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const latestRequest = useRef(0);

  useEffect(() => {
    api
      .getHistory(id)
      .then(setRecord)
      .catch((err: Error) => setError(err.message));
  }, [id]);

  // Testes automáticos ainda rodando no servidor: atualiza só as respostas até terminar.
  const autoPending = record?.autoCheck === 'pending';
  useEffect(() => {
    if (!autoPending) return;
    const timer = setInterval(() => {
      api
        .getHistory(id)
        .then((fresh) => setRecord((current) => current && { ...current, answers: fresh.answers, autoCheck: fresh.autoCheck }))
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [autoPending, id]);

  const save = async (entries: EvaluationEntry[]) => {
    if (!entries.length) return;
    const request = ++latestRequest.current;
    setRecord((current) => current && applyEntries(current, entries));
    setSaveState('saving');
    try {
      const updated = await api.saveEvaluations(id, entries);
      // Respostas fora de ordem: só a do último pedido vale.
      if (request !== latestRequest.current) return;
      setRecord((current) => current && { ...current, evaluations: updated.evaluations });
      setSaveState('saved');
    } catch (err) {
      setError((err as Error).message);
      setSaveState('error');
    }
  };

  const remove = async () => {
    if (!record || !window.confirm(`Excluir "${record.packTitle}" do histórico? As respostas e avaliações serão apagadas.`)) return;
    await api.deleteHistory(record.id).catch((err: Error) => setError(err.message));
    navigate('/teacher/historico');
  };

  return (
    <div className="flex min-h-full flex-col">
      <TopBar logoTo="/teacher">
        <span className="text-sm font-semibold text-white/60">Área do professor</span>
      </TopBar>
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-5 py-8">
        <Link to="/teacher/historico" className="inline-flex items-center gap-1 text-sm text-white/50 hover:text-white">
          <Icon name="back" /> Histórico
        </Link>
        {error && (
          <p role="alert" className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">
            {error}
          </p>
        )}
        {!record ? (
          !error && (
            <div className="flex items-center gap-2 text-white/50">
              <Spinner className="h-4 w-4" /> Carregando
            </div>
          )
        ) : (
          <>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-sm text-white/50">
                  {record.mode === 'assessment' ? <Badge tone="violet">Atividade</Badge> : <Badge>Competição</Badge>}
                  {dateTime.format(record.startedAt)} · {plural(record.players.length, 'aluno')} ·{' '}
                  {plural(record.questions.length, 'questão', 'questões')}
                </p>
                <h1 className="mt-1 font-display text-3xl font-bold">{record.packTitle}</h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-white/45" aria-live="polite" data-testid="save-state">
                  {saveState === 'saving' ? 'Salvando' : saveState === 'saved' ? 'Salvo' : ''}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => downloadFile(`sessao-${slugify(record.packTitle)}-${record.roomCode}.json`, JSON.stringify(record, null, 2))}
                >
                  <Icon name="download" /> Dados (JSON)
                </Button>
                <Button variant="danger" size="sm" onClick={() => void remove()}>
                  <Icon name="trash" /> Excluir
                </Button>
              </div>
            </div>
            {record.players.length === 0 ? (
              <EmptyState title="Nenhum aluno participou desta sessão" />
            ) : record.mode === 'assessment' ? (
              <ActivityEvaluation record={record} onSave={save} />
            ) : (
              <CompetitionHistory record={record} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Atividade: avaliação pelos critérios                                 */
/* ------------------------------------------------------------------ */

function ActivityEvaluation({ record, onSave }: { record: SessionHistory; onSave: (entries: EvaluationEntry[]) => Promise<void> }) {
  const students = useMemo(() => [...record.players].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), [record.players]);
  const [selected, setSelected] = useState(students[0]!.id);
  const [importOpen, setImportOpen] = useState(false);
  const evaluations = useMemo(() => evaluationIndex(record), [record]);
  const answers = useMemo(() => answerIndex(record), [record]);
  const player = record.players.find((p) => p.id === selected) ?? students[0]!;
  const slug = slugify(record.packTitle);

  return (
    <div className="space-y-5">
      <Panel className="flex flex-wrap items-center justify-between gap-3 p-4">
        <p className="max-w-2xl text-sm text-white/60">
          Nota de 0 a 100. Com todos os critérios críticos: de 50 a 100, conforme os desejáveis. Faltou algum crítico: no
          máximo 50.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => downloadFile(`avaliacao-${slug}-turma.md`, buildAiFile(record), 'text/markdown')} data-testid="ai-export-class">
            <Icon name="download" /> Arquivo para IA (turma)
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)} data-testid="ai-import-open">
            <Icon name="upload" /> Importar avaliação da IA
          </Button>
          <Button variant="primary" size="sm" onClick={() => downloadFile(`notas-${slug}-${record.roomCode}.csv`, gradesCsv(record), 'text/csv')} data-testid="download-grades">
            <Icon name="download" /> Notas (CSV)
          </Button>
        </div>
      </Panel>

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="Alunos" className="space-y-1" data-testid="student-list">
          {students.map((student) => {
            const grades = studentGrades(record, student.id, evaluations);
            const grade = grades.activity.grade;
            return (
              <button
                key={student.id}
                type="button"
                onClick={() => setSelected(student.id)}
                aria-current={student.id === player.id ? 'true' : undefined}
                className={cx(
                  'flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition',
                  student.id === player.id ? 'bg-white/10' : 'hover:bg-white/[0.05]',
                )}
                data-testid={`student-${student.name}`}
              >
                <Avatar id={student.avatar} size={28} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{student.name}</span>
                  <span className="font-mono text-[11px] text-white/40">{pseudonym(record, student.id)}</span>
                </span>
                <span className={cx('font-mono text-sm font-bold', grade === null ? 'text-white/35' : grades.activity.capped ? 'text-coral' : 'text-lime')}>
                  {grade ?? '-'}
                </span>
              </button>
            );
          })}
        </nav>

        <StudentEvaluation
          key={player.id}
          record={record}
          playerId={player.id}
          evaluations={evaluations}
          answers={answers}
          onSave={onSave}
        />
      </div>

      <AiImportDialog record={record} open={importOpen} onClose={() => setImportOpen(false)} onApply={onSave} />
    </div>
  );
}

function StudentEvaluation({
  record,
  playerId,
  evaluations,
  answers,
  onSave,
}: {
  record: SessionHistory;
  playerId: string;
  evaluations: Map<string, AnswerEvaluation>;
  answers: Map<string, HistoryAnswer>;
  onSave: (entries: EvaluationEntry[]) => Promise<void>;
}) {
  const player = record.players.find((p) => p.id === playerId)!;
  const grades = studentGrades(record, playerId, evaluations);
  const pending = grades.questions.reduce((sum, q) => sum + q.result.pending, 0);
  const slug = slugify(record.packTitle);

  /** Preenche só os critérios ainda sem marca. */
  const fillUnmarked = (decide: (question: ResolvedQuestion, answer: HistoryAnswer | undefined, itemId: string) => boolean | null) => {
    const entries: EvaluationEntry[] = [];
    for (const question of record.questions) {
      const answer = answers.get(answerKey(playerId, question.id));
      const marks = evaluations.get(answerKey(playerId, question.id))?.marks ?? {};
      const fill: Record<string, CriterionMark> = {};
      for (const item of question.checklist) {
        if (marks[item.id]) continue;
        const met = decide(question, answer, item.id);
        if (met !== null) fill[item.id] = { met, source: 'professor' };
      }
      if (Object.keys(fill).length) entries.push({ playerId, questionId: question.id, marks: fill });
    }
    void onSave(entries);
  };
  const hasAuto = record.answers.some((a) => a.playerId === playerId && a.auto);
  const hasEmpty = record.answers.some((a) => a.playerId === playerId && a.status === 'empty');

  return (
    <section className="min-w-0 space-y-4" aria-label={`Avaliação de ${player.name}`} data-testid="student-evaluation">
      <Panel className="flex flex-wrap items-center gap-4 p-5">
        <Avatar id={player.avatar} size={44} />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-bold">{player.name}</h2>
          <p className="text-xs text-white/45">
            No arquivo para IA: <span className="font-mono">{pseudonym(record, playerId)}</span>
            {player.delivered ? ' · Entregou' : ' · Não entregou'}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wider text-white/40">Nota</p>
          <p className={cx('font-mono text-4xl font-bold', grades.activity.capped ? 'text-coral' : 'text-lime')} data-testid="final-grade">
            {grades.activity.grade ?? '-'}
          </p>
          <p className="text-xs text-white/45">
            {pending > 0 ? `${plural(pending, 'critério')} sem avaliação` : grades.activity.capped ? 'Faltou critério crítico' : 'Avaliado'}
          </p>
        </div>
      </Panel>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => downloadFile(`avaliacao-${slug}-${pseudonym(record, playerId)}.md`, buildAiFile(record, [playerId]), 'text/markdown')}
          data-testid="ai-export-student"
        >
          <Icon name="download" /> Arquivo para IA (aluno)
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasAuto}
          title={record.autoCheck === 'pending' ? 'Os testes automáticos ainda estão rodando' : undefined}
          onClick={() => fillUnmarked((_q, answer, itemId) => answer?.auto?.[itemId] ?? null)}
          data-testid="apply-auto"
        >
          Usar testes automáticos nos critérios sem marca
        </Button>
        {hasEmpty && (
          <Button variant="ghost" size="sm" onClick={() => fillUnmarked((_q, answer) => (answer?.status === 'empty' ? false : null))} data-testid="mark-empty">
            Sem resposta: não atendido
          </Button>
        )}
      </div>

      {grades.questions.map(({ question, result }, index) => (
        <QuestionEvaluation
          key={question.id}
          index={index}
          question={question}
          result={result}
          answer={answers.get(answerKey(playerId, question.id))}
          evaluation={evaluations.get(answerKey(playerId, question.id))}
          autoPending={record.autoCheck === 'pending'}
          onMark={(itemId, mark) => void onSave([{ playerId, questionId: question.id, marks: { [itemId]: mark } }])}
          onComment={(comment) => void onSave([{ playerId, questionId: question.id, marks: {}, comment }])}
        />
      ))}
    </section>
  );
}

function QuestionEvaluation({
  index,
  question,
  result,
  answer,
  evaluation,
  autoPending,
  onMark,
  onComment,
}: {
  index: number;
  question: ResolvedQuestion;
  result: QuestionGradeResult;
  answer: HistoryAnswer | undefined;
  evaluation: AnswerEvaluation | undefined;
  autoPending: boolean;
  onMark: (itemId: string, mark: CriterionMark | null) => void;
  onComment: (comment: string) => void;
}) {
  const empty = !answer || answer.status === 'empty';
  return (
    <Panel className="space-y-4 p-5" data-testid={`question-${question.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h3 className="font-display text-lg font-bold">
          <span className="mr-2 font-mono text-white/40">Q{index + 1}</span>
          {questionTitle(question)}
        </h3>
        <span className={cx('rounded-lg px-2.5 py-1 font-mono text-sm font-bold', result.grade === null ? 'bg-white/[0.06] text-white/50' : result.allCriticalMet ? 'bg-lime/15 text-lime' : 'bg-coral/15 text-coral')} data-testid="question-grade">
          {result.grade ?? '-'}
        </span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-white/50 hover:text-white">Enunciado</summary>
        <Prompt text={question.prompt} className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/80" />
      </details>

      {empty ? (
        <p className="rounded-xl bg-white/[0.03] p-4 text-sm text-white/45">Sem resposta.</p>
      ) : (
        <div className="space-y-1">
          <pre className="max-h-80 overflow-auto rounded-xl bg-ink-950/80 p-4 font-mono text-xs leading-relaxed text-white/85 ring-1 ring-white/10" data-testid="answer-code">
            {answer.code}
          </pre>
          {answer.paste && (answer.paste.count > 0 || answer.paste.blocked > 0) && (
            <p className="text-xs text-amber">
              {answer.paste.count > 0 && `Colou ${plural(answer.paste.count, 'vez', 'vezes')} (${answer.paste.chars} caracteres). `}
              {answer.paste.blocked > 0 && `${plural(answer.paste.blocked, 'tentativa bloqueada', 'tentativas bloqueadas')}.`}
            </p>
          )}
        </div>
      )}

      <ul className="divide-y divide-white/[0.05]">
        {question.checklist.map((item) => {
          const mark = evaluation?.marks[item.id];
          const auto = answer?.auto?.[item.id];
          return (
            <li key={item.id} className="flex flex-wrap items-start gap-3 py-3" data-testid={`criterion-${question.id}-${item.id}`}>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <CriterionBadge item={item} />
                  {item.label}
                </p>
                <CapabilityText item={item} />
                {item.rule.type !== 'manual' && !empty && (
                  <p className="text-xs text-white/40">
                    Teste automático: {auto === undefined ? (autoPending ? 'rodando' : '-') : auto ? 'passou' : 'não passou'}
                  </p>
                )}
                {mark?.note && (
                  <p className="text-xs text-white/60">
                    <span className="font-semibold text-white/45">{mark.source === 'ia' ? 'IA' : 'Professor'}:</span> {mark.note}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1" role="group" aria-label={`Avaliação: ${item.label}`}>
                {([true, false] as const).map((met) => {
                  const active = mark?.met === met;
                  return (
                    <button
                      key={String(met)}
                      type="button"
                      aria-pressed={active}
                      onClick={() => onMark(item.id, active ? null : { met, source: 'professor' })}
                      className={cx(
                        'rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition',
                        active
                          ? met
                            ? 'bg-lime text-ink-950 ring-lime'
                            : 'bg-coral text-ink-950 ring-coral'
                          : 'text-white/60 ring-white/15 hover:bg-white/[0.06] hover:text-white',
                      )}
                      data-testid={met ? 'mark-met' : 'mark-unmet'}
                    >
                      {met ? 'Atendido' : 'Não atendido'}
                    </button>
                  );
                })}
                {mark?.source === 'ia' && <Badge tone="cyan">IA</Badge>}
              </div>
            </li>
          );
        })}
      </ul>

      <Textarea
        aria-label="Comentário para o aluno"
        placeholder="Comentário para o aluno (opcional)"
        defaultValue={evaluation?.comment ?? ''}
        onBlur={(e) => {
          if (e.target.value.trim() !== (evaluation?.comment ?? '')) onComment(e.target.value);
        }}
        className="min-h-[60px] text-sm"
      />
    </Panel>
  );
}

function AiImportDialog({
  record,
  open,
  onClose,
  onApply,
}: {
  record: SessionHistory;
  open: boolean;
  onClose: () => void;
  onApply: (entries: EvaluationEntry[]) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<AiImport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const read = (value: string) => {
    setText(value);
    setResult(null);
    setError(null);
    if (!value.trim()) return;
    try {
      setResult(parseAiReply(record, value));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Importar avaliação da IA"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            disabled={!result?.entries.length}
            onClick={() => {
              void onApply(result!.entries);
              read('');
              onClose();
            }}
            data-testid="ai-import-apply"
          >
            Aplicar {result ? plural(result.applied, 'critério', 'critérios') : ''}
          </Button>
        </>
      }
    >
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-white/65">
        <li>Baixe o arquivo para IA (da turma ou de um aluno).</li>
        <li>Envie o arquivo para a IA que preferir e peça a avaliação.</li>
        <li>Cole a resposta aqui. Você revisa e pode mudar qualquer critério depois.</li>
      </ol>
      <Textarea
        aria-label="Resposta da IA"
        value={text}
        onChange={(e) => read(e.target.value)}
        placeholder='{"avaliacoes": [...]}'
        className="min-h-[200px] font-mono text-xs"
        data-testid="ai-import-text"
      />
      {error && <p className="mt-2 text-sm text-coral">{error}</p>}
      {result && (
        <div className="mt-3 space-y-1 text-sm" data-testid="ai-import-summary">
          <p className="text-lime">
            {plural(result.applied, 'critério avaliado', 'critérios avaliados')} em {plural(result.entries.length, 'resposta')}.
          </p>
          {result.warnings.map((warning) => (
            <p key={warning} className="text-xs text-amber">
              {warning}
            </p>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Competição: placar e respostas                                       */
/* ------------------------------------------------------------------ */

const STATUS_LABEL: Record<HistoryAnswerStatus, string> = {
  empty: 'Sem resposta',
  started: 'Respondida',
  accepted: 'Aceita',
  rejected: 'Não aceita',
  late: 'Fora do tempo',
};

function CompetitionHistory({ record }: { record: SessionHistory }) {
  const [selected, setSelected] = useState(record.players[0]!.id);
  const answers = useMemo(() => answerIndex(record), [record]);
  return (
    <div className="space-y-5">
      <Panel className="overflow-x-auto p-2">
        <table className="w-full min-w-[520px] text-left text-sm" data-testid="history-scoreboard">
          <thead className="text-xs uppercase tracking-wider text-white/40">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Aluno</th>
              <th className="px-3 py-2 text-right">XP</th>
              <th className="px-3 py-2 text-right">Acertos</th>
            </tr>
          </thead>
          <tbody>
            {record.report.players.map((p) => (
              <tr key={p.playerId} className="border-t border-white/[0.05]">
                <td className="px-3 py-2 font-mono text-white/60">{p.rank}</td>
                <td className="px-3 py-2">
                  <span className="flex items-center gap-2">
                    <Avatar id={p.avatar} size={24} /> {p.name}
                  </span>
                </td>
                <td className="px-3 py-2 text-right font-mono font-bold">{formatXP(p.totalXP)}</td>
                <td className="px-3 py-2 text-right font-mono">
                  {p.correctCount}/{p.questionCount}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-xl font-bold">Respostas</h2>
          <Select aria-label="Aluno" value={selected} onChange={(e) => setSelected(e.target.value)} className="w-60">
            {record.players.map((p) => (
              <option key={p.id} value={p.id} className="bg-ink-850">
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        {record.questions.map((question, index) => {
          const answer = answers.get(answerKey(selected, question.id));
          return (
            <div key={question.id} className="space-y-2" data-testid={`answer-${question.id}`}>
              <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <span className="font-mono text-white/40">Q{index + 1}</span>
                {questionTitle(question)}
                <Badge tone={answer?.status === 'accepted' ? 'lime' : 'neutral'}>{STATUS_LABEL[answer?.status ?? 'empty']}</Badge>
                {answer?.xp ? <span className="font-mono text-xs text-lime">+{formatXP(answer.xp)} XP</span> : null}
              </p>
              {answer?.code ? (
                <pre className="max-h-64 overflow-auto rounded-xl bg-ink-950/80 p-4 font-mono text-xs leading-relaxed text-white/85 ring-1 ring-white/10">
                  {answer.code}
                </pre>
              ) : null}
            </div>
          );
        })}
      </Panel>
    </div>
  );
}
