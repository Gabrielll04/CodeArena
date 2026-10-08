/**
 * Valida question packs (schema Zod + qualidade da checklist) usando os mesmos plugins do servidor.
 * Uso: pnpm validate:packs [arquivo.json ...]   (padrão: content/packs/*.json)
 * Sai com código 1 se algum pack tiver erro.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { lintQuestion } from '@codearena/core';
import { parseQuestionPackJson, resolveQuestions } from '@codearena/schemas';
import { createServerPluginRegistry } from '../apps/server/src/plugins';

const root = resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const files = args.length
  ? args.map((f) => resolve(f))
  : (await readdir(join(root, 'content/packs'))).filter((f) => f.endsWith('.json')).map((f) => join(root, 'content/packs', f));

const plugins = createServerPluginRegistry();
let failed = false;

for (const file of files) {
  const parsed = parseQuestionPackJson(await readFile(file, 'utf8'));
  console.log(`\n${file}`);
  if (!parsed.ok) {
    failed = true;
    parsed.issues.forEach((issue) => console.log(`  ERRO   ${issue.path}: ${issue.message}`));
    continue;
  }
  for (const question of resolveQuestions(parsed.value)) {
    const plugin = plugins.get(question.pluginId);
    if (!plugin) {
      failed = true;
      console.log(`  ERRO   ${question.id}: plugin "${question.pluginId}" não instalado`);
      continue;
    }
    const warnings = await lintQuestion(question, plugin);
    if (!warnings.some((w) => w.level !== 'info')) console.log(`  ok     ${question.id}`);
    for (const w of warnings) {
      if (w.level === 'error') failed = true;
      const tag = w.level === 'error' ? 'ERRO ' : w.level === 'warning' ? 'AVISO' : 'INFO ';
      console.log(`  ${tag}  ${question.id}${w.itemId ? `/${w.itemId}` : ''}: ${w.message}`);
    }
  }
}

process.exit(failed ? 1 : 0);
