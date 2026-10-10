/**
 * Leva um plugin oficial de plugins/<id> para um repositório próprio (etapa 4 da migração).
 *
 *   node scripts/extract-plugin.mjs split <id> [--remote <url-do-repositório>]
 *     Cria o branch extract/<id> só com a pasta do plugin (com o histórico dela, via git subtree),
 *     ajusta o package.json para fora do monorepo e, com --remote, envia como "main" do repositório novo.
 *
 *   node scripts/extract-plugin.mjs adopt <id>
 *     Depois que o plugin estiver publicado no npm: remove plugins/<id> do núcleo e passa a instalar a versão
 *     publicada (dependência da raiz), como qualquer instalação faria.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const [command, id, ...rest] = process.argv.slice(2);
const remote = rest.includes('--remote') ? rest[rest.indexOf('--remote') + 1] : undefined;
const git = (args, cwd = root) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }).trim();
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!['split', 'adopt'].includes(command) || !id) {
  fail('Uso: node scripts/extract-plugin.mjs split <id> [--remote <url>] | adopt <id>');
}
const prefix = `plugins/${id}`;
const pluginDir = join(root, prefix);

/** Versões publicadas dos pacotes do núcleo (usadas no lugar de "workspace:"). */
function coreVersions() {
  return Object.fromEntries(
    ['schemas', 'plugin-sdk', 'core', 'plugin-host'].map((name) => [`@codearena/${name}`, readJson(join(root, 'packages', name, 'package.json')).version]),
  );
}

if (command === 'split') {
  if (!existsSync(pluginDir)) fail(`${prefix} não existe.`);
  if (git(['status', '--porcelain', prefix])) fail(`Há alterações não commitadas em ${prefix}. Faça commit antes.`);
  const branch = `extract/${id}`;
  try {
    git(['branch', '-D', branch]);
  } catch {
    // branch ainda não existia
  }
  console.log(`Separando ${prefix} com o histórico (git subtree split)...`);
  run('git', ['subtree', 'split', `--prefix=${prefix}`, '-b', branch]);

  // Ajustes para o repositório próprio, num worktree temporário do branch novo.
  const worktree = mkdtempSync(join(tmpdir(), `codearena-extract-${id}-`));
  rmSync(worktree, { recursive: true });
  git(['worktree', 'add', worktree, branch]);
  try {
    const file = join(worktree, 'package.json');
    const pkg = readJson(file);
    const versions = coreVersions();
    for (const field of ['dependencies', 'devDependencies']) {
      for (const [name, range] of Object.entries(pkg[field] ?? {})) {
        if (String(range).startsWith('workspace:')) pkg[field][name] = `^${versions[name]}`;
      }
    }
    if (remote) {
      const url = remote.replace(/\.git$/, '');
      pkg.repository = { type: 'git', url: `git+${url}.git` };
      pkg.homepage = `${url}#readme`;
      pkg.bugs = `${url}/issues`;
    } else {
      delete pkg.repository?.directory;
    }
    writeJson(file, pkg);
    git(['add', 'package.json'], worktree);
    git(['commit', '-m', 'Prepare standalone repository', '-m', 'Dependencies on the CodeArena core now use the published versions.'], worktree);
    if (remote) {
      console.log(`Enviando para ${remote} (branch main)...`);
      run('git', ['push', remote, `${branch}:main`]);
    }
  } finally {
    git(['worktree', 'remove', '--force', worktree]);
  }
  console.log(`
Branch ${branch} pronto${remote ? ` e enviado para ${remote}` : ''}.
Próximos passos:
  1. ${remote ? '' : `Crie o repositório e envie: git push <url> ${branch}:main\n  2. `}No repositório novo: pnpm install && pnpm test && pnpm build, e publique (npm publish --access public).
  ${remote ? 2 : 3}. Aqui: node scripts/extract-plugin.mjs adopt ${id}`);
}

if (command === 'adopt') {
  if (!existsSync(pluginDir)) fail(`${prefix} não existe (já foi adotado?).`);
  const pkg = readJson(join(pluginDir, 'package.json'));
  const published = (() => {
    try {
      return execFileSync('npm', ['view', `${pkg.name}@${pkg.version}`, 'version'], { encoding: 'utf8' }).trim();
    } catch {
      return '';
    }
  })();
  if (!published) fail(`${pkg.name}@${pkg.version} ainda não está no npm. Publique o plugin antes de adotar.`);

  const rootPkgFile = join(root, 'package.json');
  const rootPkg = readJson(rootPkgFile);
  rootPkg.dependencies[pkg.name] = `^${pkg.version}`;
  writeJson(rootPkgFile, rootPkg);
  rmSync(pluginDir, { recursive: true });
  run('pnpm', ['install']);
  console.log(`
${pkg.name} agora vem do npm. Rode pnpm typecheck, pnpm test e pnpm test:e2e e faça commit.
Atualize os links da documentação que apontam para ${prefix}/.`);
}
