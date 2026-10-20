import { describe, expect, it } from 'vitest';
import { QuestionSchema } from '@codearena/schemas';
import { MAX_PASTE_EVENTS, buildPlayerTimeline, createPasteLog, findPasteImpact, recordPaste } from '../src';

describe('findPasteImpact', () => {
  it('liga a colagem grande aos itens concluídos logo depois', () => {
    expect(findPasteImpact([{ atMs: 10_000, chars: 300 }], [10_500, 11_000, 30_000], 3)).toEqual({ atMs: 10_000, chars: 300, items: 2 });
  });

  it('ignora colagens pequenas, itens fora da janela e impacto pequeno em checklists grandes', () => {
    expect(findPasteImpact([{ atMs: 0, chars: 20 }], [100, 200, 300], 3)).toBeNull();
    expect(findPasteImpact([{ atMs: 0, chars: 300 }], [11_000, 12_000], 2)).toBeNull();
    // 2 de 10 itens não chega a 40% da checklist.
    expect(findPasteImpact([{ atMs: 0, chars: 300 }], [100, 200], 10)).toBeNull();
  });

  it('escolhe a colagem que explica mais itens', () => {
    const impact = findPasteImpact([{ atMs: 0, chars: 500 }, { atMs: 20_000, chars: 100 }], [1_000, 21_000, 22_000, 23_000], 4);
    expect(impact).toEqual({ atMs: 20_000, chars: 100, items: 3 });
  });
});

describe('buildPlayerTimeline', () => {
  const checklist = QuestionSchema.parse({
    id: 'q',
    prompt: 'p',
    timeLimitSeconds: 60,
    baseXP: 100,
    speedBonusMax: 100,
    checklist: [
      { id: 'a', label: 'A', rule: { type: 'contains', value: 'aaa' } },
      { id: 'extra', label: 'Extra', optional: true, rule: { type: 'contains', value: 'zzz' } },
    ],
  }).checklist;

  it('ordena eventos e põe a colagem antes dos itens do mesmo instante', () => {
    const pastes = createPasteLog();
    recordPaste(pastes, { at: 1_005_000, chars: 80, blocked: false });
    const timeline = buildPlayerTimeline({
      playerId: 'p1',
      startsAt: 1_000_000,
      checklist,
      itemFirstAt: new Map([['a', 1_005_000], ['extra', 1_002_000]]),
      pastes,
      acceptedAt: 1_005_000,
    });
    expect(timeline.events).toEqual([
      { kind: 'item', atMs: 2_000, itemId: 'extra' },
      { kind: 'paste', atMs: 5_000, chars: 80 },
      { kind: 'item', atMs: 5_000, itemId: 'a' },
      { kind: 'accepted', atMs: 5_000 },
    ]);
  });

  it('limita os eventos guardados, mas continua contando', () => {
    const log = createPasteLog();
    for (let i = 0; i < MAX_PASTE_EVENTS + 10; i++) recordPaste(log, { at: i, chars: 1, blocked: i % 2 === 0 });
    expect(log.events).toHaveLength(MAX_PASTE_EVENTS);
    expect(log.stats.count + log.stats.blocked).toBe(MAX_PASTE_EVENTS + 10);
  });
});
