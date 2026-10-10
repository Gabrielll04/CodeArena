import { defineConfig } from 'tsup';

/** No pacote publicado o worker é `dist/backend.worker.js`; no código-fonte, `backend.worker.ts`. */
const workerUrl = {
  name: 'worker-url',
  setup(build: { onLoad: Function }) {
    build.onLoad({ filter: /workerExecutor\.ts$/ }, async (args: { path: string }) => {
      const { readFile } = await import('node:fs/promises');
      const source = await readFile(args.path, 'utf8');
      return { contents: source.replace("'./backend.worker.ts'", "'./backend.worker.js'"), loader: 'ts' };
    });
  },
};

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    server: 'src/server/index.ts',
    ui: 'src/ui/index.tsx',
    'backend.worker': 'src/ui/backend.worker.ts',
  },
  format: ['esm'],
  dts: { entry: { index: 'src/index.ts', server: 'src/server/index.ts', ui: 'src/ui/index.tsx' } },
  clean: true,
  sourcemap: true,
  target: 'es2022',
  esbuildPlugins: [workerUrl as never],
});
