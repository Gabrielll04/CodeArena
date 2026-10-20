import { memo, useMemo } from 'react';
import type { ChecklistItem, PlayerPublic, PlayerTimeline, QuestionTimeline } from '@codearena/schemas';

/** O que a linha do tempo precisa saber de cada item da checklist. */
export type TimelineItem = Pick<ChecklistItem, 'id' | 'label' | 'optional'>;
import { formatSeconds, plural } from '../lib/format';
import { Avatar } from './Avatar';
import { cx } from './ui';

/** Frase curta para o professor: o que a colagem explica na resposta. */
export function describePasteImpact(timeline: PlayerTimeline): string | null {
  const impact = timeline.pasteImpact;
  if (!impact) return null;
  return `Colou ${impact.chars} caracteres aos ${formatSeconds(impact.atMs)} e concluiu ${plural(impact.items, 'item', 'itens')} logo depois.`;
}

/** Contagens de colagem do aluno na questão (indícios, nunca punição automática). */
export function PasteChips({ timeline, compact = false }: { timeline: PlayerTimeline | undefined; compact?: boolean }) {
  if (!timeline) return null;
  const { count, chars, blocked } = timeline.paste;
  if (!count && !blocked) return null;
  return (
    <span className="flex shrink-0 flex-wrap items-center gap-1" data-testid="paste-chips">
      {timeline.pasteImpact && (
        <span className="rounded-md bg-coral/15 px-1.5 py-0.5 text-[11px] font-semibold text-coral ring-1 ring-coral/30" title={describePasteImpact(timeline) ?? undefined}>
          Revisar
        </span>
      )}
      {count > 0 && (
        <span className="rounded-md bg-amber/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber ring-1 ring-amber/30" title={`${chars} caracteres colados no total`}>
          {compact ? `Colou ${count}x` : `Colou ${count}x · ${chars} car.`}
        </span>
      )}
      {blocked > 0 && (
        <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[11px] font-semibold text-white/70 ring-1 ring-white/10">
          Tentou colar {blocked}x
        </span>
      )}
    </span>
  );
}

/** Escala mínima da trilha: eventos dos primeiros segundos não ficam todos no mesmo ponto. */
const MIN_SCALE_MS = 30_000;

/**
 * Fim da escala, igual para a turma inteira (as linhas ficam comparáveis): um pouco depois do último evento,
 * arredondado para 10 s, sem passar do tempo limite.
 */
export function timelineScaleMs(timeline: QuestionTimeline): number {
  let last = 0;
  for (const player of timeline.players) for (const event of player.events) last = Math.max(last, event.atMs);
  const rounded = Math.ceil((last * 1.15) / 10_000) * 10_000;
  return Math.min(timeline.timeLimitMs, Math.max(MIN_SCALE_MS, rounded));
}

const position = (atMs: number, limitMs: number) => `${Math.min(100, Math.max(0, (atMs / Math.max(1, limitMs)) * 100))}%`;

/** Trilha de 0 ao tempo limite: itens concluídos, colagens e o momento em que a resposta foi aceita. */
const TimelineTrack = memo(function TimelineTrack({
  timeline,
  limitMs,
  items,
}: {
  timeline: PlayerTimeline;
  limitMs: number;
  items: ReadonlyMap<string, TimelineItem>;
}) {
  return (
    <div className="relative h-7 rounded-md bg-white/[0.04] ring-1 ring-inset ring-white/[0.06]" aria-hidden>
      {timeline.events.map((event, i) => {
        const left = position(event.atMs, limitMs);
        const time = formatSeconds(event.atMs);
        if (event.kind === 'item') {
          const item = items.get(event.itemId);
          return (
            <span
              key={i}
              title={`${time} · ${item?.label ?? event.itemId}`}
              className={cx('absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-ink-850', item?.optional ? 'bg-white/40' : 'bg-lime')}
              style={{ left }}
            />
          );
        }
        if (event.kind === 'paste') {
          // Altura cresce com o tamanho da colagem, até a altura da trilha.
          const height = Math.min(100, 30 + Math.log10(Math.max(1, event.chars)) * 22);
          return <span key={i} title={`${time} · colou ${event.chars} caracteres`} className="absolute bottom-0 w-1 -translate-x-1/2 rounded-t-sm bg-amber" style={{ left, height: `${height}%` }} />;
        }
        if (event.kind === 'paste-blocked') {
          return <span key={i} title={`${time} · tentou colar`} className="absolute bottom-0 h-1/3 w-1 -translate-x-1/2 rounded-t-sm bg-white/45" style={{ left }} />;
        }
        return (
          <span key={i} title={`${time} · resposta aceita`} className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-lime/80" style={{ left }} />
        );
      })}
    </div>
  );
});

const TimelineRow = memo(function TimelineRow({
  timeline,
  player,
  limitMs,
  items,
}: {
  timeline: PlayerTimeline;
  player: PlayerPublic | undefined;
  limitMs: number;
  items: ReadonlyMap<string, TimelineItem>;
}) {
  const impact = describePasteImpact(timeline);
  return (
    <li className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] items-center gap-x-4 gap-y-1" data-testid="timeline-row" data-player={player?.name} data-flagged={Boolean(timeline.pasteImpact)}>
      <span className="flex min-w-0 items-center gap-2">
        {player && <Avatar id={player.avatar} size={24} />}
        <span className="truncate text-sm font-semibold">{player?.name ?? 'Aluno'}</span>
      </span>
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <TimelineTrack timeline={timeline} limitMs={limitMs} items={items} />
          </div>
          <PasteChips timeline={timeline} compact />
        </div>
        {impact && <p className="text-xs text-coral">{impact}</p>}
      </div>
    </li>
  );
});

export interface TimelinePanelProps {
  timeline: QuestionTimeline;
  players: PlayerPublic[];
  checklist: TimelineItem[];
}

/**
 * Linha do tempo da turma numa questão. Mostra só horários e contagens: o código dos alunos nunca aparece.
 * Ordem: quem tem indício para revisar primeiro, depois quem respondeu antes.
 */
export function TimelinePanel({ timeline, players, checklist }: TimelinePanelProps) {
  const items = useMemo(() => new Map(checklist.map((item) => [item.id, item])), [checklist]);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const rows = useMemo(() => {
    const accepted = (t: PlayerTimeline) => t.events.find((e) => e.kind === 'accepted')?.atMs ?? Number.POSITIVE_INFINITY;
    return [...timeline.players].sort((a, b) => Number(Boolean(b.pasteImpact)) - Number(Boolean(a.pasteImpact)) || accepted(a) - accepted(b));
  }, [timeline.players]);
  const flagged = rows.filter((t) => t.pasteImpact).length;
  const scaleMs = timelineScaleMs(timeline);

  return (
    <section className="space-y-3" aria-label="Linha do tempo da checklist" data-testid="timeline-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-white/45">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Legend className="h-2.5 w-2.5 rounded-full bg-lime">item concluído</Legend>
          <Legend className="h-3 w-1 rounded-t-sm bg-amber">colagem</Legend>
          {!timeline.allowPaste && <Legend className="h-1.5 w-1 rounded-t-sm bg-white/45">colagem recusada</Legend>}
          <Legend className="h-3 w-0.5 bg-lime/80">resposta aceita</Legend>
        </span>
        <span className="font-mono" data-testid="timeline-scale">
          0:00 a {formatSeconds(scaleMs)}
          {scaleMs < timeline.timeLimitMs && <span className="font-sans"> (tempo total {formatSeconds(timeline.timeLimitMs)})</span>}
        </span>
      </div>
      {flagged > 0 && (
        <p className="text-sm text-coral" data-testid="timeline-flagged">
          {flagged === 1 ? '1 aluno colou um bloco e concluiu vários itens logo depois.' : `${flagged} alunos colaram um bloco e concluíram vários itens logo depois.`} Vale conversar antes de considerar o resultado.
        </p>
      )}
      <ol className="space-y-2.5">
        {rows.map((t) => (
          <TimelineRow key={t.playerId} timeline={t} player={byId.get(t.playerId)} limitMs={scaleMs} items={items} />
        ))}
      </ol>
      <p className="text-[11px] text-white/35">
        Horários do servidor desde o início da questão. As colagens são informadas pelo navegador do aluno (só o tamanho, nunca o texto) e não mudam o XP.
      </p>
    </section>
  );
}

function Legend({ className, children }: { className: string; children: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cx('inline-block', className)} aria-hidden />
      {children}
    </span>
  );
}
