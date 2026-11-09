import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Room, SubmissionValidator } from '@codearena/core';
import {
  isManualItem,
  type AnswerEvaluation,
  type EvaluationEntry,
  type SessionHistory,
  type SessionHistorySummary,
} from '@codearena/schemas';

/** Registro em disco: o histórico mais o hash da chave do professor dono dele. */
type StoredHistory = SessionHistory & { owner: string | null };

export class HistoryError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const ID_PATTERN = /^[0-9a-f-]{36}$/;
/** Validações simultâneas na verificação automática (código de aluno roda em processos isolados). */
const AUTO_CHECK_CONCURRENCY = 2;

export function hashTeacherKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Um aluno está avaliado quando todos os critérios de todas as questões têm marca. */
function evaluatedCount(record: SessionHistory): number {
  if (record.mode !== 'assessment') return 0;
  const byKey = new Map(record.evaluations.map((e) => [`${e.playerId}:${e.questionId}`, e]));
  return record.players.filter((player) =>
    record.questions.every((question) => {
      const evaluation = byKey.get(`${player.id}:${question.id}`);
      return evaluation && question.checklist.every((item) => evaluation.marks[item.id]);
    }),
  ).length;
}

function summarize(record: SessionHistory): SessionHistorySummary {
  return {
    id: record.id,
    mode: record.mode,
    roomCode: record.roomCode,
    packTitle: record.packTitle,
    startedAt: record.startedAt,
    endedAt: record.endedAt,
    playerCount: record.players.length,
    questionCount: record.questions.length,
    evaluatedCount: evaluatedCount(record),
  };
}

function withoutOwner({ owner: _owner, ...record }: StoredHistory): SessionHistory {
  return record;
}

/**
 * Histórico de sessões encerradas, um arquivo JSON por sessão em `<dataDir>/history`. Só o resumo fica em memória;
 * o registro completo (com o código dos alunos) é lido do disco quando o professor abre a sessão.
 */
export class HistoryStore {
  private readonly dir: string;
  private summaries = new Map<string, SessionHistorySummary & { owner: string | null }>();
  /** Escritas por sessão, em fila (nunca duas ao mesmo tempo no mesmo arquivo). */
  private queues = new Map<string, Promise<unknown>>();
  private closed = false;

  constructor(
    private readonly options: { dataDir: string; validator?: SubmissionValidator; log?: (message: string) => void },
  ) {
    this.dir = join(options.dataDir, 'history');
  }

  async init(): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    for (const file of (await readdir(this.dir)).filter((f) => f.endsWith('.json'))) {
      try {
        const record = JSON.parse(await readFile(join(this.dir, file), 'utf8')) as StoredHistory;
        if (!ID_PATTERN.test(record.id) || record.version !== 1) continue;
        this.summaries.set(record.id, { ...summarize(record), owner: record.owner });
        // Verificação interrompida (servidor reiniciado): retoma.
        if (record.autoCheck === 'pending') this.scheduleAutoCheck(record.id);
      } catch (err) {
        this.options.log?.(`Falha ao ler o histórico ${file}: ${(err as Error).message}`);
      }
    }
  }

  newId(): string {
    return randomUUID();
  }

  list(owner: string): SessionHistorySummary[] {
    return [...this.summaries.values()]
      .filter((summary) => summary.owner === owner)
      .map(({ owner: _owner, ...summary }) => summary)
      .sort((a, b) => b.endedAt - a.endedAt);
  }

  async get(id: string, owner: string): Promise<SessionHistory> {
    // Espera a escrita em andamento (a sessão pode ter acabado de terminar).
    await this.queues.get(id);
    return withoutOwner(await this.read(id, owner));
  }

  /** Guarda a sessão encerrada de uma sala. Atividades seguem para a verificação automática das respostas. */
  saveRoom(input: { id: string; owner: string | null; packId: string | null; room: Room }): Promise<void> {
    const snapshot = input.room.historySnapshot();
    if (!snapshot || snapshot.players.length === 0) return Promise.resolve();
    const record: StoredHistory = {
      ...snapshot,
      id: input.id,
      version: 1,
      packId: input.packId,
      evaluations: [],
      autoCheck: snapshot.mode === 'assessment' && this.options.validator ? 'pending' : 'none',
      owner: input.owner,
    };
    // Já aparece na lista; quem abrir antes de o arquivo ser gravado espera a escrita (ver read).
    this.summaries.set(record.id, { ...summarize(record), owner: record.owner });
    return this.enqueue(input.id, async () => {
      await this.write(record);
      if (record.autoCheck === 'pending') this.scheduleAutoCheck(record.id);
    });
  }

  /** Cria ou atualiza avaliações. Marcas null removem a avaliação do critério. */
  updateEvaluations(id: string, owner: string, entries: EvaluationEntry[]): Promise<SessionHistory> {
    return this.enqueue(id, async () => {
      const record = await this.read(id, owner);
      const questions = new Map(record.questions.map((q) => [q.id, q]));
      const players = new Set(record.players.map((p) => p.id));
      const now = Date.now();
      for (const entry of entries) {
        const question = questions.get(entry.questionId);
        if (!question || !players.has(entry.playerId)) {
          throw new HistoryError(422, `Aluno ou questão não encontrado nesta sessão: ${entry.playerId} / ${entry.questionId}`);
        }
        const criteria = new Set(question.checklist.map((i) => i.id));
        const unknown = Object.keys(entry.marks).find((itemId) => !criteria.has(itemId));
        if (unknown) throw new HistoryError(422, `Critério "${unknown}" não existe na questão "${question.id}"`);

        let evaluation = record.evaluations.find((e) => e.playerId === entry.playerId && e.questionId === entry.questionId);
        if (!evaluation) {
          evaluation = { playerId: entry.playerId, questionId: entry.questionId, marks: {}, updatedAt: now } satisfies AnswerEvaluation;
          record.evaluations.push(evaluation);
        }
        for (const [itemId, mark] of Object.entries(entry.marks)) {
          if (mark) evaluation.marks[itemId] = mark;
          else delete evaluation.marks[itemId];
        }
        if (entry.comment !== undefined) evaluation.comment = entry.comment.trim() || undefined;
        evaluation.updatedAt = now;
      }
      await this.write(record);
      return withoutOwner(record);
    });
  }

  delete(id: string, owner: string): Promise<void> {
    return this.enqueue(id, async () => {
      await this.read(id, owner);
      await rm(this.file(id), { force: true });
      this.summaries.delete(id);
    });
  }

  /** Espera as escritas em andamento e para a verificação automática (desligamento do servidor). */
  async close(): Promise<void> {
    this.closed = true;
    await Promise.allSettled([...this.queues.values()]);
  }

  /**
   * Roda a checklist oficial no código salvo de cada resposta da atividade. O resultado é só uma sugestão para quem
   * avalia: a nota sempre vem das marcas do professor ou da IA.
   */
  private scheduleAutoCheck(id: string): void {
    const validator = this.options.validator;
    if (!validator) return;
    void (async () => {
      const record = await this.readStored(id);
      const auto = new Map<string, Record<string, boolean>>();
      const pending = record.answers.filter((answer) => answer.status === 'started');
      const questions = new Map(record.questions.map((q) => [q.id, q]));
      const worker = async () => {
        for (let answer = pending.shift(); answer && !this.closed; answer = pending.shift()) {
          const question = questions.get(answer.questionId);
          if (!question) continue;
          try {
            const verdict = await validator(answer.code, question);
            const passed = new Map(verdict.items.map((item) => [item.id, item.passed]));
            const checkable = question.checklist.filter((item) => !isManualItem(item));
            auto.set(
              `${answer.playerId}:${answer.questionId}`,
              Object.fromEntries(checkable.map((item) => [item.id, passed.get(item.id) === true])),
            );
          } catch (err) {
            this.options.log?.(`Verificação automática falhou (${id}): ${(err as Error).message}`);
          }
        }
      };
      await Promise.all(Array.from({ length: AUTO_CHECK_CONCURRENCY }, worker));
      if (this.closed) return;
      await this.enqueue(id, async () => {
        const latest = await this.readStored(id);
        for (const answer of latest.answers) {
          const result = auto.get(`${answer.playerId}:${answer.questionId}`);
          if (result) answer.auto = result;
        }
        latest.autoCheck = 'done';
        await this.write(latest);
      });
    })().catch((err: unknown) => this.options.log?.(`Verificação automática falhou (${id}): ${(err as Error).message}`));
  }

  private enqueue<T>(id: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(task);
    const tracked = next.catch(() => undefined);
    this.queues.set(id, tracked);
    void tracked.then(() => {
      if (this.queues.get(id) === tracked) this.queues.delete(id);
    });
    return next;
  }

  private file(id: string): string {
    return join(this.dir, `${id}.json`);
  }

  private async readStored(id: string): Promise<StoredHistory> {
    if (!ID_PATTERN.test(id)) throw new HistoryError(404, 'Sessão não encontrada');
    try {
      return JSON.parse(await readFile(this.file(id), 'utf8')) as StoredHistory;
    } catch {
      throw new HistoryError(404, 'Sessão não encontrada');
    }
  }

  private async read(id: string, owner: string): Promise<StoredHistory> {
    const summary = this.summaries.get(id);
    // Mesma resposta para "não existe" e "é de outro professor": não revela quais sessões existem.
    if (!summary || summary.owner !== owner) throw new HistoryError(404, 'Sessão não encontrada');
    return this.readStored(id);
  }

  private async write(record: StoredHistory): Promise<void> {
    const temp = `${this.file(record.id)}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(record), 'utf8');
    await rename(temp, this.file(record.id));
    this.summaries.set(record.id, { ...summarize(record), owner: record.owner });
  }
}
