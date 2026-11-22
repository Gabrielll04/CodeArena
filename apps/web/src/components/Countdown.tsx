import { AnimatePresence, motion } from 'framer-motion';
import { useServerNow } from '../lib/clock';
import { PausedBadge } from './Timer';
import { cx } from './ui';

/** Contagem regressiva sincronizada pelo relógio do servidor antes de a questão começar. */
export function Countdown({
  startsAt,
  index,
  total,
  title,
  pausedAt = null,
}: {
  startsAt: number;
  index: number;
  total: number;
  title?: string;
  /** Pausada pelo professor: os números param até a retomada. */
  pausedAt?: number | null;
}) {
  const live = useServerNow(pausedAt === null, 100);
  const now = pausedAt ?? live;
  const seconds = Math.max(0, Math.ceil((startsAt - now) / 1000));
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center" data-testid="countdown">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/50">
        Questão {index + 1} de {total}
      </p>
      {title && <p className="max-w-xl font-display text-2xl font-bold">{title}</p>}
      <div className="relative flex h-40 w-40 items-center justify-center">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={seconds}
            initial={{ scale: 1.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 22 }}
            className={cx('font-display text-[7rem] font-bold leading-none', pausedAt === null ? 'text-lime' : 'text-white/40')}
          >
            {seconds > 0 ? seconds : 'Já'}
          </motion.span>
        </AnimatePresence>
      </div>
      {pausedAt === null ? (
        <p className="text-white/50">Prepare o editor. Todos começam juntos.</p>
      ) : (
        <PausedBadge />
      )}
    </div>
  );
}
