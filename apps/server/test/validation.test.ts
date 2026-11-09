import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { QuestionSchema } from '@codearena/schemas';
import { loadServerPlugins } from '../src/plugins';
import { createSubmissionValidator } from '../src/validation';

const repoRoot = resolve(import.meta.dirname, '../../..');

// Itens só de texto: antes, código quebrado que contivesse os trechos era aceito.
const question = {
  ...QuestionSchema.parse({
    id: 'texto',
    prompt: 'Mostre "Olá" num Text.',
    timeLimitSeconds: 60,
    baseXP: 100,
    speedBonusMax: 100,
    checklist: [
      { id: 'text', label: 'Utilizar o componente Text', rule: { type: 'regex', pattern: '<Text\\b', flags: 'i' } },
      { id: 'ola', label: 'Mostrar "Olá"', rule: { type: 'contains', value: 'Olá' } },
    ],
  }),
  pluginId: 'react-native',
};

describe('validação oficial: sintaxe', () => {
  it('recusa código com erro de sintaxe mesmo quando os trechos de texto aparecem', async () => {
    const { registry } = await loadServerPlugins({ rootDir: repoRoot });
    const validate = createSubmissionValidator(registry);

    const broken = await validate('export default function App() { return <text>Olá }', question);
    expect(broken.passed).toBe(false);
    expect(broken.message).toMatch(/^Erro de sintaxe na linha 1/);
    expect(broken.items.every((item) => !item.passed)).toBe(true);

    const valid = await validate('export default function App() { return <Text>Olá</Text>; }', question);
    expect(valid.passed).toBe(true);
  });
});
