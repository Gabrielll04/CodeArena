/**
 * Confere se os pacotes publicáveis funcionam fora do monorepo:
 * build, `pnpm pack`, instalação num projeto vazio, typecheck (NodeNext, sem skipLibCheck) e execução de um plugin de teste.
 * Também gera um plugin com create-codearena-plugin e roda typecheck, testes e build dele contra os mesmos pacotes,
 * e confere que os pacotes dos plugins oficiais contêm tudo o que o manifesto e os exports apontam.
 * Uso: pnpm check:packages
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packages = ['schemas', 'plugin-sdk', 'core', 'plugin-host', 'create-codearena-plugin'];
const work = mkdtempSync(join(tmpdir(), 'codearena-packages-'));
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

try {
  run('pnpm', ['build:packages'], root);
  const tarballs = join(work, 'tarballs');
  for (const name of packages) run('pnpm', ['pack', '--pack-destination', tarballs], join(root, 'packages', name));

  const consumer = join(work, 'consumer');
  cpSync(join(root, 'scripts/fixtures/consumer-plugin.ts'), join(consumer, 'src/plugin.ts'));
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'consumer', private: true, type: 'module' }));
  writeFileSync(
    join(consumer, 'host.mjs'),
    [
      "import { installedSdkVersion, resolveHostPlugins } from '@codearena/plugin-host';",
      "import { codearenaPlugins } from '@codearena/plugin-host/vite';",
      "if (!installedSdkVersion(process.cwd()) || typeof codearenaPlugins !== 'function') throw new Error('plugin-host incompleto');",
      "resolveHostPlugins({ rootDir: process.cwd() });",
      "console.log('plugin-host ok');",
    ].join('\n'),
  );
  const tarball = (name) => join(tarballs, readdirSync(tarballs).find((f) => f.startsWith(name.replace('@', '').replace('/', '-') + '-')));
  const files = ['@codearena/schemas', '@codearena/plugin-sdk', '@codearena/core', '@codearena/plugin-host'].map(tarball);
  run('npm', ['install', '--no-audit', '--no-fund', ...files, 'zod@3', 'react@18', '@types/react@18', 'typescript@5'], consumer);
  const tsc = ['tsc', '--strict', '--target', 'es2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--lib', 'es2022,dom', '--types', 'react'];
  run('npx', [...tsc, '--outDir', 'out', 'src/plugin.ts'], consumer);
  run('node', ['out/plugin.js'], consumer);
  run('node', ['host.mjs'], consumer);

  // Plugin gerado pelo create-codearena-plugin, instalado contra os pacotes empacotados.
  const generated = join(work, 'codearena-plugin-demo');
  run('npm', ['exec', '--yes', `--package=${tarball('create-codearena-plugin')}`, '--', 'create-codearena-plugin', generated, '--id', 'demo', '--name', 'Demo', '--yes'], work);
  const manifestPath = join(generated, 'package.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const name of Object.keys(manifest.devDependencies)) {
    if (name.startsWith('@codearena/')) manifest.devDependencies[name] = `file:${tarball(name)}`;
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  run('npm', ['install', '--no-audit', '--no-fund'], generated);
  for (const script of ['typecheck', 'test', 'build']) run('npm', ['run', script], generated);
  writeFileSync(
    join(consumer, 'generated.mjs'),
    [
      "import { resolvePlugin, HOST_VERSION } from '@codearena/plugin-host';",
      `const p = resolvePlugin(${JSON.stringify(generated)}, { rootDir: process.cwd(), sdkVersion: HOST_VERSION });`,
      "if (!p.entries.ui || p.packs.length !== 1) throw new Error('manifesto do plugin gerado incompleto');",
      "const mod = await import(p.entries.main);",
      "if (mod.default.id !== 'demo') throw new Error('export default do plugin gerado inválido');",
      "console.log('plugin gerado ok');",
    ].join('\n'),
  );
  run('node', ['generated.mjs'], consumer);
  // Plugins oficiais: cada export publicado, pack de exemplo e guia para agentes precisa estar no tarball.
  for (const id of ['react-native', 'backend-http']) {
    const dir = join(root, 'plugins', id);
    run('pnpm', ['build'], dir);
    run('pnpm', ['pack', '--pack-destination', tarballs], dir);
    const file = tarball(`@codearena/plugin-${id}`);
    const listing = execFileSync('tar', ['-tzf', file], { encoding: 'utf8' }).split('\n');
    const pkg = JSON.parse(execFileSync('tar', ['-xzOf', file, 'package/package.json'], { encoding: 'utf8' }));
    const targets = Object.values(pkg.exports).flatMap((e) => Object.values(e));
    const required = [...targets, ...pkg.codearena.packs, './docs/agents.md'].map((f) => `package/${f.replace(/^\.\//, '')}`);
    const missing = required.filter((f) => !listing.includes(f));
    if (missing.length) throw new Error(`${pkg.name}: faltam no pacote ${missing.join(', ')}`);
    if (JSON.stringify(pkg).includes('workspace:')) throw new Error(`${pkg.name}: dependência workspace: no pacote publicado`);
    console.log(`${pkg.name} ok`);
  }

  console.log('\nPacotes prontos para publicar.');
} finally {
  rmSync(work, { recursive: true, force: true });
}
