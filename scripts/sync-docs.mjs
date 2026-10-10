/**
 * Gera páginas do site a partir das fontes de verdade (arquivos gerados não são versionados):
 * - docs/contribuindo.md a partir de CONTRIBUTING.md, ajustando os links relativos à raiz;
 * - docs/agents/plugin-<id>.md a partir do docs/agents.md de cada plugin ativo em codearena.config.json.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { resolveHostPlugins } from '@codearena/plugin-host';

const root = resolve(import.meta.dirname, '..');
const repo = 'https://github.com/Gabrielll04/CodeArena/blob/HEAD';

let text = await readFile(resolve(root, 'CONTRIBUTING.md'), 'utf8');
text = text
  .replace(/\]\(docs\//g, '](./')
  .replace(/\]\((LICENSE|CODE_OF_CONDUCT\.md|SECURITY\.md|AGENTS\.md)\)/g, `](${repo}/$1)`);

const header = '---\neditLink: false\n---\n\n<!-- Gerado por scripts/sync-docs.mjs a partir de CONTRIBUTING.md. Não edite este arquivo. -->\n\n';
await writeFile(resolve(root, 'docs/contribuindo.md'), header + text, 'utf8');
console.log('docs/contribuindo.md atualizado');

const { plugins } = resolveHostPlugins({ rootDir: root });
for (const plugin of plugins) {
  const source = join(plugin.packageDir, 'docs', 'agents.md');
  if (!existsSync(source)) continue;
  const target = resolve(root, `docs/agents/plugin-${plugin.manifest.pluginId}.md`);
  const note = `---\neditLink: false\n---\n\n<!-- Gerado por scripts/sync-docs.mjs a partir de ${plugin.packageName}/docs/agents.md. Não edite este arquivo. -->\n\n`;
  // Os guias dos plugins apontam para as imagens do repositório principal; no site, usa a cópia local.
  const text = (await readFile(source, 'utf8')).replaceAll('https://raw.githubusercontent.com/Gabrielll04/CodeArena/HEAD/docs/images/', '../images/');
  await writeFile(target, note + text, 'utf8');
  console.log(`docs/agents/plugin-${plugin.manifest.pluginId}.md atualizado`);
}
