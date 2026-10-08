import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { ChecklistEvaluationResult, ChecklistItemStatus } from '@codearena/plugin-sdk';
import type { ChecklistItem } from '@codearena/schemas';
import { playCue } from '../lib/sound';
import { cx, Spinner } from './ui';

function Indicator({ status, checking }: { status: ChecklistItemStatus; checking: boolean }) {
  if (checking && status !== 'done') {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-cyan/50 text-cyan">
        <Spinner className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span className="relative flex h-6 w-6 items-center justify-center">
      <AnimatePresence initial={false} mode="popLayout">
        {status === 'done' ? (
          <motion.span
            key="done"
            initial={{ scale: 0.3, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0.3, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 600, damping: 18 }}
            className="flex h-6 w-6 animate-pulse-ring items-center justify-center rounded-full bg-lime text-ink-950"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <motion.path d="m5 12.5 4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.25, delay: 0.05 }} />
            </svg>
          </motion.span>
        ) : status === 'failed' ? (
          <motion.span key="failed" initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="flex h-6 w-6 items-center justify-center rounded-full font-bold text-coral ring-2 ring-coral/70">
            !
          </motion.span>
        ) : status === 'running' ? (
          <span key="running" className="flex h-6 w-6 items-center justify-center rounded-full text-cyan ring-2 ring-cyan/50">
            <Spinner className="h-3.5 w-3.5" />
          </span>
        ) : (
          <motion.span key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-6 w-6 rounded-full ring-2 ring-white/20" />
        )}
      </AnimatePresence>
    </span>
  );
}

const STATUS_TEXT: Record<ChecklistItemStatus, string> = {
  pending: 'pendente',
  running: 'executando',
  done: 'concluído',
  failed: 'falhou',
};

export interface ChecklistProps {
  items: ChecklistItem[];
  evaluation: ChecklistEvaluationResult;
  checking?: Set<string>;
  /** Toca som e anima quando um item é concluído (desligado no editor do professor). */
  announce?: boolean;
  compact?: boolean;
}

export function Checklist({ items, evaluation, checking, announce = true, compact }: ChecklistProps) {
  const previous = useRef<Map<string, ChecklistItemStatus>>(new Map());
  const byId = new Map(evaluation.items.map((r) => [r.id, r]));
  const complete = evaluation.allRequiredDone;
  const percent = evaluation.requiredTotal ? (evaluation.requiredDone / evaluation.requiredTotal) * 100 : 0;

  useEffect(() => {
    let newlyDone = false;
    evaluation.items.forEach((item) => {
      const before = previous.current.get(item.id);
      if (item.status === 'done' && before && before !== 'done') newlyDone = true;
      previous.current.set(item.id, item.status);
    });
    if (announce && newlyDone) playCue('check');
  }, [evaluation, announce]);

  return (
    <section
      aria-label="Checklist da questão"
      data-testid="checklist"
      data-complete={complete}
      className={cx(
        'rounded-2xl border p-4 transition-colors duration-300',
        complete ? 'border-lime/50 bg-lime/[0.06] shadow-glow' : 'border-white/[0.07] bg-ink-850/80',
      )}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-white/60">Checklist</h3>
        <span className={cx('font-mono text-xs font-semibold', complete ? 'text-lime' : 'text-white/60')} data-testid="checklist-count">
          {evaluation.requiredDone}/{evaluation.requiredTotal}
        </span>
      </header>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden>
        <motion.div className="h-full rounded-full bg-lime" animate={{ width: `${percent}%` }} transition={{ type: 'spring', stiffness: 200, damping: 26 }} />
      </div>
      <ol className={cx('space-y-2.5', compact && 'space-y-1.5')}>
        {items.map((item) => {
          const result = byId.get(item.id);
          const status = result?.status ?? 'pending';
          const isChecking = checking?.has(item.id) ?? false;
          return (
            <li key={item.id} data-testid={`checklist-item-${item.id}`} data-status={status} className="flex gap-3">
              <Indicator status={status} checking={isChecking} />
              <div className="min-w-0 flex-1 pt-0.5">
                <p className={cx('text-sm leading-snug transition-colors', status === 'done' ? 'text-white' : 'text-white/80')}>
                  {item.label}
                  {item.optional && <span className="ml-1.5 text-[11px] font-medium uppercase tracking-wider text-white/35">opcional</span>}
                  <span className="sr-only"> ({STATUS_TEXT[status]})</span>
                </p>
                {result?.message && status !== 'done' && (
                  <p className={cx('mt-0.5 break-words font-mono text-[11px] leading-snug', status === 'failed' ? 'text-coral' : 'text-white/45')}>
                    {result.message}
                  </p>
                )}
                {!compact && item.hint && status !== 'done' && !result?.message && (
                  <p className="mt-0.5 text-xs text-white/40">{item.hint}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
