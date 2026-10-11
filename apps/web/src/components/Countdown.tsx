import { AnimatePresence, motion } from 'framer-motion';
import { useRef } from 'react';
import { useServerNow } from '../lib/clock';
import { IsoCountdownStack } from './iso';

/** Contagem regressiva sincronizada pelo relógio do servidor antes de a questão começar. Um bloco cai por segundo. */
export function Countdown({ startsAt, index, total, title }: { startsAt: number; index: number; total: number; title?: string }) {
  const now = useServerNow(true, 100);
  const seconds = Math.max(0, Math.ceil((startsAt - now) / 1000));
  const longest = useRef(seconds);
  longest.current = Math.max(longest.current, seconds);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-5 text-center" data-testid="countdown">
      <p className="text-sm font-bold text-fg/60">
        Questão {index + 1} de {total}
      </p>
      {title && <p className="max-w-xl font-display text-3xl font-extrabold leading-tight">{title}</p>}
      <div className="flex items-end gap-8">
        <IsoCountdownStack total={longest.current} placed={longest.current - seconds} />
        <div className="relative flex h-36 w-36 items-center justify-center">
          <AnimatePresence mode="popLayout">
            <motion.span
              key={seconds}
              initial={{ y: -40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 30, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 24 }}
              className="font-display text-[6.5rem] font-black leading-none text-cobalt"
            >
              {seconds > 0 ? seconds : 'Já'}
            </motion.span>
          </AnimatePresence>
        </div>
      </div>
      <p className="text-fg/60">Prepare o editor. Todos começam juntos.</p>
    </div>
  );
}
