import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { QuestionResults, RoomSnapshot, SessionReport } from '@codearena/schemas';
import { Avatar } from '../components/Avatar';
import { Countdown } from '../components/Countdown';
import { hardestAcrossSession, hardestRow, ItemInsights, rowsFromResults, type InsightRow } from '../components/ItemInsights';
import { Leaderboard, Podium } from '../components/Leaderboard';
import { Prompt } from '../components/Prompt';
import { Timer } from '../components/Timer';
import { ConnectionBanner, TopBar } from '../components/TopBar';
import { Badge, Button, cx, Dialog, EmptyState, Icon, Panel, Spinner, Toggle } from '../components/ui';
import { downloadFile, formatDuration, formatXP } from '../lib/format';
import { useHost } from '../stores/host';

export function HostPage() {
  const { code = '' } = useParams();
  const { snapshot, resume, connected } = useHost();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void resume(code).then((res) => !res.ok && setError(res.error));
  }, [code, resume]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-display text-2xl font-bold">Não foi possível abrir a sala {code}</p>
        <p className="text-white/60">{error}</p>
        <Link to="/teacher">
          <Button variant="primary">Voltar à biblioteca</Button>
        </Link>
      </div>
    );
  }
  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-white/50">
        <Spinner className="h-5 w-5" /> Carregando sala
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <ConnectionBanner connected={connected} />
      <TopBar logoTo="/teacher" right={<SettingsButton snapshot={snapshot} />}>
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-xs uppercase tracking-wider text-white/40">Sala</span>
          <span className="font-mono text-xl font-bold tracking-[0.2em] text-lime" data-testid="host-room-code">
            {snapshot.code}
          </span>
          <span className="hidden truncate text-sm text-white/50 md:inline">{snapshot.packTitle}</span>
        </div>
      </TopBar>
      <div className="min-h-0 flex-1 overflow-auto">
        <HostPhase snapshot={snapshot} />
      </div>
    </div>
  );
}

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (result) setError(result);
  };
  return { busy, error, run };
}

function HostPhase({ snapshot }: { snapshot: RoomSnapshot }) {
  switch (snapshot.phase) {
    case 'lobby':
      return <HostLobby snapshot={snapshot} />;
    case 'countdown':
      return snapshot.question ? (
        <div className="h-full">
          <Countdown
            startsAt={snapshot.question.startsAt}
            index={snapshot.question.index}
            total={snapshot.question.total}
            title={snapshot.question.question.title ?? snapshot.question.question.prompt}
          />
        </div>
      ) : null;
    case 'question':
      return <HostQuestion snapshot={snapshot} />;
    case 'review':
      return <HostReview snapshot={snapshot} />;
    case 'ended':
      return <HostEnded snapshot={snapshot} />;
  }
}

function HostLobby({ snapshot }: { snapshot: RoomSnapshot }) {
  const { startQuestion, kick } = useHost();
  const { busy, error, run } = useAction();
  const joinUrl = `${window.location.origin}/join?code=${snapshot.code}`;
  const [copied, setCopied] = useState(false);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 lg:grid-cols-[1fr_1.2fr]" data-testid="host-lobby">
      <Panel className="flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/50">Entre em</p>
        <p className="break-all font-mono text-lg text-white/80">{window.location.host}/join</p>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/50">com o código</p>
        <p className="font-mono text-7xl font-bold tracking-[0.15em] text-lime sm:text-8xl">{snapshot.code}</p>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(joinUrl).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          <Icon name="link" /> {copied ? 'Link copiado' : 'Copiar link de entrada'}
        </Button>
      </Panel>

      <Panel className="flex min-h-[360px] flex-col p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-xl font-bold">Alunos</h2>
          <Badge tone={snapshot.players.length ? 'lime' : 'neutral'}>
            <span data-testid="host-player-count">{snapshot.players.length}</span> na sala
          </Badge>
        </div>
        {snapshot.players.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-white/40">Aguardando alunos entrarem</div>
        ) : (
          <ul className="grid flex-1 content-start gap-2 sm:grid-cols-2">
            <AnimatePresence>
              {snapshot.players.map((p) => (
                <motion.li
                  key={p.id}
                  layout
                  initial={{ opacity: 0, scale: 0.8, y: 8 }}
                  animate={{ opacity: p.connected ? 1 : 0.45, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 26 }}
                  className="group flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2"
                >
                  <Avatar id={p.avatar} size={36} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{p.name}</span>
                  <button
                    type="button"
                    onClick={() => void kick(p.id)}
                    className="rounded-md px-2 py-1 text-xs text-white/40 opacity-0 transition hover:bg-coral/15 hover:text-coral group-hover:opacity-100 focus:opacity-100"
                    aria-label={`Remover ${p.name}`}
                  >
                    Remover
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
        {error && <p className="mt-3 text-sm text-coral">{error}</p>}
        <Button
          variant="primary"
          size="lg"
          className="mt-5"
          loading={busy}
          disabled={snapshot.players.length === 0}
          onClick={() => void run(startQuestion)}
          data-testid="start-question"
        >
          <Icon name="play" /> Iniciar questão 1 de {snapshot.questionCount}
        </Button>
        {snapshot.players.length === 0 && <p className="mt-2 text-center text-xs text-white/40">Disponível quando o primeiro aluno entrar.</p>}
      </Panel>
    </div>
  );
}

function HostQuestion({ snapshot }: { snapshot: RoomSnapshot }) {
  const { progress, feed, finishQuestion } = useHost();
  const { busy, error, run } = useAction();
  const active = snapshot.question!;
  const total = active.question.checklist.filter((i) => !i.optional).length;
  const liveRows: InsightRow[] = active.question.checklist.map((item) => ({
    id: item.id,
    label: item.label,
    optional: item.optional,
    total: snapshot.players.length,
    done: snapshot.players.filter((p) => progress[p.id]?.doneIds?.includes(item.id)).length,
  }));

  return (
    <div className="mx-auto grid max-w-7xl gap-6 px-5 py-6 lg:grid-cols-[1.3fr_1fr]" data-testid="host-question">
      <div className="space-y-5">
        <Panel className="space-y-4 p-6">
          <div className="flex items-center justify-between gap-3">
            <Badge tone="violet">
              Questão {active.index + 1} de {active.total}
            </Badge>
            <span className="text-sm text-white/60">
              <strong className="font-mono text-lg text-lime" data-testid="host-answered">
                {snapshot.answeredCount}
              </strong>{' '}
              de {snapshot.connectedCount} concluíram
            </span>
          </div>
          {active.question.title && <h2 className="font-display text-2xl font-bold">{active.question.title}</h2>}
          <Prompt text={active.question.prompt} className="whitespace-pre-wrap text-lg leading-relaxed text-white/90" />
          <Timer startsAt={active.startsAt} endsAt={active.endsAt} finishedAt={active.finishedAt} size="lg" />
        </Panel>
        <Panel className="p-5">
          <h3 className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-white/50">Itens da checklist, ao vivo</h3>
          <p className="mb-4 text-xs text-white/40">Quantos alunos concluíram cada item agora. Barras curtas mostram onde a turma está travada.</p>
          <ItemInsights rows={liveRows} />
        </Panel>
        {error && <p className="text-sm text-coral">{error}</p>}
        <Button variant="danger" loading={busy} onClick={() => void run(finishQuestion)} data-testid="finish-question">
          <Icon name="stop" /> Encerrar questão agora
        </Button>
      </div>

      <div className="space-y-5">
        <Panel className="p-5">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-white/50">Progresso da turma</h3>
          <p className="mb-3 text-xs text-white/40">Mostra apenas quantos itens cada aluno concluiu; o código não é exibido.</p>
          <ul className="space-y-2" data-testid="host-progress">
            {snapshot.players.map((player) => {
              const entry = progress[player.id];
              const done = entry?.answered ? total : (entry?.done ?? 0);
              const answered = entry?.answered ?? false;
              return (
                <li key={player.id} className={cx('flex items-center gap-3', !player.connected && 'opacity-40')}>
                  <Avatar id={player.avatar} size={28} />
                  <span className="w-28 truncate text-sm">{player.name}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                    <motion.div
                      className={cx('h-full rounded-full', answered ? 'bg-lime' : 'bg-violet')}
                      animate={{ width: `${total ? (done / total) * 100 : 0}%` }}
                      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
                    />
                  </div>
                  <span className={cx('w-12 text-right font-mono text-xs', answered ? 'font-bold text-lime' : 'text-white/50')}>
                    {answered ? <Icon name="check" className="ml-auto h-4 w-4" /> : `${done}/${total}`}
                  </span>
                </li>
              );
            })}
          </ul>
        </Panel>
        <Panel className="p-5">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-white/50">Respostas</h3>
          {feed.length === 0 ? (
            <p className="text-sm text-white/40">Nenhuma resposta ainda.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              <AnimatePresence initial={false}>
                {feed.map((item) => (
                  <motion.li key={`${item.playerId}-${item.at}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2">
                    <span className={item.accepted ? 'text-lime' : 'text-amber'}>{item.accepted ? 'Concluiu' : 'Recusada'}</span>
                    <span className="text-white/80">{item.name}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function HostReview({ snapshot }: { snapshot: RoomSnapshot }) {
  const { startQuestion, endSession, lastFinished } = useHost();
  const { busy, error, run } = useAction();
  const results = snapshot.lastResults;
  const isLast = snapshot.questionIndex + 1 >= snapshot.questionCount;
  const [showSolution, setShowSolution] = useState(false);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 lg:grid-cols-[1.4fr_1fr]" data-testid="host-review">
      <Panel className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-2xl font-bold">Placar</h2>
          <Badge tone="violet">
            Após a questão {snapshot.questionIndex + 1} de {snapshot.questionCount}
          </Badge>
        </div>
        {snapshot.leaderboard.length ? <Leaderboard entries={snapshot.leaderboard} reveal size="lg" /> : <EmptyState title="Nenhum aluno na sala" />}
      </Panel>
      <div className="space-y-5">
        {results && (
          <Panel className="grid grid-cols-2 gap-4 p-5">
            <Stat label="Concluíram" value={`${results.correctCount}/${results.playerCount}`} />
            <Stat label="Tempo médio" value={formatDuration(results.averageTimeMs)} />
            <div className="col-span-2">
              <Stat label="Mais rápido" value={results.fastest ? `${results.fastest.name} · ${formatDuration(results.fastest.timeMs)}` : '-'} />
            </div>
          </Panel>
        )}
        {results && results.items.length > 0 && <StuckPanel results={results} />}
        {lastFinished?.solution && (
          <Panel className="p-5">
            <Button variant="ghost" size="sm" onClick={() => setShowSolution((v) => !v)}>
              <Icon name="eye" /> {showSolution ? 'Ocultar solução' : 'Mostrar solução esperada'}
            </Button>
            {showSolution && <pre className="mt-3 overflow-auto rounded-xl bg-ink-950/70 p-3 font-mono text-xs text-white/85">{lastFinished.solution}</pre>}
          </Panel>
        )}
        {error && <p className="text-sm text-coral">{error}</p>}
        {!isLast && (
          <Button variant="primary" size="lg" className="w-full" loading={busy} onClick={() => void run(startQuestion)} data-testid="next-question">
            <Icon name="play" /> Próxima questão ({snapshot.questionIndex + 2} de {snapshot.questionCount})
          </Button>
        )}
        <Button variant={isLast ? 'primary' : 'secondary'} size={isLast ? 'lg' : 'md'} className="w-full" loading={busy} onClick={() => void run(endSession)} data-testid="end-session">
          Encerrar sessão e ver relatório
        </Button>
      </div>
    </div>
  );
}

function StuckPanel({ results }: { results: QuestionResults }) {
  const rows = rowsFromResults(results.items);
  const hardest = hardestRow(rows);
  return (
    <Panel className="p-5" data-testid="stuck-panel">
      <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-white/50">Onde a turma travou</h3>
      <p className="mb-4 mt-1 text-sm text-white/65" data-testid="stuck-summary">
        {hardest
          ? `Item mais difícil: "${hardest.label}". ${hardest.done} de ${hardest.total} concluíram.`
          : results.playerCount > 0
            ? 'Todos os alunos concluíram todos os itens.'
            : 'Nenhum aluno participou desta questão.'}
      </p>
      <ItemInsights rows={rows} highlightHardest showTime />
      <p className="mt-4 text-[11px] text-white/35">O tempo é a mediana até o primeiro momento em que cada aluno concluiu o item.</p>
    </Panel>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-0.5 font-mono text-xl font-bold">{value}</p>
    </div>
  );
}

function reportToCsv(report: SessionReport): string {
  const header = ['posicao', 'nome', 'xp_total', 'acertos', 'questoes', 'tempo_medio_s', ...report.questions.map((q) => `xp_${q.questionId}`)];
  const rows = report.players.map((p) => [
    p.rank,
    `"${p.name.replace(/"/g, '""')}"`,
    p.totalXP,
    p.correctCount,
    p.questionCount,
    p.averageTimeMs === null ? '' : (p.averageTimeMs / 1000).toFixed(1),
    ...p.perQuestion.map((q) => q.xp),
  ]);
  return [header, ...rows].map((row) => row.join(',')).join('\n');
}

function HostEnded({ snapshot }: { snapshot: RoomSnapshot }) {
  const report = snapshot.report;
  const [podiumOpen, setPodiumOpen] = useState(!snapshot.settings.discreetMode);
  if (!report) return null;
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-8" data-testid="host-ended">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/50">Sessão encerrada</p>
          <h2 className="font-display text-3xl font-bold">{report.packTitle}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => downloadFile(`relatorio-${report.roomCode}.csv`, reportToCsv(report), 'text/csv')}>
            <Icon name="download" /> CSV
          </Button>
          <Button variant="secondary" size="sm" onClick={() => downloadFile(`relatorio-${report.roomCode}.json`, JSON.stringify(report, null, 2))}>
            <Icon name="download" /> JSON
          </Button>
          <Link to="/teacher">
            <Button variant="primary" size="sm">
              Voltar à biblioteca
            </Button>
          </Link>
        </div>
      </div>

      {snapshot.leaderboard.length > 0 && (
        <Panel className="p-6">
          {podiumOpen ? (
            <Podium entries={snapshot.leaderboard} />
          ) : (
            <Button variant="ghost" onClick={() => setPodiumOpen(true)}>
              Mostrar pódio
            </Button>
          )}
        </Panel>
      )}

      <SessionInsights report={report} />

      <Panel className="overflow-x-auto p-2">
        <table className="w-full min-w-[640px] text-left text-sm" data-testid="report-table">
          <thead className="text-xs uppercase tracking-wider text-white/40">
            <tr>
              <th className="px-3 py-2">#</th>
              <th className="px-3 py-2">Aluno</th>
              <th className="px-3 py-2 text-right">XP</th>
              <th className="px-3 py-2 text-right">Acertos</th>
              <th className="px-3 py-2 text-right">Tempo médio</th>
              {report.questions.map((q, i) => (
                <th key={q.questionId} className="px-3 py-2 text-center" title={q.questionId}>
                  Q{i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {report.players.map((p) => (
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
                <td className="px-3 py-2 text-right font-mono">{formatDuration(p.averageTimeMs)}</td>
                {p.perQuestion.map((q) => (
                  <td key={q.questionId} className={cx('px-3 py-2 text-center font-mono text-xs', q.correct ? 'text-lime' : 'text-white/30')}>
                    {q.correct ? formatXP(q.xp) : '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot className="text-xs text-white/50">
            <tr className="border-t border-white/[0.08]">
              <td className="px-3 py-2" colSpan={5}>
                Acertos por questão
              </td>
              {report.questions.map((q) => (
                <td key={q.questionId} className="px-3 py-2 text-center font-mono">
                  {q.correctCount}/{q.playerCount}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </Panel>
    </div>
  );
}

function itemsToCsv(report: SessionReport): string {
  const header = ['questao', 'titulo', 'item', 'concluiram', 'alunos', 'tempo_mediano_s'];
  const rows = report.questions.flatMap((q) =>
    q.items.map((i) => [
      q.index + 1,
      `"${q.title.replace(/"/g, '""')}"`,
      `"${i.label.replace(/"/g, '""')}"`,
      i.completedCount,
      i.playerCount,
      i.medianTimeMs === null ? '' : (i.medianTimeMs / 1000).toFixed(1),
    ]),
  );
  return [header, ...rows].map((row) => row.join(',')).join('\n');
}

function SessionInsights({ report }: { report: SessionReport }) {
  const hardest = hardestAcrossSession(report);
  return (
    <section className="space-y-4" data-testid="session-insights" aria-label="Revisão da turma">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-2xl font-bold">Onde a turma travou</h3>
          <p className="text-sm text-white/50">Itens da checklist com menos conclusões. Bons candidatos para reexplicar na próxima aula.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => downloadFile(`itens-${report.roomCode}.csv`, itemsToCsv(report), 'text/csv')}>
          <Icon name="download" /> Itens (CSV)
        </Button>
      </div>

      {hardest.length === 0 ? (
        <Panel className="p-5 text-sm text-white/65">Todos os alunos concluíram todos os itens de todas as questões.</Panel>
      ) : (
        <ol className="grid gap-3 md:grid-cols-3" data-testid="session-hardest">
          {hardest.map((item, i) => (
            <li key={`${item.questionIndex}-${item.id}`} className="rounded-2xl border border-coral/25 bg-coral/[0.06] p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-coral">
                <span className="font-mono">{i + 1}</span> Questão {item.questionIndex + 1} · {item.questionTitle}
              </p>
              <p className="mt-2 text-sm leading-snug text-white/90">{item.label}</p>
              <p className="mt-3 font-mono text-2xl font-bold text-coral">
                {item.done}/{item.total} <span className="text-xs font-medium text-white/40">concluíram</span>
              </p>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {report.questions.map((q) => (
          <Panel key={q.questionId} className="p-5">
            <h4 className="mb-4 text-sm font-semibold">
              <span className="mr-2 font-mono text-white/40">Q{q.index + 1}</span>
              {q.title}
            </h4>
            <ItemInsights rows={rowsFromResults(q.items)} highlightHardest showTime />
          </Panel>
        ))}
      </div>
    </section>
  );
}

function SettingsButton({ snapshot }: { snapshot: RoomSnapshot }) {
  const { updateSettings } = useHost();
  const [open, setOpen] = useState(false);
  const s = snapshot.settings;
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Configurações
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Configurações da sala">
        <div className="space-y-5">
          <Toggle
            label="Modo discreto"
            description="Alunos veem só o top 3 e a própria posição; sem pódio ao final."
            checked={s.discreetMode}
            onChange={(v) => void updateSettings({ discreetMode: v })}
          />
          <Toggle
            label="Bônus de sequência"
            description={`+${s.streakBonus} XP por acerto consecutivo a partir do segundo (até ${s.streakMaxSteps}x).`}
            checked={s.streakEnabled}
            onChange={(v) => void updateSettings({ streakEnabled: v })}
          />
          <div className="text-xs text-white/40">As mudanças valem a partir da próxima resposta.</div>
        </div>
      </Dialog>
    </>
  );
}
