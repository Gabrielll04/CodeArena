import type { CapabilityMap, CapabilityRef, CapabilityStatus } from '@codearena/core';
import type { CapabilityType } from '@codearena/schemas';

/** Ordem fixa das situações: do melhor para o que pede ação. A cor segue a situação, nunca a posição. */
export const STATUS_ORDER: CapabilityStatus[] = ['developed', 'recovered', 'developing', 'to-recover'];

export const STATUS_META: Record<
  CapabilityStatus,
  { label: string; short: string; icon: 'check' | 'arrow-up' | 'half' | 'x'; fill: string; text: string; soft: string }
> = {
  developed: { label: 'Desenvolvida', short: 'Desenvolvida', icon: 'check', fill: 'bg-lime', text: 'text-lime', soft: 'bg-lime/15' },
  recovered: { label: 'Recuperada', short: 'Recuperada', icon: 'arrow-up', fill: 'bg-cyan', text: 'text-cyan', soft: 'bg-cyan/15' },
  developing: { label: 'Em desenvolvimento', short: 'Em desenv.', icon: 'half', fill: 'bg-amber', text: 'text-amber', soft: 'bg-amber/15' },
  'to-recover': { label: 'A recuperar', short: 'A recuperar', icon: 'x', fill: 'bg-coral', text: 'text-coral', soft: 'bg-coral/15' },
};

export const TYPE_LABEL: Record<CapabilityType, string> = {
  'capacidade-tecnica': 'Capacidade técnica',
  'capacidade-socioemocional': 'Capacidade socioemocional',
  conhecimento: 'Conhecimento',
};

export type StatusCounts = Record<CapabilityStatus, number>;

const emptyCounts = (): StatusCounts => ({ developed: 0, recovered: 0, developing: 0, 'to-recover': 0 });

/** Quantos alunos estão em cada situação, por capacidade. Alunos sem avaliação na capacidade não contam. */
export function countsByCapability(map: CapabilityMap): Map<string, StatusCounts> {
  const result = new Map(map.capabilities.map((c) => [c.key, emptyCounts()]));
  for (const student of map.students) {
    for (const [key, cell] of Object.entries(student.cells)) result.get(key)![cell.status]++;
  }
  return result;
}

export function totalCounts(map: CapabilityMap): StatusCounts {
  const total = emptyCounts();
  for (const student of map.students) for (const cell of Object.values(student.cells)) total[cell.status]++;
  return total;
}

/** Capacidades em ordem de atenção: mais alunos a recuperar primeiro; empate, menos desenvolvidas. */
export function byAttention(map: CapabilityMap, counts = countsByCapability(map)): CapabilityRef[] {
  const score = (key: string) => {
    const c = counts.get(key)!;
    return [c['to-recover'], c.developing, -(c.developed + c.recovered)];
  };
  return [...map.capabilities].sort((a, b) => {
    const [x, y] = [score(a.key), score(b.key)];
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i]! - x[i]!;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}

/** Questões (sem repetir) que cobrem as capacidades escolhidas, na ordem das capacidades. */
export function questionsFor(map: CapabilityMap, keys: Iterable<string>): { id: string; title: string }[] {
  const wanted = new Set(keys);
  const seen = new Map<string, string>();
  for (const capability of map.capabilities) {
    if (!wanted.has(capability.key)) continue;
    for (const q of capability.questions) if (!seen.has(q.id)) seen.set(q.id, q.title);
  }
  return [...seen].map(([id, title]) => ({ id, title }));
}
