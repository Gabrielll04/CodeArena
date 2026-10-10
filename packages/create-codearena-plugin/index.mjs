#!/usr/bin/env node
/**
 * Cria um plugin do CodeArena num repositório novo.
 *
 *   npm create @codearena/plugin@latest [pasta] -- --id eletrica --name "Circuitos elétricos"
 *
 * Sem --id ou --name, pergunta no terminal. Com --yes, usa os valores padrão.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TEMPLATE = join(dirname(fileURLToPath(import.meta.url)), 'template');
const OWN_VERSION = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')).version;
const PLUGIN_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Arquivos que o npm não publica com o nome original. */
const RENAMES = { _gitignore: '.gitignore' };

export function parseArgs(argv) {
  const options = { dir: undefined, id: undefined, name: undefined, author: undefined, yes: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--yes' || arg === '-y') options.yes = true;
    else if (arg === '--id') options.id = argv[++i];
    else if (arg === '--name') options.name = argv[++i];
    else if (arg === '--author') options.author = argv[++i];
    else if (!arg.startsWith('-') && !options.dir) options.dir = arg;
    else throw new Error(`Opção desconhecida: ${arg}`);
  }
  return options;
}

function titleFromId(id) {
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function listFiles(dir, base = dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? listFiles(full, base) : [relative(base, full)];
  });
}

/**
 * Gera o plugin. Devolve a pasta criada.
 * @param {{ dir: string; id: string; name: string; author?: string; sdkRange?: string }} options
 */
export function createPlugin(options) {
  if (!PLUGIN_ID.test(options.id)) throw new Error(`id inválido: "${options.id}". Use letras minúsculas, números e "-" (ex.: eletrica).`);
  const target = resolve(options.dir);
  if (existsSync(target) && readdirSync(target).length) throw new Error(`A pasta ${target} já existe e não está vazia.`);

  const values = {
    id: options.id,
    name: options.name,
    package: `codearena-plugin-${options.id}`,
    dir: basename(target),
    author: options.author ?? '',
    year: String(new Date().getFullYear()),
    sdkRange: options.sdkRange ?? `^${OWN_VERSION}`,
  };
  const fill = (text) => text.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in values ? values[key] : match));

  for (const file of listFiles(TEMPLATE)) {
    const parts = file.split(/[\\/]/).map((part) => RENAMES[part] ?? fill(part));
    const destination = join(target, ...parts);
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, fill(readFileSync(join(TEMPLATE, file), 'utf8')));
  }
  return target;
}

async function main(argv) {
  const options = parseArgs(argv);
  if (!options.yes && (!options.id || !options.name || !options.dir)) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    options.id ??= (await rl.question('Id do plugin (ex.: eletrica): ')).trim();
    options.name ??= (await rl.question(`Nome exibido (${titleFromId(options.id)}): `)).trim() || titleFromId(options.id);
    options.dir ??= (await rl.question(`Pasta (codearena-plugin-${options.id}): `)).trim() || `codearena-plugin-${options.id}`;
    rl.close();
  }
  if (!options.id) throw new Error('Informe o id do plugin com --id.');
  options.name ??= titleFromId(options.id);
  options.dir ??= `codearena-plugin-${options.id}`;

  const target = createPlugin(options);
  const shown = relative(process.cwd(), target) || '.';
  console.log(`
Plugin "${options.name}" criado em ${shown}.

Próximos passos:
  cd ${shown}
  npm install
  npm test
  npm run dev

Para testar numa instalação do CodeArena (na pasta do CodeArena):
  pnpm codearena plugins add ${relative(process.cwd(), target) ? `../${basename(target)}` : target}

Guia: https://github.com/Gabrielll04/CodeArena/blob/HEAD/docs/plugins/creating-a-plugin.md`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
