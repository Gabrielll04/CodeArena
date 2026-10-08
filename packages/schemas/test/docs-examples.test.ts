import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseQuestion, parseQuestionPack } from '../src';

/**
 * Garante que os exemplos JSON da documentação para agentes continuam válidos.
 * Blocos com "pack" são validados como pack; blocos com "prompt" e "checklist", como questão.
 * Blocos marcados como exemplos de erro (sem "pack"/"prompt") são ignorados.
 */
const docsDir = resolve(__dirname, '../../../docs/agents');
const blocks = readdirSync(docsDir)
  .filter((f) => f.endsWith('.md'))
  .flatMap((file) =>
    [...readFileSync(resolve(docsDir, file), 'utf8').matchAll(/```json\n([\s\S]*?)```/g)].map((m, i) => ({
      name: `${file} #${i + 1}`,
      text: m[1]!,
    })),
  );

describe('exemplos JSON da documentação', () => {
  it('encontra exemplos para validar', () => {
    expect(blocks.length).toBeGreaterThan(5);
  });

  for (const block of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(block.text);
    } catch {
      continue; // fragmentos ilustrativos com várias formas de regra
    }
    const skeleton = data && typeof data === 'object' && 'questions' in data && Array.isArray(data.questions) && data.questions.length === 0;
    if (skeleton) continue; // esqueleto ilustrativo da estrutura
    if (data && typeof data === 'object' && 'pack' in data) {
      it(`${block.name} é um pack válido`, () => {
        const result = parseQuestionPack(data);
        expect(result.ok ? [] : result.issues).toEqual([]);
      });
    } else if (data && typeof data === 'object' && 'prompt' in data && 'checklist' in data) {
      it(`${block.name} é uma questão válida`, () => {
        const result = parseQuestion(data);
        expect(result.ok ? [] : result.issues).toEqual([]);
      });
    }
  }
});
