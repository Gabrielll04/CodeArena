/**
 * Leva um plugin oficial de plugins/<id> para um repositório próprio (etapa 4 da migração).
 *
 *   node scripts/extract-plugin.mjs split <id> [--remote <url-do-repositório>]
 *     Cria o branch extract/<id> só com a pasta do plugin (com o histórico dela; só usa comandos básicos do git),
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

/**
 * Recria o histórico da pasta como um repositório próprio (equivalente a `git subtree split`, que nem toda
 * instalação do git tem): cada commit que mudou a pasta (em ordem topológica) vira um commit com a pasta na raiz,
 * mesmo autor, data e mensagem.
 */
function splitHistory(folder) {
  const source = git(['rev-list', '--reverse', '--topo-order', 'HEAD', '--', folder]).split('\n').filter(Boolean);
  const created = [];
  let previousTree = null;
  for (const commit of source) {
    let tree;
    try {
      tree = git(['rev-parse', `${commit}:${folder}`]);
    } catch {
      continue; // a pasta não existe neste commit (ex.: foi removida)
    }
    if (tree === previousTree) continue;
    const [authorName, authorEmail, authorDate, committerName, committerEmail, committerDate] = git([
      'show', '-s', '--format=%an%n%ae%n%aI%n%cn%n%ce%n%cI', commit,
    ]).split('\n');
    const message = git(['show', '-s', '--format=%B', commit]);
    const parent = created.at(-1);
    const newCommit = execFileSync('git', ['commit-tree', tree, ...(parent ? ['-p', parent] : [])], {
      cwd: root,
      input: `${message}\n`,
      encoding: 'utf8',
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: authorName, GIT_AUTHOR_EMAIL: authorEmail, GIT_AUTHOR_DATE: authorDate,
        GIT_COMMITTER_NAME: committerName, GIT_COMMITTER_EMAIL: committerEmail, GIT_COMMITTER_DATE: committerDate,
      },
    }).trim();
    created.push(newCommit);
    previousTree = tree;
  }
  if (!created.length) fail(`Nenhum commit encontrado para ${folder}.`);
  return created;
}

if (command === 'split') {
  if (!existsSync(pluginDir)) fail(`${prefix} não existe.`);
  if (git(['status', '--porcelain', prefix])) fail(`Há alterações não commitadas em ${prefix}. Faça commit antes.`);
  const branch = `extract/${id}`;
  console.log(`Separando ${prefix} com o histórico...`);
  const commits = splitHistory(prefix);
  git(['branch', '-f', branch, commits.at(-1)]);
  console.log(`${commits.length} commits com mudanças em ${prefix}.`);

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
