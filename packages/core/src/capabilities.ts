import type { CapabilityType, ChecklistItem, ResolvedQuestion } from '@codearena/schemas';

/**
 * Mapa de capacidades (MSEP): junta as avaliações de várias atividades e mostra, para cada aluno, a situação de cada
 * capacidade dos critérios. Vale a evidência mais recente: quem errou um crítico numa atividade e acertou na
 * recuperação passa a "recuperada".
 *
 * Os alunos são casados entre atividades pelo nome digitado (sem acentos, maiúsculas e espaços repetidos), porque o
 * CodeArena ainda não tem uma lista fixa da turma. Critérios sem capacidade ficam de fora do mapa.
 */

/** Situação de uma capacidade para um aluno. */
export type CapabilityStatus = 'developed' | 'recovered' | 'developing' | 'to-recover';

/** O mínimo de uma atividade avaliada de que o mapa precisa (um registro do histórico serve). */
export interface CapabilitySessionInput {
  id: string;
  packTitle: string;
  startedAt: number;
  questions: (Pick<ResolvedQuestion, 'id' | 'title'> & { checklist: Pick<ChecklistItem, 'id' | 'label' | 'optional' | 'capability'>[] })[];
  players: { id: string; name: string }[];
  evaluations: { playerId: string; questionId: string; marks: Record<string, { met: boolean } | null | undefined> }[];
}

export interface CapabilityRef {
  key: string;
  type: CapabilityType;
  name: string;
  /** Questões das atividades com um critério crítico desta capacidade: as que entram numa recuperação. */
  questions: { id: string; title: string }[];
}

/** Um critério avaliado que conta como evidência da capacidade. */
export interface CapabilityEvidence {
  sessionId: string;
  questionId: string;
  questionTitle: string;
  criterionId: string;
  criterionLabel: string;
  critical: boolean;
  met: boolean;
}

export interface CapabilityCell {
  status: CapabilityStatus;
  /** Critérios atendidos e não atendidos, somando todas as atividades. */
  met: number;
  unmet: number;
  /** Atividade da evidência mais recente, que decide a situação. */
  latestSessionId: string;
  evidence: CapabilityEvidence[];
}

export interface CapabilityStudent {
  key: string;
  /** Nome como apareceu na atividade mais recente. */
  name: string;
  /** Atividades em que o aluno aparece (ids). */
  sessionIds: string[];
  /** Por chave da capacidade; capacidade sem avaliação do aluno não aparece. */
  cells: Record<string, CapabilityCell>;
}

export interface CapabilityMap {
  sessions: { id: string; packTitle: string; startedAt: number }[];
  /** Na ordem em que aparecem nas atividades (da mais antiga para a mais recente). */
  capabilities: CapabilityRef[];
  /** Em ordem alfabética. */
  students: CapabilityStudent[];
}

/** Texto comparável: sem acentos, sem maiúsculas e com espaços simples. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function capabilityKey(capability: { type: CapabilityType; name: string }): string {
  return `${capability.type}:${normalizeText(capability.name)}`;
}

export function buildCapabilityMap(input: CapabilitySessionInput[]): CapabilityMap {
  const sessions = [...input].sort((a, b) => a.startedAt - b.startedAt);
  const capabilities = new Map<string, Omit<CapabilityRef, 'questions'>>();
  const coverage = new Map<string, Map<string, string>>();
  const students = new Map<string, { name: string; sessionIds: Set<string>; evidence: Map<string, CapabilityEvidence[]> }>();

  for (const session of sessions) {
    const questions = new Map(session.questions.map((q) => [q.id, q]));
    for (const question of session.questions) {
      for (const item of question.checklist) {
        if (item.optional || !item.capability) continue;
        const covered = coverage.get(capabilityKey(item.capability)) ?? new Map<string, string>();
        covered.delete(question.id);
        covered.set(question.id, question.title ?? question.id);
        coverage.set(capabilityKey(item.capability), covered);
      }
    }
    const names = new Map(session.players.map((p) => [p.id, p.name]));
    for (const evaluation of session.evaluations) {
      const question = questions.get(evaluation.questionId);
      const name = names.get(evaluation.playerId);
      if (!question || !name || !normalizeText(name)) continue;
      const studentKey = normalizeText(name);
      const student = students.get(studentKey) ?? { name, sessionIds: new Set(), evidence: new Map() };
      student.name = name;
      student.sessionIds.add(session.id);
      students.set(studentKey, student);

      for (const item of question.checklist) {
        const mark = evaluation.marks[item.id];
        if (!item.capability || !mark) continue;
        const key = capabilityKey(item.capability);
        if (!capabilities.has(key)) capabilities.set(key, { key, ...item.capability });
        const list = student.evidence.get(key) ?? [];
        list.push({
          sessionId: session.id,
          questionId: question.id,
          questionTitle: question.title ?? question.id,
          criterionId: item.id,
          criterionLabel: item.label,
          critical: !item.optional,
          met: mark.met,
        });
        student.evidence.set(key, list);
      }
    }
  }

  return {
    sessions: sessions.map(({ id, packTitle, startedAt }) => ({ id, packTitle, startedAt })),
    capabilities: [...capabilities.values()].map((capability) => ({
      ...capability,
      questions: [...(coverage.get(capability.key) ?? [])].map(([id, title]) => ({ id, title })),
    })),
    students: [...students.entries()]
      .map(([key, student]) => ({
        key,
        name: student.name,
        sessionIds: [...student.sessionIds],
        cells: Object.fromEntries([...student.evidence].map(([capability, evidence]) => [capability, cellFor(evidence)])),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
  };
}

/**
 * Situação pela atividade mais recente que avaliou um critério crítico da capacidade (a evidência já vem em ordem de
 * data). Um desejável sozinho, numa atividade depois, não recupera nem derruba um crítico.
 */
function cellFor(evidence: CapabilityEvidence[]): CapabilityCell {
  const decisive = [...evidence].reverse().find((e) => e.critical) ?? evidence[evidence.length - 1]!;
  const latestSessionId = decisive.sessionId;
  const latest = evidence.filter((e) => e.sessionId === latestSessionId);
  const earlier = evidence.slice(0, evidence.indexOf(latest[0]!));
  const failsCritical = (list: CapabilityEvidence[]) => list.some((e) => e.critical && !e.met);
  const status: CapabilityStatus = failsCritical(latest)
    ? 'to-recover'
    : latest.some((e) => !e.met)
      ? 'developing'
      : failsCritical(earlier)
        ? 'recovered'
        : 'developed';
  return {
    status,
    met: evidence.filter((e) => e.met).length,
    unmet: evidence.filter((e) => !e.met).length,
    latestSessionId,
    evidence,
  };
}

/** Capacidades que o aluno (ou cada um dos alunos) precisa recuperar. */
export function capabilitiesToRecover(map: CapabilityMap, studentKeys?: string[]): string[] {
  const wanted = studentKeys ? new Set(studentKeys) : null;
  const keys = new Set<string>();
  for (const student of map.students) {
    if (wanted && !wanted.has(student.key)) continue;
    for (const [key, cell] of Object.entries(student.cells)) if (cell.status === 'to-recover') keys.add(key);
  }
  return map.capabilities.map((c) => c.key).filter((key) => keys.has(key));
}

/**
 * Questões para uma atividade de recuperação: toda questão das atividades que tem um critério crítico de alguma das
 * capacidades pedidas. A mesma questão em várias atividades entra uma vez, na versão mais recente.
 */
export function recoveryQuestions<Q extends CapabilitySessionInput['questions'][number]>(
  sessions: (Omit<CapabilitySessionInput, 'questions'> & { questions: Q[] })[],
  capabilityKeys: string[],
): Q[] {
  const wanted = new Set(capabilityKeys);
  const picked = new Map<string, Q>();
  for (const session of [...sessions].sort((a, b) => a.startedAt - b.startedAt)) {
    for (const question of session.questions) {
      const covers = question.checklist.some((item) => !item.optional && item.capability && wanted.has(capabilityKey(item.capability)));
      if (!covers) continue;
      // Remove antes de pôr de novo: a ordem final segue a última vez em que a questão apareceu.
      picked.delete(question.id);
      picked.set(question.id, question);
    }
  }
  return [...picked.values()];
}
