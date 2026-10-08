import { networkInterfaces } from 'node:os';
import { buildServer } from './app';
import { loadConfig } from './config';

const config = loadConfig();
const { app } = await buildServer(config);
await app.listen({ port: config.port, host: config.host });

const addresses = Object.values(networkInterfaces())
  .flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal)
  .map((i) => `http://${i!.address}:${config.port}`);
app.log.info(`CodeArena ouvindo em http://localhost:${config.port}${addresses.length ? ` e ${addresses.join(', ')}` : ''}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}
