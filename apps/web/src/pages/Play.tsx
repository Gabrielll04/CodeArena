import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PlayerAnswer, PublicQuestion, RoomSnapshot } from '@codearena/schemas';
import { Avatar } from '../components/Avatar';
import { Countdown } from '../components/Countdown';
import { CountUp } from '../components/CountUp';
import { Leaderboard, Podium } from '../components/Leaderboard';
import { QuestionWorkspace } from '../components/QuestionWorkspace';
import { Timer } from '../components/Timer';
import { ConnectionBanner, TopBar } from '../components/TopBar';
import { Button, cx, Icon, Panel, Spinner } from '../components/ui';
import { useChecklist } from '../hooks/useChecklist';
import { formatDuration, formatXP } from '../lib/format';
import { playCue } from '../lib/sound';
import { session as sessionStore } from '../lib/storage';
import { clientPlugins } from '../plugins/registry';
import { usePlayer } from '../stores/player';

export function PlayPage() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { status, snapshot, resume, connected, removedReason } = usePlayer();
  const [resumeFailed, setResumeFailed] = useState(false);

  useEffect(() => {
    if (status === 'joined' || status === 'removed') return;
    void resume(code).then((ok) => {
      if (!ok) setResumeFailed(true);
    });
  }, [code, status, resume]);

  useEffect(() => {
    if (resumeFailed) navigate(`/join?code=${code}`, { replace: true });
  }, [resumeFailed, code, navigate]);

  if (status === 'removed') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-display text-2xl font-bold">Você saiu da sala</p>
        <p className="text-white/60">{removedReason}</p>
        <Link to="/join">
          <Button variant="primary">Entrar em outra sala</Button>
        </Link>
      </div>
    );
  }
  if (!snapshot || !snapshot.me) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-white/50">
        <Spinner className="h-5 w-5" /> Entrando na sala
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ConnectionBanner connected={connected} />
      <TopBar
        right={
          <div className="flex items-center gap-2 rounded-xl bg-white/[0.05] py-1 pl-1 pr-3">
            <Avatar id={snapshot.me.avatar} size={30} />
            <span className="hidden max-w-[120px] truncate text-sm font-semibold sm:inline">{snapshot.me.name}</span>
            <span className="font-mono text-sm font-bold text-lime" data-testid="my-xp">
              {formatXP(snapshot.me.totalXP)} XP
            </span>
          </div>
        }
      >
        <span className="hidden truncate text-sm text-white/50 md:inline">{snapshot.packTitle}</span>
      </TopBar>
      <div className="min-h-0 flex-1">
        <PhaseView snapshot={snapshot} />
      </div>
    </div>
  );
}

function PhaseView({ snapshot }: { snapshot: RoomSnapshot }) {
  const { phase, question } = snapshot;
  if (phase === 'lobby') return <Lobby snapshot={snapshot} />;
  if (phase === 'countdown' && question) {
    return <Countdown startsAt={question.startsAt} index={question.index} total={question.total} title={question.question.title} />;
  }
  if (phase === 'question' && question) return <ActiveQuestion key={question.question.id} snapshot={snapshot} />;
  if (phase === 'review') return <Review snapshot={snapshot} />;
  return <Ended snapshot={snapshot} />;
}

function Lobby({ snapshot }: { snapshot: RoomSnapshot }) {
  const me = snapshot.me!;
  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col items-center gap-8 overflow-auto px-5 py-10 text-center" data-testid="lobby">
      <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
        <Avatar id={me.avatar} size={96} />
      </motion.div>
      <div>
        <p className="font-display text-3xl font-bold">Você está na sala, {me.name}</p>
        <p className="mt-2 flex items-center justify-center gap-2 text-white/50">
          <span className="h-2 w-2 animate-pulse rounded-full bg-lime" aria-hidden /> Aguardando o professor iniciar
        </p>
      </div>
      <Panel className="w-full p-5">
        <p className="mb-4 text-left text-xs font-bold uppercase tracking-[0.14em] text-white/50">
          Na sala: {snapshot.players.length}
        </p>
        <ul className="flex flex-wrap justify-center gap-3">
          <AnimatePresence>
            {snapshot.players.map((p) => (
              <motion.li
                key={p.id}
                layout
                initial={{ opacity: 0, scale: 0.5, y: 10 }}
                animate={{ opacity: p.connected ? 1 : 0.4, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="flex w-20 flex-col items-center gap-1"
              >
                <Avatar id={p.avatar} size={44} />
                <span className={cx('max-w-full truncate text-xs', p.id === me.playerId ? 'font-bold text-lime' : 'text-white/70')}>{p.name}</span>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      </Panel>
    </div>
  );
}

const draftKey = (room: string, questionId: string) => `codearena:draft:${room}:${questionId}`;

function ActiveQuestion({ snapshot }: { snapshot: RoomSnapshot }) {
  const active = snapshot.question!;
  // Cada room:update traz um objeto novo; a questão não muda durante a rodada, então fixamos pela id.
  const question: PublicQuestion = useMemo(() => active.question, [active.question.id]);
  const answer = snapshot.me!.answer;
  const plugin = clientPlugins.get(question.pluginId);
  const { submit, reportProgress } = usePlayer();
  const storageKey = draftKey(snapshot.code, question.id);
  const [code, setCode] = useState(
    () => answer?.code ?? sessionStore.get<string>(storageKey) ?? plugin?.getStarterCode(question) ?? question.starterCode,
  );
  const [submitting, setSubmitting] = useState(false);
  const [lastResult, setLastResult] = useState<PlayerAnswer | { error: string } | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const lastSubmitted = useRef<string | null>(null);
  const accepted = answer?.status === 'accepted';
  const locked = accepted && question.lockOnComplete;
  const live = useChecklist(code, question, plugin, { enabled: !accepted });

  useEffect(() => {
    if (!accepted) sessionStore.set(storageKey, code);
  }, [code, storageKey, accepted]);

  useEffect(() => {
    if (accepted && answer?.code && answer.code !== code && question.lockOnComplete) setCode(answer.code);
  }, [accepted, answer?.code, code, question.lockOnComplete]);

  // Progresso (contagem de itens, sem código) para o painel do professor.
  const { requiredDone, requiredTotal } = live.evaluation;
  const doneKey = live.evaluation.items.filter((i) => i.status === 'done').map((i) => i.id).join(',');
  useEffect(() => {
    if (!accepted) reportProgress(requiredDone, requiredTotal, doneKey ? doneKey.split(',') : []);
  }, [requiredDone, requiredTotal, doneKey, accepted, reportProgress]);

  // Envio automático quando a checklist completa (avaliação atualizada para o código atual).
  useEffect(() => {
    if (accepted || submitting || !live.fresh || !live.evaluation.allRequiredDone) return;
    if (live.evaluatedCode !== code || lastSubmitted.current === code) return;
    lastSubmitted.current = code;
    setSubmitting(true);
    void submit(code).then((result) => {
      setSubmitting(false);
      setLastResult(result);
      if ('status' in result && result.status === 'accepted') playCue('success');
      if ('error' in result) {
        // Falha de rede ou limite de envio: tenta de novo com o mesmo código em instantes.
        setTimeout(() => {
          lastSubmitted.current = null;
          setRetryTick((t) => t + 1);
        }, 1500);
      }
    });
  }, [accepted, submitting, live, code, submit, retryTick]);

  const rejected = lastResult && 'status' in lastResult && lastResult.status === 'rejected' ? lastResult : null;
  const failure = lastResult && 'error' in lastResult ? lastResult.error : null;
  const late = answer?.status === 'late' || (lastResult && 'status' in lastResult && lastResult.status === 'late');

  const status = accepted ? (
    <AcceptedCard answer={answer!} snapshot={snapshot} />
  ) : (
    <div className="space-y-2 text-sm" aria-live="polite" data-testid="answer-status">
      {submitting || answer?.status === 'validating' ? (
        <p className="flex items-center gap-2 text-cyan">
          <Spinner className="h-4 w-4" /> Validando no servidor
        </p>
      ) : late ? (
        <p className="text-amber">O tempo acabou antes da resposta chegar. Sem XP nesta questão.</p>
      ) : rejected ? (
        <div className="rounded-xl border border-amber/30 bg-amber/[0.07] p-3 text-amber">
          <p className="font-semibold">O servidor não confirmou a resposta</p>
          <p className="mt-0.5 text-xs text-white/70">{rejected.message}</p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-white/60">
            {rejected.items
              .filter((i) => !i.passed)
              .map((i) => (
                <li key={i.id}>
                  {question.checklist.find((c) => c.id === i.id)?.label ?? i.id}
                  {i.message ? `: ${i.message}` : ''}
                </li>
              ))}
          </ul>
          <p className="mt-1.5 text-xs text-white/50">Ajuste o código; o envio é refeito automaticamente.</p>
        </div>
      ) : failure ? (
        <p className="text-coral">{failure}</p>
      ) : (
        <p className="text-white/55">
          {live.evaluation.requiredTotal - live.evaluation.requiredDone === 1
            ? 'Falta 1 item. A resposta é enviada sozinha quando a checklist completar.'
            : `Faltam ${live.evaluation.requiredTotal - live.evaluation.requiredDone} itens. A resposta é enviada sozinha quando a checklist completar.`}
        </p>
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
        <span className="hidden shrink-0 text-xs text-white/50 sm:inline" data-testid="answered-count">
          {snapshot.answeredCount} de {snapshot.connectedCount} concluíram
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <QuestionWorkspace
          question={question}
          plugin={plugin}
          code={code}
          onCodeChange={setCode}
          readOnly={locked}
          live={
            accepted
              ? {
                  ...live,
                  evaluation: {
                    ...live.evaluation,
                    items: live.evaluation.items.map((i) => ({ ...i, status: 'done' as const })),
                    requiredDone: live.evaluation.requiredTotal,
                    allRequiredDone: true,
                  },
                }
              : live
          }
          mode="play"
          modelPath={`file:///${snapshot.code}/${question.id}/${plugin?.editorFileName ?? 'code.js'}`}
          status={status}
          editorOverlay={accepted ? <AcceptedOverlay xp={answer!.xp} /> : null}
        />
      </div>
    </div>
  );
}

function AcceptedOverlay({ xp }: { xp: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className="pointer-events-none absolute right-4 top-4 flex items-center gap-3 rounded-2xl bg-lime px-4 py-3 text-ink-950 shadow-glow"
      data-testid="accepted-overlay"
    >
      <Icon name="check" className="h-6 w-6" />
      <div>
        <p className="text-xs font-bold uppercase tracking-wider">Resposta registrada</p>
        <p className="font-mono text-2xl font-bold">
          +<CountUp value={xp} /> XP
        </p>
      </div>
    </motion.div>
  );
}

function AcceptedCard({ answer, snapshot }: { answer: PlayerAnswer; snapshot: RoomSnapshot }) {
  const waiting = snapshot.connectedCount - snapshot.answeredCount;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-lime/40 bg-lime/[0.07] p-4"
      data-testid="answer-accepted"
    >
      <p className="font-display text-lg font-bold text-lime">Resposta confirmada pelo servidor</p>
      <p className="mt-1 text-sm text-white/70">
        Restavam {formatDuration(answer.remainingMs)} no relógio. XP provisório: <strong className="font-mono">{formatXP(answer.xp)}</strong>
      </p>
      {answer.message && <p className="mt-1 text-xs text-white/50">{answer.message}</p>}
      <p className="mt-2 text-xs text-white/50">
        {waiting > 0 ? `Aguardando ${waiting} ${waiting === 1 ? 'colega' : 'colegas'} ou o fim do tempo.` : 'Todos concluíram.'}
      </p>
    </motion.div>
  );
}

function Review({ snapshot }: { snapshot: RoomSnapshot }) {
  const { lastFinished } = usePlayer();
  const me = snapshot.me!;
  const myEntry = snapshot.leaderboard.find((e) => e.playerId === me.playerId);
  const results = snapshot.lastResults;
  const [showSolution, setShowSolution] = useState(false);
  const solution = lastFinished?.results.questionId === results?.questionId ? lastFinished?.solution : undefined;
  const gained = myEntry?.questionXP ?? 0;
  const isLast = snapshot.questionIndex + 1 >= snapshot.questionCount;

  return (
    <div className="mx-auto h-full max-w-3xl space-y-6 overflow-auto px-5 py-8" data-testid="review">
      <div className="text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/50">
          Questão {snapshot.questionIndex + 1} encerrada
        </p>
        <motion.p
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className={cx('mt-2 font-display text-4xl font-bold', gained > 0 ? 'text-lime' : 'text-white/80')}
        >
          {gained > 0 ? (
            <>
              +<CountUp value={gained} /> XP
            </>
          ) : (
            'Sem XP nesta questão'
          )}
        </motion.p>
        {myEntry && (
          <p className="mt-1 text-white/60">
            Você está em {myEntry.rank}º lugar com {formatXP(myEntry.totalXP)} XP
          </p>
        )}
        {results && (
          <p className="mt-1 text-sm text-white/40">
            {results.correctCount} de {results.playerCount} concluíram · tempo médio {formatDuration(results.averageTimeMs)}
          </p>
        )}
      </div>

      <Panel className="p-4">
        <Leaderboard entries={snapshot.leaderboard} highlightId={me.playerId} reveal />
        {snapshot.settings.discreetMode && <p className="mt-3 text-center text-xs text-white/40">Modo discreto: apenas o top 3 e a sua posição aparecem.</p>}
      </Panel>

      {solution && (
        <div>
          <Button variant="ghost" size="sm" onClick={() => setShowSolution((v) => !v)}>
            <Icon name="eye" /> {showSolution ? 'Ocultar solução esperada' : 'Ver solução esperada'}
          </Button>
          {showSolution && (
            <pre className="mt-2 overflow-auto rounded-xl bg-ink-950/70 p-4 font-mono text-xs leading-relaxed text-white/85">{solution}</pre>
          )}
        </div>
      )}

      <p className="flex items-center justify-center gap-2 text-sm text-white/50">
        <span className="h-2 w-2 animate-pulse rounded-full bg-violet" aria-hidden />
        {isLast ? 'Aguardando o professor encerrar a sessão' : 'Aguardando a próxima questão'}
      </p>
    </div>
  );
}

function Ended({ snapshot }: { snapshot: RoomSnapshot }) {
  const { leave } = usePlayer();
  const navigate = useNavigate();
  const me = snapshot.me!;
  const report = snapshot.report;
  const mine = report?.players.find((p) => p.playerId === me.playerId);
  const podium = useMemo(() => snapshot.leaderboard.slice(0, 3), [snapshot.leaderboard]);

  return (
    <div className="mx-auto h-full max-w-3xl space-y-8 overflow-auto px-5 py-10 text-center" data-testid="session-ended">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/50">Sessão encerrada</p>
        <p className="mt-2 font-display text-4xl font-bold">
          <CountUp value={me.totalXP} /> XP
        </p>
        {mine && (
          <p className="mt-1 text-white/60">
            {mine.rank}º lugar · {mine.correctCount} de {mine.questionCount} questões · tempo médio {formatDuration(mine.averageTimeMs)}
          </p>
        )}
      </div>
      {!snapshot.settings.discreetMode && podium.length > 0 && <Podium entries={podium} />}
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
