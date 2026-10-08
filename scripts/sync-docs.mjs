/**
 * Gera docs/contribuindo.md a partir de CONTRIBUTING.md (a fonte de verdade), ajustando os links
 * relativos à raiz do repositório para funcionarem dentro do site. O arquivo gerado não é versionado.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const repo = 'https://github.com/Gabrielll04/kahoot-ti/blob/main';

let text = await readFile(resolve(root, 'CONTRIBUTING.md'), 'utf8');
text = text
  .replace(/\]\(docs\//g, '](./')
  .replace(/\]\((LICENSE|CODE_OF_CONDUCT\.md|SECURITY\.md|AGENTS\.md)\)/g, `](${repo}/$1)`);

const header = '---\neditLink: false\n---\n\n<!-- Gerado por scripts/sync-docs.mjs a partir de CONTRIBUTING.md. Não edite este arquivo. -->\n\n';
await writeFile(resolve(root, 'docs/contribuindo.md'), header + text, 'utf8');
console.log('docs/contribuindo.md atualizado');
