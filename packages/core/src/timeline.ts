import type { ChecklistItem, PasteImpact, PasteStats, PlayerTimeline, TimelineEvent } from '@codearena/schemas';

/** Colagens guardadas por aluno e questão; as seguintes só entram nas contagens (protege a memória do servidor). */
export const MAX_PASTE_EVENTS = 40;
/** Colagens menores que isso não contam como indício (ex.: colar o nome de uma variável). */
export const PASTE_IMPACT_MIN_CHARS = 40;
/** Janela depois da colagem em que itens concluídos são atribuídos a ela. */
export const PASTE_IMPACT_WINDOW_MS = 10_000;
/** Mínimo de itens obrigatórios na janela, em número absoluto e em fração da checklist. */
export const PASTE_IMPACT_MIN_ITEMS = 2;
export const PASTE_IMPACT_MIN_SHARE = 0.4;

export interface PasteRecord {
  /** Relógio do servidor (ms). */
  at: number;
  chars: number;
  blocked: boolean;
}

export interface PasteLog {
  stats: PasteStats;
  events: PasteRecord[];
}

export function createPasteLog(): PasteLog {
  return { stats: { count: 0, chars: 0, largest: 0, blocked: 0 }, events: [] };
}

/** Acrescenta uma colagem ao registro do aluno. */
export function recordPaste(log: PasteLog, paste: PasteRecord): void {
  if (paste.blocked) {
    log.stats.blocked++;
  } else {
    log.stats.count++;
    log.stats.chars += paste.chars;
    log.stats.largest = Math.max(log.stats.largest, paste.chars);
  }
  if (log.events.length < MAX_PASTE_EVENTS) log.events.push(paste);
}

/**
 * A colagem (de tamanho relevante) seguida do maior número de itens obrigatórios concluídos pela primeira vez.
 * Devolve null quando nenhuma colagem explica uma parte relevante da checklist.
 */
export function findPasteImpact(
  pastes: { atMs: number; chars: number }[],
  requiredDoneAtMs: number[],
  requiredTotal: number,
): PasteImpact | null {
  const threshold = Math.max(PASTE_IMPACT_MIN_ITEMS, Math.ceil(requiredTotal * PASTE_IMPACT_MIN_SHARE));
  let best: PasteImpact | null = null;
  for (const paste of pastes) {
    if (paste.chars < PASTE_IMPACT_MIN_CHARS) continue;
    const items = requiredDoneAtMs.filter((t) => t >= paste.atMs && t <= paste.atMs + PASTE_IMPACT_WINDOW_MS).length;
    if (items >= threshold && (!best || items > best.items || (items === best.items && paste.chars > best.chars))) {
      best = { atMs: paste.atMs, chars: paste.chars, items };
    }
  }
  return best;
}

export interface TimelineInput {
  playerId: string;
  /** Início da questão no relógio do servidor. */
  startsAt: number;
  checklist: ChecklistItem[];
  /** Primeira conclusão de cada item (relógio do servidor). */
  itemFirstAt: ReadonlyMap<string, number>;
  pastes?: PasteLog;
  acceptedAt: number | null;
}

/** Monta a linha do tempo de um aluno: itens concluídos, colagens e resposta aceita, em ordem. */
export function buildPlayerTimeline(input: TimelineInput): PlayerTimeline {
  const relative = (at: number) => Math.max(0, at - input.startsAt);
  const events: TimelineEvent[] = [];
  const requiredDoneAtMs: number[] = [];

  for (const item of input.checklist) {
    const at = input.itemFirstAt.get(item.id);
    if (at === undefined) continue;
    events.push({ kind: 'item', atMs: relative(at), itemId: item.id });
    if (!item.optional) requiredDoneAtMs.push(relative(at));
  }
  const pastes = (input.pastes?.events ?? []).map((p) => ({ ...p, atMs: relative(p.at) }));
  for (const paste of pastes) {
    events.push(paste.blocked ? { kind: 'paste-blocked', atMs: paste.atMs } : { kind: 'paste', atMs: paste.atMs, chars: paste.chars });
  }
  if (input.acceptedAt !== null) events.push({ kind: 'accepted', atMs: relative(input.acceptedAt) });
  // Mesmo instante: a colagem vem antes dos itens que ela concluiu, e a resposta aceita por último.
  const order: Record<TimelineEvent['kind'], number> = { 'paste-blocked': 0, paste: 1, item: 2, accepted: 3 };
  events.sort((a, b) => a.atMs - b.atMs || order[a.kind] - order[b.kind]);

  const requiredTotal = input.checklist.filter((i) => !i.optional).length;
  return {
    playerId: input.playerId,
    events,
    paste: input.pastes ? { ...input.pastes.stats } : createPasteLog().stats,
    pasteImpact: findPasteImpact(pastes.filter((p) => !p.blocked), requiredDoneAtMs, requiredTotal),
  };
}
