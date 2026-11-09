import type { ChecklistItem } from '@codearena/schemas';
import { CAPABILITY_LABEL } from '../lib/criteria';
import { Badge } from './ui';

/** Crítico (obrigatório) ou desejável (opcional), como na MSEP. */
export function CriterionBadge({ item, className }: { item: Pick<ChecklistItem, 'optional'>; className?: string }) {
  return item.optional ? <Badge className={className}>Desejável</Badge> : <Badge tone="amber" className={className}>Crítico</Badge>;
}

export function CapabilityText({ item }: { item: Pick<ChecklistItem, 'capability'> }) {
  if (!item.capability) return null;
  return (
    <span className="text-xs text-white/45">
      {CAPABILITY_LABEL[item.capability.type]}: {item.capability.name}
    </span>
  );
}

/** Critérios da questão na atividade: o aluno vê o que será avaliado, sem marcação automática. */
export function CriteriaList({ items }: { items: ChecklistItem[] }) {
  return (
    <section aria-label="Critérios de avaliação" data-testid="criteria" className="rounded-2xl border border-white/[0.07] bg-ink-850/80 p-4">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-white/60">Critérios de avaliação</h3>
      <ul className="space-y-3">
        {items.map((item) => (
          <li key={item.id} data-testid={`criterion-${item.id}`} className="space-y-1">
            <p className="text-sm leading-snug text-white/85">
              <CriterionBadge item={item} className="mr-2 align-middle" />
              {item.label}
            </p>
            <CapabilityText item={item} />
            {item.hint && <p className="text-xs text-white/40">{item.hint}</p>}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-white/40">Os críticos são obrigatórios. O professor avalia depois.</p>
    </section>
  );
}
