import type { FastifyInstance } from 'fastify';
import {
  buildCapabilityMap,
  evaluateChecklist,
  lintQuestion,
  recoveryQuestions,
  type RoomManager,
} from '@codearena/core';
import type { PluginRegistry, QuizPlugin } from '@codearena/plugin-sdk';
import {
  EvaluationUpdateSchema,
  MAX_CODE_LENGTH,
  parseQuestion,
  TeacherKeySchema,
  toPublicQuestion,
  type ActiveRoomSummary,
} from '@codearena/schemas';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { parseSessionImport } from './historyImport';
import { HistoryError, hashTeacherKey, type HistoryStore } from './historyStore';
import { PackStoreError, PackValidationError, type PackStore } from './packStore';

/** Cabeçalho com a chave do professor, guardada no navegador dele. */
export const TEACHER_KEY_HEADER = 'x-teacher-key';

export function registerHttpRoutes(
  app: FastifyInstance,
  deps: {
    packs: PackStore;
    plugins: PluginRegistry<QuizPlugin<any>>;
    rooms: RoomManager;
    history: HistoryStore;
    /** Salas abertas do professor (dono = hash da chave). */
    activeRooms: (owner: string) => ActiveRoomSummary[];
  },
): void {
  const { packs, plugins, rooms, history, activeRooms } = deps;

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof PackValidationError) {
      return reply.status(422).send({ error: 'Pack inválido', issues: error.issues });
    }
    if (error instanceof PackStoreError || error instanceof HistoryError) {
      return reply.status(error.status).send({ error: error.message });
    }
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

  /* Histórico: cada professor vê só as sessões criadas com a chave dele. */
  const ownerOf = (request: FastifyRequest): string => {
    const key = TeacherKeySchema.safeParse(request.headers[TEACHER_KEY_HEADER]);
    if (!key.success) throw new HistoryError(401, 'Chave do professor ausente ou inválida');
    return hashTeacherKey(key.data);
  };

  app.get('/api/history', async (request) => history.list(ownerOf(request)));

  // Salas ainda abertas: o professor volta a elas mesmo depois de sair da tela (ex.: o servidor caiu no meio da aula).
  app.get('/api/history/active', async (request) => activeRooms(ownerOf(request)));

  app.get<{ Params: { id: string } }>('/api/history/:id', async (request) => history.get(request.params.id, ownerOf(request)));

  // A sessão inteira, com o código dos alunos, pode passar do limite padrão do corpo.
  app.post('/api/history/import', { bodyLimit: 32 * 1024 * 1024 }, async (request, reply) => {
    const owner = ownerOf(request);
    const parsed = parseSessionImport(request.body);
    if (!parsed.ok) return reply.status(400).send({ error: parsed.error });
    return reply.status(201).send(await history.importRecord(parsed.record, owner));
  });

  app.put<{ Params: { id: string } }>('/api/history/:id/evaluations', async (request, reply) => {
    const owner = ownerOf(request);
    const body = EvaluationUpdateSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: body.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
    }
    return history.updateEvaluations(request.params.id, owner, body.data.entries);
  });

  /* Capacidades: as atividades avaliadas do professor, juntas por aluno e por capacidade. */
  const assessments = async (owner: string, ids?: string[]) => {
    const own = history.list(owner).filter((summary) => summary.mode === 'assessment');
    const chosen = ids ? own.filter((summary) => ids.includes(summary.id)) : own;
    return Promise.all(chosen.map((summary) => history.get(summary.id, owner)));
  };
  const SessionIdsSchema = z.array(z.string().min(1).max(80)).max(100);

  app.get<{ Querystring: { sessions?: string } }>('/api/capabilities', async (request, reply) => {
    const owner = ownerOf(request);
    const ids = request.query.sessions ? SessionIdsSchema.safeParse(request.query.sessions.split(',')) : null;
    if (ids && !ids.success) return reply.status(400).send({ error: 'Lista de atividades inválida' });
    return buildCapabilityMap(await assessments(owner, ids?.data));
  });

  const RecoverySchema = z.object({
    sessions: SessionIdsSchema.min(1, 'Escolha pelo menos uma atividade'),
    capabilities: z.array(z.string().min(1).max(200)).min(1, 'Escolha pelo menos uma capacidade').max(100),
    title: z.string().trim().min(1).max(120).optional(),
    capabilityNames: z.array(z.string().trim().min(1).max(140)).max(100).optional(),
  });

  // Recuperação: um pack novo com as questões das capacidades escolhidas, pronto para abrir como atividade.
  app.post('/api/capabilities/recovery', async (request, reply) => {
    const owner = ownerOf(request);
    const body = RecoverySchema.safeParse(request.body);
    if (!body.success) return reply.status(400).send({ error: body.error.issues.map((i) => i.message).join('; ') });
    const questions = recoveryQuestions(await assessments(owner, body.data.sessions), body.data.capabilities);
    if (questions.length === 0) return reply.status(422).send({ error: 'Nenhuma questão dessas atividades avalia essas capacidades' });
    const names = body.data.capabilityNames?.join(', ');
    const stored = await packs.create({
      pack: {
        title: body.data.title ?? `Recuperação${names ? `: ${names}` : ''}`.slice(0, 120),
        description: `Recuperação gerada pelo mapa de capacidades${names ? ` (${names})` : ''}.`.slice(0, 500),
        pluginId: questions[0]!.pluginId,
        version: '1.0.0',
        tags: ['recuperacao'],
      },
      questions: questions.slice(0, 100),
    });
    return reply.status(201).send(stored);
  });

  app.delete<{ Params: { id: string } }>('/api/history/:id', async (request, reply) => {
    await history.delete(request.params.id, ownerOf(request));
    return reply.status(204).send();
  });

  app.get<{ Params: { code: string } }>('/api/rooms/:code', async (request, reply) => {
    const room = rooms.get(request.params.code);
    if (!room) return reply.status(404).send({ error: 'Sala não encontrada' });
    const snapshot = room.snapshotForHost();
    return {
      code: room.code,
      phase: snapshot.phase,
      packTitle: snapshot.packTitle,
      playerCount: snapshot.playerCount,
      mode: snapshot.settings.mode,
    };
  });
}
