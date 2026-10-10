import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { codearenaPlugins } from '@codearena/plugin-host/vite';

const API_TARGET = process.env.CODEARENA_API ?? 'http://localhost:3001';

export default defineConfig({
  // Só os plugins de codearena.config.json entram no build, e cada um é carregado sob demanda.
  plugins: [codearenaPlugins({ rootDir: resolve(__dirname, '../..'), htmlEntries: ['index.html', 'sandbox.html'] }), react()],
  server: {
    port: 5173,
    host: true,
    // O iframe do preview tem origem opaca (sandbox sem allow-same-origin) e carrega módulos via CORS.
    cors: { origin: '*' },
    proxy: {
      '/api': API_TARGET,
      '/socket.io': { target: API_TARGET, ws: true },
    },
  },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        sandbox: resolve(__dirname, 'sandbox.html'),
      },
    },
  },
});
