import { describe, expect, it } from 'vitest';
import { evaluateChecklist } from '@codearena/core';
import { QuestionSchema, toPublicQuestion } from '@codearena/schemas';
import { plugin } from '../src';

const question = QuestionSchema.parse({
  id: 'exemplo',
  prompt: 'Escreva o resultado.',
  timeLimitSeconds: 60,
  baseXP: 100,
  speedBonusMax: 100,
  checklist: [
    { id: 'resultado', label: 'Escrever o resultado', rule: { type: 'pluginRule', validator: 'hasLineStartingWith', params: { prefix: 'R = ' } } },
  ],
});
const publicQuestion = toPublicQuestion({ ...question, pluginId: plugin.id });

describe('hasLineStartingWith', () => {
  it('conclui quando a linha existe', async () => {
    const result = await evaluateChecklist('calculo\nR = 42', publicQuestion, { plugin });
    expect(result.allRequiredDone).toBe(true);
  });

  it('explica o que falta', async () => {
    const result = await evaluateChecklist('calculo', publicQuestion, { plugin });
    // Validador estático incompleto fica "pending" (ainda não feito), com a mensagem para o aluno.
    expect(result.items[0]).toMatchObject({ status: 'pending', message: expect.stringMatching(/encontrado 0/) });
  });
});
