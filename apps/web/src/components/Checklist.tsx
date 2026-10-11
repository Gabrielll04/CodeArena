import { useEffect, useRef } from 'react';
import type { ChecklistEvaluationResult, ChecklistItemStatus } from '@codearena/plugin-sdk';
import type { ChecklistItem } from '@codearena/schemas';
import { playCue } from '../lib/sound';
import { IsoMark, IsoTower } from './iso';
import { cx, Spinner } from './ui';

function Indicator({ status, checking }: { status: ChecklistItemStatus; checking: boolean }) {
  if ((checking && status !== 'done') || status === 'running') {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center text-sky-deep">
        <Spinner className="h-4 w-4" />
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-tomato/10 text-sm font-bold text-tomato ring-1 ring-inset ring-tomato/40">!</span>
    );
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center">
      <IsoMark done={status === 'done'} />
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
        'rounded-2xl border bg-surface p-4 transition-colors duration-300',
        complete ? 'border-mint/50' : 'border-fg/[0.09]',
      )}
    >
      <header className="mb-4 flex items-end gap-4">
        <IsoTower total={evaluation.requiredTotal} done={evaluation.requiredDone} complete={complete} width={compact ? 48 : 60} />
        <div className="min-w-0 flex-1 pb-1">
          <h3 className="text-sm font-bold text-fg/70">Checklist</h3>
          <p className={cx('font-display text-3xl font-extrabold leading-none tabular', complete ? 'text-mint' : 'text-fg')} data-testid="checklist-count">
            {evaluation.requiredDone}/{evaluation.requiredTotal}
          </p>
          <p className="mt-1 text-xs text-fg/60">{complete ? 'Torre completa' : 'Cada item concluído vira um bloco'}</p>
        </div>
      </header>
      <ol className={cx('space-y-2.5', compact && 'space-y-1.5')}>
        {items.map((item) => {
          const result = byId.get(item.id);
          const status = result?.status ?? 'pending';
          const isChecking = checking?.has(item.id) ?? false;
          return (
            <li key={item.id} data-testid={`checklist-item-${item.id}`} data-status={status} className="flex gap-2.5">
              <Indicator status={status} checking={isChecking} />
              <div className="min-w-0 flex-1 pt-0.5">
                <p className={cx('text-sm leading-snug transition-colors', status === 'done' ? 'text-fg' : 'text-fg/75')}>
                  {item.label}
                  {item.optional && <span className="ml-1.5 text-xs font-semibold text-fg/55">opcional</span>}
                  <span className="sr-only"> ({STATUS_TEXT[status]})</span>
                </p>
                {result?.message && status !== 'done' && (
                  <p className={cx('mt-0.5 break-words font-mono text-[11px] leading-snug', status === 'failed' ? 'text-tomato' : 'text-fg/60')}>
                    {result.message}
                  </p>
                )}
                {!compact && item.hint && status !== 'done' && !result?.message && (
                  <p className="mt-0.5 text-xs text-fg/55">{item.hint}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
