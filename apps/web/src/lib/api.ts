import type { AuthoringWarning } from '@codearena/core';
import type { ChecklistEvaluationResult } from '@codearena/plugin-sdk';
import type { Question, QuestionPack, ValidationIssue } from '@codearena/schemas';

export interface PackSummary {
  id: string;
  source: 'builtin' | 'user';
  title: string;
  description: string;
  pluginId: string;
  pluginIds: string[];
  version: string;
  tags: string[];
  questionCount: number;
  updatedAt: string;
}

export interface StoredPack {
  id: string;
  source: 'builtin' | 'user';
  createdAt: string;
  updatedAt: string;
  pack: QuestionPack;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly issues: ValidationIssue[] = [],
  ) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: init?.body ? { 'content-type': 'application/json', ...init.headers } : init?.headers,
    });
  } catch {
    throw new ApiError(0, 'Servidor indisponível. Verifique se ele está rodando.');
  }
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, data.error ?? `Erro ${response.status}`, data.issues ?? []);
  return data as T;
}

export const api = {
  listPacks: () => call<PackSummary[]>('/api/packs'),
  getPack: (id: string) => call<StoredPack>(`/api/packs/${encodeURIComponent(id)}`),
  createPack: (pack: unknown) => call<StoredPack>('/api/packs', { method: 'POST', body: JSON.stringify(pack) }),
  updatePack: (id: string, pack: unknown) =>
    call<StoredPack>(`/api/packs/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(pack) }),
  deletePack: (id: string) => call<void>(`/api/packs/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  roomInfo: (code: string) =>
    call<{ code: string; phase: string; packTitle: string; playerCount: number }>(`/api/rooms/${encodeURIComponent(code)}`),
  testQuestion: (question: Question, pluginId: string, code: string) =>
    call<{ evaluation: ChecklistEvaluationResult; warnings: AuthoringWarning[] }>('/api/questions/test', {
      method: 'POST',
      body: JSON.stringify({ question, pluginId, code }),
    }),
};
