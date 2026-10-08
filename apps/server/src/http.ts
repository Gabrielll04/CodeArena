import type { FastifyInstance } from 'fastify';
import { evaluateChecklist, lintQuestion, type RoomManager } from '@codearena/core';
import type { PluginRegistry, QuizPlugin } from '@codearena/plugin-sdk';
import { MAX_CODE_LENGTH, parseQuestion, toPublicQuestion } from '@codearena/schemas';
import { z } from 'zod';
import { PackStoreError, PackValidationError, type PackStore } from './packStore';

export function registerHttpRoutes(
  app: FastifyInstance,
  deps: { packs: PackStore; plugins: PluginRegistry<QuizPlugin<any>>; rooms: RoomManager },
): void {
  const { packs, plugins, rooms } = deps;

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof PackValidationError) {
      return reply.status(422).send({ error: 'Pack inválido', issues: error.issues });
    }
    if (error instanceof PackStoreError) return reply.status(error.status).send({ error: error.message });
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(error);
    return reply.status(status).send({ error: status >= 500 ? 'Erro interno' : (error as Error).message });
  });

  app.get('/api/health', async () => ({ status: 'ok' }));

  app.get('/api/plugins', async () =>
    plugins.list().map((plugin) => ({
      id: plugin.id,
      displayName: plugin.displayName,
      description: plugin.description,
      version: plugin.version,
      validators: Object.entries(plugin.validators ?? {}).map(([name, v]) => ({
        name,
        description: v.description,
        mode: v.mode,
        exampleParams: v.exampleParams ?? {},
      })),
    })),
  );

  app.get('/api/packs', async () => packs.list());

  app.get<{ Params: { id: string } }>('/api/packs/:id', async (request, reply) => {
    const stored = packs.get(request.params.id);
    if (!stored) return reply.status(404).send({ error: 'Pack não encontrado' });
    return stored;
  });

  app.get<{ Params: { id: string } }>('/api/packs/:id/export', async (request, reply) => {
    const stored = packs.get(request.params.id);
    if (!stored) return reply.status(404).send({ error: 'Pack não encontrado' });
    return reply
      .header('content-disposition', `attachment; filename="${stored.id}.json"`)
      .type('application/json')
      .send(JSON.stringify(stored.pack, null, 2));
  });

  app.post('/api/packs', async (request, reply) => {
    const stored = await packs.create(request.body);
    return reply.status(201).send(stored);
  });

  app.put<{ Params: { id: string } }>('/api/packs/:id', async (request) => packs.update(request.params.id, request.body));

  app.delete<{ Params: { id: string } }>('/api/packs/:id', async (request, reply) => {
    await packs.delete(request.params.id);
    return reply.status(204).send();
  });

  /** Testa uma questão no servidor (mesma validação usada nas salas) e devolve avisos de autoria. */
  const TestBody = z.object({ question: z.unknown(), pluginId: z.string(), code: z.string().max(MAX_CODE_LENGTH) });
  app.post('/api/questions/test', async (request, reply) => {
    const body = TestBody.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: 'Requisição inválida' });
    const question = parseQuestion(body.data.question);
    if (!question.ok) return reply.status(422).send({ error: 'Questão inválida', issues: question.issues });
    const pluginId = question.value.pluginId ?? body.data.pluginId;
    const plugin = plugins.get(pluginId);
    if (!plugin) return reply.status(422).send({ error: `Plugin "${pluginId}" não está instalado no servidor` });
    const resolved = { ...question.value, pluginId };
    const [evaluation, warnings] = await Promise.all([
      evaluateChecklist(body.data.code, toPublicQuestion(resolved), { plugin }),
      lintQuestion(resolved, plugin),
    ]);
    return { evaluation, warnings };
  });

  app.get<{ Params: { code: string } }>('/api/rooms/:code', async (request, reply) => {
    const room = rooms.get(request.params.code);
    if (!room) return reply.status(404).send({ error: 'Sala não encontrada' });
    const snapshot = room.snapshotForHost();
    return { code: room.code, phase: snapshot.phase, packTitle: snapshot.packTitle, playerCount: snapshot.players.length };
  });
}
