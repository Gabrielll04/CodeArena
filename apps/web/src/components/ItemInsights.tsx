import { motion } from 'framer-motion';
import type { ItemInsight, SessionReport } from '@codearena/schemas';
import { formatDuration } from '../lib/format';
import { Badge, cx } from './ui';

export interface InsightRow {
  id: string;
  label: string;
  done: number;
  total: number;
  optional?: boolean;
  medianTimeMs?: number | null;
}

export function rowsFromResults(items: ItemInsight[]): InsightRow[] {
  return items.map((i) => ({
    id: i.id,
    label: i.label,
    done: i.completedCount,
    total: i.playerCount,
    optional: i.optional,
    medianTimeMs: i.medianTimeMs,
  }));
}

const ratio = (row: InsightRow) => (row.total > 0 ? row.done / row.total : 1);

/** Item obrigatório com menor taxa de conclusão; empate pelo maior tempo mediano. Nulo se todos concluíram tudo. */
export function hardestRow(rows: InsightRow[]): InsightRow | null {
  const candidates = rows.filter((r) => !r.optional && r.total > 0 && r.done < r.total);
  if (!candidates.length) return null;
  return candidates.reduce((worst, row) => {
    const a = ratio(row);
    const b = ratio(worst);
    if (a !== b) return a < b ? row : worst;
    return (row.medianTimeMs ?? 0) > (worst.medianTimeMs ?? 0) ? row : worst;
  });
}

export interface ItemInsightsProps {
  rows: InsightRow[];
  /** Marca o item que mais travou (use só quando a questão terminou). */
  highlightHardest?: boolean;
  showTime?: boolean;
}

export function ItemInsights({ rows, highlightHardest = false, showTime = false }: ItemInsightsProps) {
  const hardest = highlightHardest ? hardestRow(rows) : null;
  return (
    <ol className="space-y-3" data-testid="item-insights">
      {rows.map((row, index) => {
        const percent = ratio(row) * 100;
        const isHardest = hardest?.id === row.id;
        const complete = row.total > 0 && row.done === row.total;
        return (
          <li key={row.id} data-testid={`insight-${row.id}`} data-done={row.done} data-total={row.total} className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1.5">
            <span className="pt-0.5 font-mono text-xs text-fg/50">{index + 1}</span>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm leading-snug text-fg/85">
                <span>{row.label}</span>
                {row.optional && <span className="text-xs font-semibold text-fg/55">opcional</span>}
                {isHardest && <Badge tone="tomato">Mais travou</Badge>}
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-fg/[0.07]" aria-hidden>
                <motion.div
                  className={cx('h-full rounded-full', isHardest ? 'bg-tomato' : complete ? 'bg-mint' : 'bg-cobalt')}
                  initial={{ width: 0 }}
                  animate={{ width: `${percent}%` }}
                  transition={{ type: 'spring', stiffness: 200, damping: 26 }}
                />
              </div>
            </div>
            <div className="pt-0.5 text-right">
              <p className={cx('font-mono text-sm font-bold tabular-nums', isHardest ? 'text-tomato' : complete ? 'text-mint' : 'text-fg')}>
                {row.done}/{row.total}
              </p>
              {showTime && <p className="font-mono text-[11px] text-fg/55">{row.medianTimeMs === null || row.medianTimeMs === undefined ? '-' : formatDuration(row.medianTimeMs)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export interface SessionHardItem extends InsightRow {
  questionIndex: number;
  questionTitle: string;
}

/** Itens com menor taxa de conclusão em toda a sessão (apenas os que alguém não concluiu). */
export function hardestAcrossSession(report: SessionReport, limit = 3): SessionHardItem[] {
  const all: SessionHardItem[] = report.questions.flatMap((q) =>
    rowsFromResults(q.items)
      .filter((r) => !r.optional && r.total > 0 && r.done < r.total)
      .map((r) => ({ ...r, questionIndex: q.index, questionTitle: q.title })),
  );
  return all.sort((a, b) => ratio(a) - ratio(b) || (b.medianTimeMs ?? 0) - (a.medianTimeMs ?? 0)).slice(0, limit);
}
