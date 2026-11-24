import { motion } from 'framer-motion';
import type { CapabilityRef } from '@codearena/core';
import { STATUS_META, STATUS_ORDER, TYPE_LABEL, type StatusCounts } from '../lib/capabilities';
import { plural } from '../lib/format';
import { useChartTooltip } from './ChartTooltip';
import { cx, Icon } from './ui';

/** Legenda das situações: cor, ícone e nome (a cor nunca aparece sozinha). */
export function StatusLegend({ className }: { className?: string }) {
  return (
    <ul className={cx('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-white/60', className)} aria-label="Legenda">
      {STATUS_ORDER.map((status) => {
        const meta = STATUS_META[status];
        return (
          <li key={status} className="flex items-center gap-1.5">
            <span className={cx('flex h-4 w-4 items-center justify-center rounded', meta.soft, meta.text)}>
              <Icon name={meta.icon} className="h-3 w-3" />
            </span>
            {meta.label}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Barras empilhadas: para cada capacidade, quantos alunos estão em cada situação. A ordem das linhas vem de fora (as
 * que pedem mais atenção primeiro); clicar numa linha destaca a capacidade na matriz e na recuperação.
 */
export function CapabilityBars({
  capabilities,
  counts,
  selected,
  onToggle,
}: {
  capabilities: CapabilityRef[];
  counts: Map<string, StatusCounts>;
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
}) {
  const { bind, tooltip } = useChartTooltip();

  return (
    <>
      <ol className="space-y-1" data-testid="capability-bars">
        {capabilities.map((capability) => {
          const count = counts.get(capability.key)!;
          const total = STATUS_ORDER.reduce((sum, status) => sum + count[status], 0);
          const isSelected = selected.has(capability.key);
          return (
            <li key={capability.key} data-testid={`capability-bar-${capability.key}`}>
              <div
                className={cx(
                  'grid grid-cols-[minmax(0,15rem)_minmax(0,1fr)_4.5rem] items-center gap-4 rounded-xl px-3 py-2 transition',
                  isSelected ? 'bg-white/[0.08] ring-1 ring-white/15' : 'hover:bg-white/[0.04]',
                )}
              >
                <button
                  type="button"
                  onClick={() => onToggle(capability.key)}
                  aria-pressed={isSelected}
                  className="min-w-0 rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-lime"
                >
                  <span className="block truncate text-sm font-semibold text-white/90" title={capability.name}>
                    {capability.name}
                  </span>
                  <span className="block truncate text-[11px] text-white/40">
                    {TYPE_LABEL[capability.type]} · {plural(capability.questions.length, 'questão', 'questões')}
                  </span>
                </button>
                <div className="flex h-3 gap-[2px]">
                  <span className="sr-only">{describe(capability.name, count, total)}</span>
                  {STATUS_ORDER.filter((status) => count[status] > 0).map((status) => (
                    <motion.span
                      key={status}
                      aria-hidden
                      className={cx('h-full rounded-[4px] transition hover:brightness-125', STATUS_META[status].fill)}
                      initial={{ width: 0 }}
                      animate={{ width: `${(count[status] / total) * 100}%` }}
                      transition={{ type: 'spring', stiffness: 200, damping: 26 }}
                      {...bind(
                        <>
                          <p className="font-mono text-sm font-bold text-white">
                            {count[status]} de {plural(total, 'aluno')}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1.5">
                            <span className={cx('inline-block h-0.5 w-3 rounded', STATUS_META[status].fill)} />
                            {STATUS_META[status].label} em {capability.name}
                          </p>
                        </>,
                      )}
                    />
                  ))}
                </div>
                <p className="text-right">
                  <span className={cx('font-mono text-sm font-bold tabular-nums', count['to-recover'] ? 'text-white' : 'text-white/30')}>
                    {count['to-recover']}
                  </span>
                  <span className="block text-[11px] leading-tight text-white/40">a recuperar</span>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {tooltip}
    </>
  );
}

function describe(name: string, count: StatusCounts, total: number): string {
  const parts = STATUS_ORDER.filter((s) => count[s] > 0).map((s) => `${count[s]} ${STATUS_META[s].label.toLowerCase()}`);
  return `${name}: ${parts.join(', ')}, de ${plural(total, 'aluno')}`;
}
