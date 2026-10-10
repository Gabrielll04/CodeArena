import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lintQuestion } from '@codearena/core';
import { parseQuestionPack, resolveQuestions } from '@codearena/schemas';
import { plugin } from '../src';

const packageDir = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(resolve(packageDir, 'package.json'), 'utf8')).codearena as { pluginId: string; packs: string[] };

/** Os packs de exemplo (campo codearena.packs) precisam ser válidos e sem erros de autoria. */
describe('packs de exemplo', () => {
  for (const file of manifest.packs) {
    it(file, async () => {
      const parsed = parseQuestionPack(JSON.parse(readFileSync(resolve(packageDir, file), 'utf8')));
      expect(parsed.ok, JSON.stringify(!parsed.ok && parsed.issues)).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.value.pack.pluginId).toBe(manifest.pluginId);
      for (const question of resolveQuestions(parsed.value)) {
        const errors = (await lintQuestion(question, plugin)).filter((w) => w.level === 'error');
        expect(errors, `${question.id}: ${errors.map((e) => e.message).join('; ')}`).toEqual([]);
      }
    });
  }
});
