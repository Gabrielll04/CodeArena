import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { useServerNow } from '../lib/clock';
import { formatSeconds } from '../lib/format';
import { playCue } from '../lib/sound';
import { cx } from './ui';

export interface TimerProps {
  startsAt: number;
  endsAt: number;
  finishedAt: number | null;
  size?: 'md' | 'lg';
}

export function Timer({ startsAt, endsAt, finishedAt, size = 'md' }: TimerProps) {
  const running = finishedAt === null;
  const now = useServerNow(running, 200);
  const total = endsAt - startsAt;
  const reference = finishedAt ?? now;
  const remaining = Math.max(0, Math.min(total, endsAt - Math.max(reference, startsAt)));
  const ratio = total > 0 ? remaining / total : 0;
  const urgent = running && remaining <= 10_000;
  const lastSecond = useRef<number | null>(null);

  useEffect(() => {
    const second = Math.ceil(remaining / 1000);
    if (running && second <= 5 && second > 0 && second !== lastSecond.current) playCue('tick');
    lastSecond.current = second;
  }, [remaining, running]);

  return (
    <div className="flex min-w-0 items-center gap-3" role="timer" aria-label={`Tempo restante ${formatSeconds(remaining)}`}>
      <div className={cx('relative h-2 flex-1 overflow-hidden rounded-full bg-white/[0.08]', size === 'lg' && 'h-3')}>
        <motion.div
          className={cx('absolute inset-y-0 left-0 rounded-full', urgent ? 'bg-coral' : ratio < 0.4 ? 'bg-amber' : 'bg-lime')}
          style={{ width: `${ratio * 100}%` }}
          transition={{ ease: 'linear' }}
        />
      </div>
      <motion.span
        key={urgent ? Math.ceil(remaining / 1000) : 'calm'}
        initial={urgent ? { scale: 1.25 } : false}
        animate={{ scale: 1 }}
        className={cx(
          'font-mono font-bold tabular-nums',
          size === 'lg' ? 'text-4xl' : 'text-lg',
          urgent ? 'text-coral' : 'text-white',
        )}
        data-testid="timer"
      >
        {formatSeconds(remaining)}
      </motion.span>
    </div>
  );
}
