import { msepActivityGrade, msepQuestionGrade, type ActivityGradeResult, type QuestionGradeResult } from '@codearena/core';
import type { AnswerEvaluation, HistoryAnswer, ResolvedQuestion, SessionHistory } from '@codearena/schemas';

export const answerKey = (playerId: string, questionId: string) => `${playerId}:${questionId}`;

export function evaluationIndex(record: SessionHistory): Map<string, AnswerEvaluation> {
  return new Map(record.evaluations.map((e) => [answerKey(e.playerId, e.questionId), e]));
}

export function answerIndex(record: SessionHistory): Map<string, HistoryAnswer> {
  return new Map(record.answers.map((a) => [answerKey(a.playerId, a.questionId), a]));
}

export interface StudentGrades {
  questions: { question: ResolvedQuestion; result: QuestionGradeResult }[];
  activity: ActivityGradeResult;
}

/** Nota MSEP de cada questão e da atividade de um aluno, pelas marcas salvas. */
export function studentGrades(record: SessionHistory, playerId: string, evaluations = evaluationIndex(record)): StudentGrades {
  const questions = record.questions.map((question) => ({
    question,
    result: msepQuestionGrade(question.checklist, evaluations.get(answerKey(playerId, question.id))?.marks ?? {}),
  }));
  return { questions, activity: msepActivityGrade(questions.map((q) => q.result)) };
}

/** Código curto que identifica o aluno no arquivo para IA (os nomes não saem do CodeArena). */
export function pseudonym(record: SessionHistory, playerId: string): string {
  const index = record.players.findIndex((p) => p.id === playerId);
  return `aluno-${String(index + 1).padStart(2, '0')}`;
}

const csvText = (value: string) => `"${value.replace(/"/g, '""')}"`;

/**
 * Notas em CSV para o diário ou o Classroom: separador ";", como as planilhas em português esperam. Questões ainda
 * não avaliadas ficam em branco.
 */
export function gradesCsv(record: SessionHistory): string {
  const evaluations = evaluationIndex(record);
  const header = ['aluno', ...record.questions.map((_, i) => `q${i + 1}`), 'nota', 'faltou_critico'];
  const lines = [...record.players]
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    .map((player) => {
      const grades = studentGrades(record, player.id, evaluations);
      return [
        csvText(player.name),
        ...grades.questions.map((q) => (q.result.grade === null ? '' : String(q.result.grade))),
        grades.activity.grade === null ? '' : String(grades.activity.grade),
        grades.activity.capped ? 'sim' : 'nao',
      ];
    });
  return '﻿' + [header, ...lines].map((line) => line.join(';')).join('\n');
}
