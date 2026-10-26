import { create } from 'zustand';
import type {
  AssessmentGradeRow,
  ProgressEntry,
  QuestionFinishedEvent,
  QuestionTimeline,
  QuestionSubmittedEvent,
  RoomSettingsPatch,
  RoomSnapshot,
  SessionReport,
} from '@codearena/schemas';
import { syncServerClock } from '../lib/clock';
import { getSocket, request } from '../lib/socket';
import { local } from '../lib/storage';
import { playCue } from '../lib/sound';

const tokenKey = (code: string) => `codearena:host:${code}`;

export interface FeedEntry extends QuestionSubmittedEvent {
  at: number;
}

interface HostStore {
  code: string | null;
  hostToken: string | null;
  snapshot: RoomSnapshot | null;
  progress: Record<string, ProgressEntry>;
  /** Linha do tempo por questão (id da questão), só do professor. */
  timelines: Record<string, QuestionTimeline>;
  /** Atividade avaliativa: nota e progresso de cada aluno (id do aluno). */
  grades: Record<string, AssessmentGradeRow>;
  feed: FeedEntry[];
  lastFinished: QuestionFinishedEvent | null;
  report: SessionReport | null;
  connected: boolean;
  create(input: { packId: string; questionIds?: string[]; settings?: RoomSettingsPatch }): Promise<{ ok: true; code: string } | { ok: false; error: string }>;
  resume(code: string): Promise<{ ok: true } | { ok: false; error: string }>;
  startQuestion(): Promise<string | null>;
  finishQuestion(): Promise<string | null>;
  endSession(): Promise<string | null>;
  updateSettings(settings: RoomSettingsPatch): Promise<string | null>;
  kick(playerId: string): Promise<string | null>;
}

let listening = false;

export const useHost = create<HostStore>((set, get) => {
  const accept = (snapshot: RoomSnapshot) => {
    if (!snapshot.progress) return;
    syncServerClock(snapshot.serverNow);
    const progress: Record<string, ProgressEntry> = {};
    snapshot.progress.forEach((entry) => (progress[entry.playerId] = entry));
    const timelines: Record<string, QuestionTimeline> = {};
    snapshot.timelines?.forEach((timeline) => (timelines[timeline.questionId] = timeline));
    const grades: Record<string, AssessmentGradeRow> = {};
    snapshot.grades?.forEach((row) => (grades[row.playerId] = row));
    set({ snapshot, progress, timelines, grades, report: snapshot.report ?? get().report });
  };

  const listen = () => {
    if (listening) return;
    listening = true;
    const socket = getSocket();
    socket.on('connect', () => {
      set({ connected: true });
      const { code, hostToken } = get();
      if (code && hostToken) {
        void request('room:host', { code, hostToken }).then((res) => res.ok && accept(res.snapshot));
      }
    });
    socket.on('disconnect', () => set({ connected: false }));
    socket.on('room:update', (snapshot) => {
      if (snapshot.code === get().code) accept(snapshot);
    });
    socket.on('player:joined', () => playCue('join'));
    socket.on('question:progress', (entry) => {
      set({ progress: { ...get().progress, [entry.playerId]: entry } });
    });
    socket.on('question:timeline', ({ questionId, timeline }) => {
      const question = get().timelines[questionId];
      if (!question) return;
      const exists = question.players.some((p) => p.playerId === timeline.playerId);
      const players = exists
        ? question.players.map((p) => (p.playerId === timeline.playerId ? timeline : p))
        : [...question.players, timeline];
      set({ timelines: { ...get().timelines, [questionId]: { ...question, players } } });
    });
    socket.on('assessment:row', (row) => {
      const before = get().grades[row.playerId];
      const completed = (r?: AssessmentGradeRow) => r?.questions.filter((q) => q.status === 'complete').length ?? 0;
      if (completed(row) > completed(before)) playCue('check');
      set({ grades: { ...get().grades, [row.playerId]: row } });
    });
    socket.on('question:submitted', (event) => {
      set({ feed: [{ ...event, at: Date.now() }, ...get().feed].slice(0, 30) });
      if (event.accepted) playCue('check');
    });
    socket.on('question:loaded', () => set({ feed: [], lastFinished: null }));
    socket.on('question:finished', (event) => {
      set({ lastFinished: event });
      playCue('reveal');
    });
    socket.on('session:ended', (report) => set({ report }));
    set({ connected: socket.connected });
  };

  const hostCall = async (
    event: 'host:start-question' | 'host:finish-question' | 'host:end-session',
  ): Promise<string | null> => {
    const { code, hostToken } = get();
    if (!code || !hostToken) return 'Sala não carregada';
    const res = await request(event, { code, hostToken }, 30000);
    return res.ok ? null : res.error;
  };

  return {
    code: null,
    hostToken: null,
    snapshot: null,
    progress: {},
    timelines: {},
    grades: {},
    feed: [],
    lastFinished: null,
    report: null,
    connected: false,

    async create(input) {
      listen();
      const res = await request('room:create', input);
      if (!res.ok) return { ok: false, error: res.error };
      local.set(tokenKey(res.code), res.hostToken);
      set({ code: res.code, hostToken: res.hostToken, feed: [], lastFinished: null, report: null });
      accept(res.snapshot);
      return { ok: true, code: res.code };
    },

    async resume(code) {
      listen();
      if (get().code === code && get().snapshot) return { ok: true };
      const hostToken = local.get<string>(tokenKey(code));
      if (!hostToken) return { ok: false, error: 'Esta sala foi criada em outro navegador.' };
      const res = await request('room:host', { code, hostToken });
      if (!res.ok) return { ok: false, error: res.error };
      set({ code, hostToken, feed: [], lastFinished: null, report: null });
      accept(res.snapshot);
      return { ok: true };
    },

    startQuestion: () => hostCall('host:start-question'),
    finishQuestion: () => hostCall('host:finish-question'),
    endSession: () => hostCall('host:end-session'),

    async updateSettings(settings) {
      const { code, hostToken } = get();
      if (!code || !hostToken) return 'Sala não carregada';
      const res = await request('host:update-settings', { code, hostToken, settings });
      return res.ok ? null : res.error;
    },

    async kick(playerId) {
      const { code, hostToken } = get();
      if (!code || !hostToken) return 'Sala não carregada';
      const res = await request('host:kick', { code, hostToken, playerId });
      return res.ok ? null : res.error;
    },
  };
});
