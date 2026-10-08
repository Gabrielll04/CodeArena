import { describe, expect, it } from 'vitest';
import { calculateStreakBonus, calculateXP, rankPlayers } from '../src';

describe('calculateXP', () => {
  it('segue o exemplo do enunciado: 500 base + 250 de bônus com metade do tempo', () => {
    expect(calculateXP({ baseXP: 500, speedBonusMax: 500, timeLimitMs: 180_000, remainingMs: 90_000 })).toEqual({
      base: 500,
      speedBonus: 250,
      total: 750,
    });
  });

  it('arredonda para inteiro', () => {
    expect(calculateXP({ baseXP: 500, speedBonusMax: 500, timeLimitMs: 180_000, remainingMs: 100_000 }).total).toBe(778);
  });

  it('quem responde antes recebe mais XP', () => {
    const fast = calculateXP({ baseXP: 500, speedBonusMax: 500, timeLimitMs: 60_000, remainingMs: 50_000 });
    const slow = calculateXP({ baseXP: 500, speedBonusMax: 500, timeLimitMs: 60_000, remainingMs: 10_000 });
    expect(fast.total).toBeGreaterThan(slow.total);
  });

  it('limita o bônus entre 0 e o máximo', () => {
    expect(calculateXP({ baseXP: 100, speedBonusMax: 100, timeLimitMs: 1000, remainingMs: 5000 }).total).toBe(200);
    expect(calculateXP({ baseXP: 100, speedBonusMax: 100, timeLimitMs: 1000, remainingMs: -5 }).total).toBe(100);
  });
});

describe('calculateStreakBonus', () => {
  const settings = { streakEnabled: true, streakBonus: 50, streakMaxSteps: 3 };
  it('não dá bônus no primeiro acerto e cresce até o limite', () => {
    expect([1, 2, 3, 4, 5, 9].map((s) => calculateStreakBonus(s, settings))).toEqual([0, 50, 100, 150, 150, 150]);
  });
  it('fica desligado por padrão', () => {
    expect(calculateStreakBonus(5, { ...settings, streakEnabled: false })).toBe(0);
  });
});

describe('rankPlayers', () => {
  it('ordena por XP e desempata pelo horário da última resposta correta', () => {
    const ranked = rankPlayers([
      { id: 'a', name: 'Ana', totalXP: 900, lastCorrectAt: 2000 },
      { id: 'b', name: 'Bia', totalXP: 1200, lastCorrectAt: 5000 },
      { id: 'c', name: 'Caio', totalXP: 900, lastCorrectAt: 1000 },
      { id: 'd', name: 'Duda', totalXP: 0, lastCorrectAt: null },
    ]);
    expect(ranked.map((p) => [p.id, p.rank])).toEqual([
      ['b', 1],
      ['c', 2],
      ['a', 3],
      ['d', 4],
    ]);
  });

  it('empate total compartilha a posição', () => {
    const ranked = rankPlayers([
      { id: 'a', name: 'Ana', totalXP: 500, lastCorrectAt: 100 },
      { id: 'b', name: 'Bia', totalXP: 500, lastCorrectAt: 100 },
      { id: 'c', name: 'Caio', totalXP: 100, lastCorrectAt: 50 },
    ]);
    expect(ranked.map((p) => p.rank)).toEqual([1, 1, 3]);
  });
});
