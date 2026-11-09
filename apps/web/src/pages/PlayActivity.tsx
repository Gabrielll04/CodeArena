import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { pendingChecklist } from '@codearena/core';
import type { ClientQuizPlugin } from '@codearena/plugin-sdk/ui';
import type { AssessmentQuestionProgress, PublicQuestion, RoomSnapshot } from '@codearena/schemas';
import { QuestionWorkspace } from '../components/QuestionWorkspace';
import { Timer } from '../components/Timer';
import { Button, cx, Dialog, Icon, Panel, Spinner } from '../components/ui';
import type { LiveChecklist } from '../hooks/useChecklist';
import { session as sessionStore } from '../lib/storage';
import { usePlayer } from '../stores/player';

export const draftKey = (room: string, questionId: string) => `codearena:draft:${room}:${questionId}`;

/** Espera de digitação antes de salvar a resposta no servidor. */
const AUTOSAVE_DELAY_MS = 1000;

type SaveState = { state: 'idle' } | { state: 'saving' } | { state: 'saved'; at: number } | { state: 'error'; message: string };

const NAV_TONE: Record<AssessmentQuestionProgress['status'], string> = {
  empty: 'bg-white/[0.06] text-white/70',
  started: 'bg-violet/30 text-white',
};

const NAV_LABEL: Record<AssessmentQuestionProgress['status'], string> = {
  empty: 'sem resposta',
  started: 'respondida',
};

const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * Questão da atividade: o aluno resolve sem checklist automática nem placar. A resposta é salva no servidor enquanto
 * ele escreve; o professor avalia depois pelos critérios.
 */
export function ActivityQuestion({ snapshot, plugin }: { snapshot: RoomSnapshot; plugin: ClientQuizPlugin<any> | undefined }) {
  const active = snapshot.question!;
  const view = snapshot.me!.assessment!;
  // Cada room:update traz um objeto novo; a questão só muda quando o aluno navega (o componente é recriado).
  const question: PublicQuestion = useMemo(() => active.question, [active.question.id]);
  const { saveAnswer, reportPaste, goTo, deliver } = usePlayer();
  const storageKey = draftKey(snapshot.code, question.id);
  const starter = plugin?.getStarterCode(question) ?? question.starterCode;
  const [code, setCode] = useState(() => sessionStore.get<string>(storageKey) ?? view.code ?? starter);
  const [save, setSave] = useState<SaveState>(view.code !== null ? { state: 'saved', at: 0 } : { state: 'idle' });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastSaved = useRef<string | null>(view.code ?? starter);
  const latest = useRef(code);
  latest.current = code;

  useEffect(() => sessionStore.set(storageKey, code), [code, storageKey]);

  /** Salva o código atual se mudou desde o último salvamento. Devolve false se o servidor recusou. */
  const flush = async (): Promise<boolean> => {
    const current = latest.current;
    if (current === lastSaved.current) return true;
    setSave({ state: 'saving' });
    const res = await saveAnswer(question.id, current);
    if (!res.ok) {
      setSave({ state: 'error', message: res.error });
      return false;
    }
    lastSaved.current = current;
    setSave(latest.current === current ? { state: 'saved', at: res.savedAt } : { state: 'saving' });
    return true;
  };

  // flush lê o código mais recente pela ref; o temporizador recomeça a cada mudança.
  useEffect(() => {
    if (code === lastSaved.current) return;
    const timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [code]);

  const navigate = async (index: number) => {
    setBusy(true);
    await flush();
    const res = await goTo(index);
    setBusy(false);
    if (!res.ok) setSave({ state: 'error', message: res.error });
  };

  const submitDelivery = async () => {
    setBusy(true);
    const saved = await flush();
    const res = saved ? await deliver() : { ok: false as const, error: 'Não foi possível salvar a resposta. Tente de novo.' };
    setBusy(false);
    setConfirming(false);
    if (!res.ok) setSave({ state: 'error', message: res.error });
  };

  // Sem avaliação automática: o painel do plugin (preview, cliente HTTP...) recebe a checklist pendente.
  const live: LiveChecklist = useMemo(
    () => ({ evaluation: pendingChecklist(question.checklist), fresh: true, checking: new Set(), evaluatedCode: null }),
    [question],
  );
  const answered = view.questions.filter((q) => q.status === 'started').length;

  const status = (
    <div className="space-y-3 text-sm" aria-live="polite" data-testid="save-status">
      {save.state === 'saving' ? (
        <p className="flex items-center gap-2 text-white/55">
          <Spinner className="h-4 w-4" /> Salvando
        </p>
      ) : save.state === 'saved' ? (
        <p className="text-white/55">{save.at ? `Resposta salva às ${timeFormat.format(save.at)}.` : 'Resposta salva.'}</p>
      ) : save.state === 'error' ? (
        <p className="text-coral">{save.message}</p>
      ) : (
        <p className="text-white/55">Sua resposta é salva enquanto você escreve.</p>
      )}
    </div>
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-4 border-b border-white/[0.07] px-4 py-2.5">
        <span className="shrink-0 rounded-lg bg-white/[0.06] px-2.5 py-1 font-mono text-xs font-bold">
          {active.index + 1}/{active.total}
        </span>
        <div className="min-w-0 flex-1">
          <Timer startsAt={active.startsAt} endsAt={active.endsAt} finishedAt={active.finishedAt} />
        </div>
        <QuestionNavigator questions={view.questions} current={active.index} disabled={busy} onSelect={(index) => void navigate(index)} />
        <Button variant="primary" size="sm" onClick={() => setConfirming(true)} disabled={busy} data-testid="deliver">
          <Icon name="check" /> Entregar
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        <QuestionWorkspace
          question={question}
          plugin={plugin}
          code={code}
          onCodeChange={setCode}
          readOnly={false}
          live={live}
          mode="play"
          criteria
          modelPath={`file:///${snapshot.code}/${question.id}/${plugin?.editorFileName ?? 'code.js'}`}
          status={status}
          allowPaste={snapshot.settings.allowPaste}
          onPaste={(paste) => reportPaste(paste.chars, paste.blocked, question.id)}
          onRestore={() => setCode(starter)}
        />
      </div>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Entregar a atividade?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Continuar respondendo
            </Button>
            <Button variant="primary" loading={busy} onClick={() => void submitDelivery()} data-testid="confirm-deliver">
              Entregar
            </Button>
          </>
        }
      >
        <p className="text-sm text-white/70">
          Você respondeu {answered} de {view.questions.length} {view.questions.length === 1 ? 'questão' : 'questões'}. Depois de entregar,
          não dá para editar.
        </p>
      </Dialog>
    </div>
  );
}

function QuestionNavigator({
  questions,
  current,
  disabled,
  onSelect,
}: {
  questions: AssessmentQuestionProgress[];
  current: number;
  disabled: boolean;
  onSelect: (index: number) => void;
}) {
  return (
    <nav className="flex max-w-[50%] shrink-0 gap-1 overflow-x-auto p-0.5" aria-label="Questões da atividade" data-testid="question-nav">
      {questions.map((q, index) => (
        <button
          key={q.questionId}
          type="button"
          disabled={disabled}
          onClick={() => index !== current && onSelect(index)}
          aria-current={index === current ? 'step' : undefined}
          aria-label={`Questão ${index + 1}, ${NAV_LABEL[q.status]}`}
          title={q.title}
          data-status={q.status}
          className={cx(
            'h-8 min-w-8 shrink-0 rounded-lg px-2 font-mono text-xs font-bold transition disabled:opacity-60',
            NAV_TONE[q.status],
            index === current ? 'ring-2 ring-white' : 'hover:brightness-125',
          )}
        >
          {index + 1}
        </button>
      ))}
    </nav>
  );
}

function QuestionSummary({ questions }: { questions: AssessmentQuestionProgress[] }) {
  return (
    <Panel className="p-4 text-left">
      <ul className="space-y-2">
        {questions.map((q, index) => (
          <li key={q.questionId} className="flex items-center gap-3 text-sm">
            <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-bold', NAV_TONE[q.status])}>
              {index + 1}
            </span>
            <span className="min-w-0 flex-1 truncate">{q.title}</span>
            <span className="text-xs text-white/50">{NAV_LABEL[q.status]}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** O aluno entregou e espera o professor encerrar. */
export function ActivityDelivered({ snapshot }: { snapshot: RoomSnapshot }) {
  const questions = snapshot.me!.assessment!.questions;
  return (
    <div className="mx-auto h-full max-w-xl space-y-6 overflow-auto px-5 py-10 text-center" data-testid="activity-delivered">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/50">Atividade entregue</p>
        <p className="mt-2 font-display text-3xl font-bold">Suas respostas estão com o professor</p>
        <p className="mt-2 text-white/60">Aguarde o professor encerrar a atividade.</p>
      </div>
      <QuestionSummary questions={questions} />
    </div>
  );
}

export function ActivityEnded({ snapshot }: { snapshot: RoomSnapshot }) {
  const { leave } = usePlayer();
  const navigate = useNavigate();
  const questions = snapshot.me!.assessment?.questions ?? [];
  const answered = questions.filter((q) => q.status === 'started').length;

  return (
    <div className="mx-auto h-full max-w-xl space-y-6 overflow-auto px-5 py-10 text-center" data-testid="session-ended">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/50">Atividade encerrada</p>
        <p className="mt-2 font-display text-3xl font-bold">
          Você respondeu {answered} de {questions.length} {questions.length === 1 ? 'questão' : 'questões'}
        </p>
        <p className="mt-2 text-white/60">O professor vai avaliar as respostas.</p>
      </div>
      <QuestionSummary questions={questions} />
      <Button
        variant="secondary"
        onClick={() => {
          leave();
          navigate('/');
        }}
      >
        Sair
      </Button>
    </div>
  );
}
