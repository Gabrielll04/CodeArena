import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');

export interface ServerConfig {
  port: number;
  host: string;
  /** Packs criados/importados pelos professores. */
  dataDir: string;
  /** Raiz da instalação: onde ficam codearena.config.json e os pacotes de plugin instalados. */
  rootDir: string;
  /** Lista de plugins ativos (padrão: <rootDir>/codearena.config.json). */
  pluginConfigPath: string;
  /** Packs de exemplo (somente leitura). */
  contentDir: string;
  /** Build do frontend servido em produção (opcional). */
  webDist: string | null;
  logger: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const production = env.NODE_ENV === 'production';
  return {
    port: Number(env.PORT ?? (production ? 3000 : 3001)),
    host: env.HOST ?? '0.0.0.0',
    rootDir: repoRoot,
    pluginConfigPath: resolve(env.CODEARENA_CONFIG ?? resolve(repoRoot, 'codearena.config.json')),
    dataDir: resolve(env.CODEARENA_DATA_DIR ?? resolve(repoRoot, 'data')),
    contentDir: resolve(env.CODEARENA_CONTENT_DIR ?? resolve(repoRoot, 'content/packs')),
    webDist: production ? resolve(env.CODEARENA_WEB_DIST ?? resolve(repoRoot, 'apps/web/dist')) : null,
    logger: env.CODEARENA_LOG !== 'silent',
  };
}
