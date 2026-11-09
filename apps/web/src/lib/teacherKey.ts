import { local } from './storage';

const KEY = 'codearena:teacher-key';
const PATTERN = /^[A-Za-z0-9_-]{24,128}$/;

/**
 * Chave do professor neste navegador. As salas criadas com ela ficam no histórico dele; o servidor guarda só o hash.
 * Gerada no primeiro uso.
 */
export function teacherKey(): string {
  const stored = local.get<string>(KEY);
  if (stored && PATTERN.test(stored)) return stored;
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const key = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  local.set(KEY, key);
  return key;
}

/** Usa a chave de outro navegador (para ver o mesmo histórico). Devolve false se o formato for inválido. */
export function setTeacherKey(key: string): boolean {
  const trimmed = key.trim();
  if (!PATTERN.test(trimmed)) return false;
  local.set(KEY, trimmed);
  return true;
}
