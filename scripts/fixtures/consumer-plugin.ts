/**
 * Plugin de terceiro mínimo, compilado contra os pacotes empacotados (ver scripts/check-packages.mjs).
 * Garante que tipos e código publicados funcionam fora do monorepo.
 */
import { z } from 'zod';
import { definePlugin, escapeRegExp, type PluginEntry, type QuizPlugin } from '@codearena/plugin-sdk';
import type { ClientPluginEntry, ClientQuizPlugin } from '@codearena/plugin-sdk/ui';
import { evaluateChecklist, calculateXP } from '@codearena/core';
import { QuestionSchema, toPublicQuestion } from '@codearena/schemas';

export const plugin = definePlugin<QuizPlugin>({
  id: 'python-basico',
  displayName: 'Python básico',
  description: 'teste',
  version: '1.0.0',
  editorLanguage: 'python',
  getStarterCode: (q) => q.starterCode,
  validators: {
    pythonDefinesFunction: {
      description: 'Define função',
      mode: 'static',
      params: z.object({ name: z.string() }),
      validate: ({ code, params }) => new RegExp(`^def\\s+${escapeRegExp(params.name)}\\(`, 'm').test(code),
    },
  },
});
const entry: PluginEntry = plugin;
const ui: ClientPluginEntry = (_opts) => ({ ...plugin } satisfies ClientQuizPlugin);
void entry; void ui;

const question = QuestionSchema.parse({
  id: 'somar', prompt: 'x', timeLimitSeconds: 60, baseXP: 100, speedBonusMax: 100, solution: 'def somar(a, b):\n  return a+b',
  checklist: [{ id: 'def', label: 'Definir somar', rule: { type: 'pluginRule', validator: 'pythonDefinesFunction', params: { name: 'somar' } } }],
});
const result = await evaluateChecklist('def somar(a, b):\n  return a+b', { ...toPublicQuestion({ ...question, pluginId: 'python-basico' }) }, { plugin });
const xp = calculateXP({ baseXP: 100, speedBonusMax: 100, remainingMs: 30000, timeLimitMs: 60000 });
if (!result.allRequiredDone || xp.total !== 150) throw new Error(`resultado inesperado: ${JSON.stringify({ result, xp })}`);
console.log('plugin de teste ok');
