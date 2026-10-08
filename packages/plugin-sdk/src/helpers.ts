import type { ValidatorOutcome } from './types';

export function pass(message?: string): ValidatorOutcome {
  return message ? { passed: true, message } : true;
}

export function fail(message?: string): ValidatorOutcome {
  return message ? { passed: false, message } : false;
}

/** Escapa um texto para uso literal dentro de uma RegExp. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** Comparação profunda de valores JSON. */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => jsonEqual(value, b[index]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = Object.keys(ao);
  if (keys.length !== Object.keys(bo).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(bo, key) && jsonEqual(ao[key], bo[key]));
}

/** `expected` está contido em `actual` (objetos parciais; arrays comparados elemento a elemento). */
export function jsonContains(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== 'object') return jsonEqual(actual, expected);
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((v, i) => jsonContains(actual[i], v));
  }
  if (actual === null || typeof actual !== 'object' || Array.isArray(actual)) return false;
  const ao = actual as Record<string, unknown>;
  return Object.entries(expected as Record<string, unknown>).every(
    ([key, value]) => Object.prototype.hasOwnProperty.call(ao, key) && jsonContains(ao[key], value),
  );
}
