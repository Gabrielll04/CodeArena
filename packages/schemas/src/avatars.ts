/**
 * Avatares pré-definidos. O desenho de cada um é feito no frontend
 * a partir do id (forma + cor + olhos), sem upload de imagem.
 */
export const AVATAR_IDS = [
  'bolt',
  'prism',
  'orbit',
  'cube',
  'wave',
  'spark',
  'hex',
  'comet',
  'pixel',
  'nova',
  'gear',
  'drop',
  'ring',
  'leaf',
  'flare',
  'node',
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && (AVATAR_IDS as readonly string[]).includes(value);
}
