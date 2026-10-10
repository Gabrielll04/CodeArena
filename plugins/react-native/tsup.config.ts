import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', ui: 'src/ui/index.tsx', sandbox: 'src/sandbox/runtime.tsx' },
  format: ['esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'es2022',
});
