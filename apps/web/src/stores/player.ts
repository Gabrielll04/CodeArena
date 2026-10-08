import { create } from 'zustand';
import type {
  AvatarId,
  PlayerAnswer,
  QuestionFinishedEvent,
  RoomSnapshot,
  SessionReport,
} from '@codearena/schemas';
import { syncServerClock } from '../lib/clock';
import { getSocket, request } from '../lib/socket';
import { local } from '../lib/storage';
import { playCue } from '../lib/sound';

const SESSION_KEY = 'codearena:player-session';

export interface PlayerSession {
  code: string;
  name: string;
  avatar: AvatarId;
  playerToken: string;
}

interface PlayerStore {
  status: 'idle' | 'joining' | 'joined' | 'removed';
  session: PlayerSession | null;
  playerId: string | null;
  snapshot: RoomSnapshot | null;
  connected: boolean;
  lastFinished: QuestionFinishedEvent | null;
  report: SessionReport | null;
  removedReason: string | null;
  join(input: { code: string; name: string; avatar: AvatarId }): Promise<{ ok: true } | { ok: false; error: string }>;
  resume(code: string): Promise<boolean>;
  leave(): void;
  submit(code: string): Promise<PlayerAnswer | { error: string }>;
  reportProgress(done: number, total: number, doneIds: string[]): void;
}

let listening = false;

export const usePlayer = create<PlayerStore>((set, get) => {
  const accept = (snapshot: RoomSnapshot) => {
    if (!snapshot.me) return;
    syncServerClock(snapshot.serverNow);
    set({ snapshot, playerId: snapshot.me.playerId, report: snapshot.report ?? get().report });
  };

  const listen = () => {
    if (listening) return;
    listening = true;
    const socket = getSocket();
    socket.on('connect', () => {
      set({ connected: true });
      const { session, status } = get();
      // Reconexão: o token recupera o mesmo jogador com XP e respostas.
      if (session && status === 'joined') {
        void request('room:join', {
          code: session.code,
          name: session.name,
          avatar: session.avatar,
          playerToken: session.playerToken,
        }).then((res) => {
          if (res.ok) accept(res.snapshot);
          else set({ status: 'removed', removedReason: res.error });
        });
      }
    });
    socket.on('disconnect', () => set({ connected: false }));
    socket.on('room:update', (snapshot) => {
      if (get().status === 'joined' && snapshot.code === get().session?.code) accept(snapshot);
    });
    socket.on('question:loaded', ({ serverNow }) => {
      syncServerClock(serverNow);
      set({ lastFinished: null });
      playCue('start');
    });
    socket.on('question:finished', (event) => {
      if (get().status === 'joined') {
        set({ lastFinished: event });
        playCue('reveal');
      }
    });
    socket.on('session:ended', (report) => {
      if (get().status === 'joined') set({ report });
    });
    socket.on('room:closed', ({ reason }) => {
      local.remove(SESSION_KEY);
      set({ status: 'removed', removedReason: reason, snapshot: null });
    });
    set({ connected: socket.connected });
  };

  return {
    status: 'idle',
    session: local.get<PlayerSession>(SESSION_KEY),
    playerId: null,
    snapshot: null,
    connected: false,
    lastFinished: null,
    report: null,
    removedReason: null,

    async join({ code, name, avatar }) {
      listen();
      set({ status: 'joining' });
      const previous = get().session;
      const playerToken = previous && previous.code === code && previous.name === name ? previous.playerToken : undefined;
      const res = await request('room:join', { code, name, avatar, playerToken });
      if (!res.ok) {
        set({ status: 'idle' });
        return { ok: false, error: res.error };
      }
      const session: PlayerSession = { code, name: res.snapshot.me?.name ?? name, avatar, playerToken: res.playerToken };
      local.set(SESSION_KEY, session);
      set({ status: 'joined', session, removedReason: null, lastFinished: null, report: null });
      accept(res.snapshot);
      return { ok: true };
    },

    async resume(code) {
      const session = get().session;
      if (get().status === 'joined' && session?.code === code) return true;
      if (!session || session.code !== code) return false;
      const res = await get().join({ code, name: session.name, avatar: session.avatar });
      return res.ok;
    },

    leave() {
      getSocket().emit('room:leave');
      local.remove(SESSION_KEY);
      set({ status: 'idle', session: null, snapshot: null, playerId: null, lastFinished: null, report: null });
    },

    async submit(code) {
      const res = await request('question:submit', { code }, 20000);
      return res.ok ? res.answer : { error: res.error };
    },

    reportProgress(done, total, doneIds) {
      getSocket().emit('question:progress', { done, total, doneIds });
    },
  };
});
