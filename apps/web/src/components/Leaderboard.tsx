import { LayoutGroup, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { LeaderboardEntry } from '@codearena/schemas';
import { formatXP } from '../lib/format';
import { Avatar } from './Avatar';
import { CountUp } from './CountUp';
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

  useEffect(() => {
    if (!reveal) return;
    setRevealed(false);
    const timer = setTimeout(() => setRevealed(true), 900);
    return () => clearTimeout(timer);
  }, [reveal, entries]);

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
                'flex items-center gap-3 rounded-2xl border px-3 py-2.5',
                me ? 'border-lime/50 bg-lime/[0.08]' : 'border-white/[0.06] bg-white/[0.03]',
                !entry.connected && 'opacity-60',
                big && 'px-4 py-3',
              )}
            >
              <span className={cx('w-7 text-center font-mono font-bold text-white/60', big && 'w-9 text-xl', position <= 3 && 'text-white')}>
                {position}
              </span>
              <Avatar id={entry.avatar} size={big ? 44 : 34} />
              <div className="min-w-0 flex-1">
                <p className={cx('truncate font-semibold', big && 'text-lg')}>
                  {entry.name}
                  {me && <span className="ml-2 text-xs font-medium text-lime">você</span>}
                </p>
                {revealed && delta !== 0 && (
                  <motion.p
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={cx('flex items-center gap-1 text-xs font-semibold', delta > 0 ? 'text-lime' : 'text-coral')}
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
                  className="rounded-lg bg-lime/15 px-2 py-0.5 font-mono text-xs font-bold text-lime"
                >
                  +{formatXP(entry.questionXP)}
                </motion.span>
              )}
              <span className={cx('w-20 text-right font-mono font-bold tabular-nums', big && 'w-28 text-xl')}>
                {revealed ? <CountUp from={startXP} value={entry.totalXP} /> : formatXP(reveal ? startXP : entry.totalXP)}
                <span className="ml-1 text-[10px] font-semibold text-white/40">XP</span>
              </span>
            </motion.li>
          );
        })}
      </ol>
    </LayoutGroup>
  );
}

export function Podium({ entries }: { entries: LeaderboardEntry[] }) {
  const top = entries.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean) as LeaderboardEntry[];
  const heights: Record<number, string> = { 1: 'h-40', 2: 'h-28', 3: 'h-20' };
  const colors: Record<number, string> = { 1: 'from-lime/40', 2: 'from-violet/40', 3: 'from-cyan/30' };
  return (
    <div className="flex items-end justify-center gap-3 sm:gap-5" data-testid="podium">
      {order.map((entry, index) => (
        <motion.div
          key={entry.playerId}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 + (entry.rank === 1 ? 0.5 : index * 0.2), type: 'spring', stiffness: 200, damping: 20 }}
          className="flex w-24 flex-col items-center gap-2 sm:w-32"
        >
          <Avatar id={entry.avatar} size={entry.rank === 1 ? 72 : 56} />
          <p className="max-w-full truncate text-center font-semibold">{entry.name}</p>
          <p className="font-mono text-sm text-white/70">{formatXP(entry.totalXP)} XP</p>
          <div className={cx('flex w-full items-start justify-center rounded-t-2xl bg-gradient-to-b to-transparent pt-2', heights[entry.rank] ?? 'h-16', colors[entry.rank] ?? 'from-white/10')}>
            <span className="font-display text-3xl font-bold">{entry.rank}</span>
          </div>
        </motion.div>
      ))}
    </div>
  );
}
