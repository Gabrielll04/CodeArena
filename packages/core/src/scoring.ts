export interface XPInput {
  baseXP: number;
  speedBonusMax: number;
  timeLimitMs: number;
  /** Tempo restante no relógio do servidor no momento em que a resposta chegou. */
  remainingMs: number;
}

export interface XPBreakdown {
  base: number;
  speedBonus: number;
  total: number;
}

/**
 * xp = xpBase + bonusVelocidade
 * bonusVelocidade = bonusMax * (tempoRestanteMs / tempoTotalMs), arredondado para inteiro.
 */
export function calculateXP({ baseXP, speedBonusMax, timeLimitMs, remainingMs }: XPInput): XPBreakdown {
  if (timeLimitMs <= 0 || remainingMs <= 0) return { base: baseXP, speedBonus: 0, total: baseXP };
  const ratio = Math.min(1, remainingMs / timeLimitMs);
  const speedBonus = Math.round(speedBonusMax * ratio);
  return { base: baseXP, speedBonus, total: baseXP + speedBonus };
}

export interface StreakSettings {
  streakEnabled: boolean;
  streakBonus: number;
  streakMaxSteps: number;
}

/**
 * Bônus de sequência. `streak` é o número de acertos consecutivos contando o atual.
 * O primeiro acerto não tem bônus; a partir do segundo soma `streakBonus` por passo, até `streakMaxSteps`.
 */
export function calculateStreakBonus(streak: number, settings: StreakSettings): number {
  if (!settings.streakEnabled || streak < 2) return 0;
  return Math.min(streak - 1, settings.streakMaxSteps) * settings.streakBonus;
}

export interface RankablePlayer {
  id: string;
  name: string;
  totalXP: number;
  /** Horário (servidor) da última resposta correta; null se nunca acertou. */
  lastCorrectAt: number | null;
}

/** Ordena por XP total (desc) e, no empate, por quem fez a última resposta correta antes. */
export function compareRanking(a: RankablePlayer, b: RankablePlayer): number {
  if (b.totalXP !== a.totalXP) return b.totalXP - a.totalXP;
  const at = a.lastCorrectAt ?? Number.POSITIVE_INFINITY;
  const bt = b.lastCorrectAt ?? Number.POSITIVE_INFINITY;
  if (at !== bt) return at < bt ? -1 : 1;
  return a.name.localeCompare(b.name, 'pt-BR');
}

/** Devolve os jogadores ordenados com posição. Empate total (XP e horário) compartilha posição. */
export function rankPlayers<T extends RankablePlayer>(players: T[]): (T & { rank: number })[] {
  const sorted = [...players].sort(compareRanking);
  let rank = 0;
  return sorted.map((player, index) => {
    const prev = sorted[index - 1];
    const tied = prev && prev.totalXP === player.totalXP && prev.lastCorrectAt === player.lastCorrectAt;
    if (!tied) rank = index + 1;
    return { ...player, rank };
  });
}
