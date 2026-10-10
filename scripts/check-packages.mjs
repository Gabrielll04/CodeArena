/**
 * Confere se os pacotes publicáveis funcionam fora do monorepo:
 * build, `pnpm pack`, instalação num projeto vazio, typecheck (NodeNext, sem skipLibCheck) e execução de um plugin de teste.
 * Uso: pnpm check:packages
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packages = ['schemas', 'plugin-sdk', 'core', 'plugin-host'];
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
  const files = readdirSync(tarballs).map((f) => join(tarballs, f));
  run('npm', ['install', '--no-audit', '--no-fund', ...files, 'zod@3', 'react@18', '@types/react@18', 'typescript@5'], consumer);
  const tsc = ['tsc', '--strict', '--target', 'es2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--lib', 'es2022,dom', '--types', 'react'];
  run('npx', [...tsc, '--outDir', 'out', 'src/plugin.ts'], consumer);
  run('node', ['out/plugin.js'], consumer);
  run('node', ['host.mjs'], consumer);
  console.log('\nPacotes prontos para publicar.');
} finally {
  rmSync(work, { recursive: true, force: true });
}
