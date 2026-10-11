import { LayoutGroup, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { LeaderboardEntry } from '@codearena/schemas';
import { formatXP } from '../lib/format';
import { Avatar } from './Avatar';
import { CountUp } from './CountUp';
import { DropIn, IsoBox, project } from './iso';
import { cx, Icon } from './ui';

export interface LeaderboardProps {
  entries: LeaderboardEntry[];
  highlightId?: string | null;
  /** Anima a transição da ordem anterior para a nova (revelação após a questão). */
  reveal?: boolean;
  limit?: number;
  size?: 'md' | 'lg';
}

export function Leaderboard({ entries, highlightId, reveal = false, limit, size = 'md' }: LeaderboardProps) {
  const [revealed, setRevealed] = useState(!reveal);
  // Snapshots chegam a todo momento; a revelação só reinicia quando o placar realmente muda.
  const signature = entries.map((e) => `${e.playerId}:${e.totalXP}:${e.rank}`).join('|');

  useEffect(() => {
    if (!reveal) return;
    setRevealed(false);
    const timer = setTimeout(() => setRevealed(true), 900);
    return () => clearTimeout(timer);
  }, [reveal, signature]);

  const ordered = useMemo(() => {
    if (revealed) return entries;
    return [...entries].sort((a, b) => (a.previousRank ?? a.rank) - (b.previousRank ?? b.rank));
  }, [entries, revealed]);

  const visible = limit ? ordered.filter((e, i) => i < limit || e.playerId === highlightId) : ordered;
  const big = size === 'lg';

  return (
    <LayoutGroup>
      <ol className="space-y-2" data-testid="leaderboard">
        {visible.map((entry, index) => {
          const position = revealed ? entry.rank : (entry.previousRank ?? entry.rank);
          const delta = entry.previousRank !== null ? entry.previousRank - entry.rank : 0;
          const me = entry.playerId === highlightId;
          const startXP = entry.totalXP - entry.questionXP;
          return (
            <motion.li
              layout
              key={entry.playerId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ layout: { type: 'spring', stiffness: 260, damping: 28 }, delay: revealed ? 0 : index * 0.04 }}
              data-testid="leaderboard-row"
              data-player={entry.name}
              className={cx(
                'flex items-center gap-3 rounded-xl border bg-surface px-3 py-2.5',
                me ? 'border-cobalt bg-cobalt/[0.06] ring-1 ring-inset ring-cobalt' : 'border-fg/[0.09]',
                !entry.connected && 'opacity-60',
                big && 'px-4 py-3',
              )}
            >
              <span className={cx('w-7 text-center font-display text-lg font-extrabold tabular text-fg/45', big && 'w-9 text-2xl', position <= 3 && 'text-fg')}>
                {position}
              </span>
              <Avatar id={entry.avatar} size={big ? 44 : 34} />
              <div className="min-w-0 flex-1">
                <p className={cx('truncate font-semibold', big && 'text-lg')}>
                  {entry.name}
                  {me && <span className="ml-2 rounded bg-cobalt px-1.5 py-0.5 text-[11px] font-bold text-white">você</span>}
                </p>
                {revealed && delta !== 0 && (
                  <motion.p
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cx('flex items-center gap-1 text-xs font-semibold', delta > 0 ? 'text-mint' : 'text-tomato')}
                  >
                    <Icon name={delta > 0 ? 'arrow-up' : 'arrow-down'} className="h-3 w-3" />
                    {Math.abs(delta)} {Math.abs(delta) === 1 ? 'posição' : 'posições'}
                  </motion.p>
                )}
              </div>
              {entry.questionXP > 0 && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 + index * 0.05 }}
                  className="rounded-md bg-sun px-2 py-0.5 font-mono text-xs font-bold text-ink"
                >
                  +{formatXP(entry.questionXP)}
                </motion.span>
              )}
              <span className={cx('w-24 text-right font-display text-lg font-extrabold tabular', big && 'w-32 text-2xl')}>
                {revealed ? <CountUp from={startXP} value={entry.totalXP} /> : formatXP(reveal ? startXP : entry.totalXP)}
                <span className="ml-1 font-sans text-[11px] font-bold text-fg/55">XP</span>
              </span>
            </motion.li>
          );
        })}
      </ol>
    </LayoutGroup>
  );
}

const PODIUM = {
  1: { slot: 1, height: 2.2, color: '#FFB21E', avatar: 64 },
  2: { slot: 0, height: 1.5, color: '#2C47F0', avatar: 52 },
  3: { slot: 2, height: 1.0, color: '#E8492C', avatar: 52 },
} as const;

/** Pódio isométrico: três blocos lado a lado, com o avatar de cada aluno em cima. */
export function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const top = entries.slice(0, 3);
  const unit = 54;
  const size = 1.2;
  const step = 1.35;
  const blocks = top.map((entry, i) => {
    const spec = PODIUM[(i + 1) as 1 | 2 | 3];
    const x = spec.slot * step;
    const y = (2 - spec.slot) * step;
    return { entry, spec, x, y, place: entry.rank };
  });
  const corners = blocks.flatMap(({ x, y, spec }) => [project(x, y + size, 0, unit), project(x + size, y, 0, unit), project(x + size, y + size, 0, unit), project(x, y, spec.height, unit)]);
  const minX = Math.min(...corners.map((c) => c.x)) - 24;
  const maxX = Math.max(...corners.map((c) => c.x)) + 24;
  const minY = Math.min(...corners.map((c) => c.y)) - 64 - 52;
  const maxY = Math.max(...corners.map((c) => c.y)) + 8;
  // Entrada do 3º para o 1º lugar.
  const delayFor = (place: number) => (place === 1 ? 0.4 : place === 2 ? 0.2 : 0);
  return (
    <div className="flex justify-center" data-testid="podium">
      <svg viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} className="w-full max-w-[560px] overflow-visible" role="img" aria-label={`Pódio: ${top.map((e) => `${e.rank}º ${e.name}`).join(', ')}`}>
        {blocks.map(({ entry, spec, x, y, place }, index) => {
          const label = project(x + size / 2, y + size, spec.height / 2, unit);
          const head = project(x + size / 2, y + size / 2, spec.height, unit);
          const name = entry.name.length > 14 ? `${entry.name.slice(0, 13)}…` : entry.name;
          return (
            <DropIn key={entry.playerId} delay={delayFor(index + 1)} distance={90}>
              <motion.g whileHover={{ y: -6 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
                <IsoBox unit={unit} x={x} y={y} w={size} d={size} h={spec.height} color={spec.color} />
                <text
                  transform={`matrix(${Math.sqrt(3) / 2} 0.5 0 1 ${label.x} ${label.y})`}
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="font-display"
                  fontSize={unit * 0.62}
                  fontWeight={800}
                  fill={index === 0 ? '#171B33' : '#FFFFFF'}
                >
                  {place}
                </text>
                <g transform={`translate(${head.x - spec.avatar / 2} ${head.y - spec.avatar + 4})`}>
                  <Avatar id={entry.avatar} size={spec.avatar} />
                </g>
                <text x={head.x} y={head.y - spec.avatar - 30} textAnchor="middle" className="fill-fg font-display" fontSize={16} fontWeight={800}>
                  {name}
                </text>
                <text x={head.x} y={head.y - spec.avatar - 12} textAnchor="middle" className="fill-fg/70 font-mono" fontSize={13} fontWeight={700}>
                  {formatXP(entry.totalXP)} XP
                </text>
              </motion.g>
            </DropIn>
          );
        })}
      </svg>
    </div>
  );
}
