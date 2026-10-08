import type { Server, Socket } from 'socket.io';
import type { ZodType } from 'zod';
import { RoomError, RoomManager, type Room, type RoomSink, type SubmissionValidator } from '@codearena/core';
import type { PluginRegistry, QuizPlugin } from '@codearena/plugin-sdk';
import {
  CreateRoomPayloadSchema,
  HostAuthPayloadSchema,
  HostKickPayloadSchema,
  HostSettingsPayloadSchema,
  JoinRoomPayloadSchema,
  ProgressPayloadSchema,
  resolveQuestions,
  SubmitPayloadSchema,
  type Ack,
  type ClientToServerEvents,
  type ErrorCode,
  type ServerToClientEvents,
} from '@codearena/schemas';
import type { PackStore } from './packStore';

interface SocketData {
  roomCode?: string;
  role?: 'host' | 'player';
  playerId?: string;
}

type IO = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type ClientSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

const allChannel = (code: string) => `room:${code}`;
const hostChannel = (code: string) => `host:${code}`;
const playerChannel = (code: string, playerId: string) => `player:${code}:${playerId}`;

function failure(error: unknown): Extract<Ack, { ok: false }> {
  if (error instanceof RoomError) return { ok: false, error: error.message, code: error.code };
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: message, code: 'invalid_state' };
}

function invalid(message: string, code: ErrorCode = 'invalid_payload'): Extract<Ack, { ok: false }> {
  return { ok: false, error: message, code };
}

function parse<T>(schema: ZodType<T>, payload: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const result = schema.safeParse(payload);
  if (result.success) return { ok: true, data: result.data };
  return { ok: false, error: result.error.issues.map((i) => i.message).join('; ') };
}

/** Garante que `ack` seja chamável mesmo se o cliente não enviar callback. */
function safeAck<T>(ack: unknown): (res: T) => void {
  return typeof ack === 'function' ? (ack as (res: T) => void) : () => undefined;
}

export interface RealtimeDeps {
  io: IO;
  rooms: RoomManager;
  packs: PackStore;
  plugins: PluginRegistry<QuizPlugin<any>>;
  validator: SubmissionValidator;
}

export function attachRealtime({ io, rooms, packs, plugins, validator }: RealtimeDeps): void {
  const sinkFor = (getRoom: () => Room | undefined): RoomSink => ({
    emit(target, event, payload) {
      const room = getRoom();
      if (!room) return;
      const channel =
        target.kind === 'all'
          ? allChannel(room.code)
          : target.kind === 'host'
            ? hostChannel(room.code)
            : playerChannel(room.code, target.playerId);
      (io.to(channel).emit as (e: string, p: unknown) => void)(event, payload);
    },
    sync() {
      const room = getRoom();
      if (!room) return;
      io.to(hostChannel(room.code)).emit('room:update', room.snapshotForHost());
      for (const player of room.snapshotForHost().players) {
        io.to(playerChannel(room.code, player.id)).emit('room:update', room.snapshotForPlayer(player.id));
      }
    },
  });

  const authorizeHost = (payload: unknown): { room: Room } | { error: Extract<Ack, { ok: false }> } => {
    const parsed = parse(HostAuthPayloadSchema, payload);
    if (!parsed.ok) return { error: invalid(parsed.error) };
    const room = rooms.get(parsed.data.code);
    if (!room) return { error: invalid('Sala não encontrada', 'room_not_found') };
    if (!room.isHost(parsed.data.hostToken)) return { error: invalid('Apenas o professor da sala pode fazer isso', 'not_authorized') };
    return { room };
  };

  const bindHost = (socket: ClientSocket, room: Room) => {
    socket.data.roomCode = room.code;
    socket.data.role = 'host';
    void socket.join([allChannel(room.code), hostChannel(room.code)]);
  };

  const currentPlayer = (socket: ClientSocket): { room: Room; playerId: string } | null => {
    const { roomCode, playerId, role } = socket.data;
    if (role !== 'player' || !roomCode || !playerId) return null;
    const room = rooms.get(roomCode);
    if (!room || !room.hasPlayer(playerId)) return null;
    return { room, playerId };
  };

  io.on('connection', (socket: ClientSocket) => {
    socket.on('room:create', (payload, rawAck) => {
      const ack = safeAck<Parameters<Parameters<ClientToServerEvents['room:create']>[1]>[0]>(rawAck);
      const parsed = parse(CreateRoomPayloadSchema, payload);
      if (!parsed.ok) return ack(invalid(parsed.error));
      const stored = packs.get(parsed.data.packId);
      if (!stored) return ack(invalid('Pack não encontrado', 'pack_not_found'));
      let questions = resolveQuestions(stored.pack);
      if (parsed.data.questionIds?.length) {
        const order = parsed.data.questionIds;
        questions = order.map((id) => questions.find((q) => q.id === id)).filter((q) => q !== undefined);
      }
      if (questions.length === 0) return ack(invalid('Selecione pelo menos uma questão'));
      const missing = [...new Set(questions.map((q) => q.pluginId))].filter((id) => !plugins.has(id));
      if (missing.length) return ack(invalid(`Plugin não instalado no servidor: ${missing.join(', ')}`, 'plugin_missing'));

      let room: Room | undefined;
      try {
        room = rooms.create({
          packTitle: stored.pack.pack.title,
          questions,
          settings: parsed.data.settings,
          validator,
          sink: sinkFor(() => room),
        });
      } catch (err) {
        return ack(failure(err));
      }
      bindHost(socket, room);
      ack({ ok: true, code: room.code, hostToken: room.hostToken, snapshot: room.snapshotForHost() });
    });

    socket.on('room:host', (payload, rawAck) => {
      const ack = safeAck<Ack<{ snapshot: ReturnType<Room['snapshotForHost']> }>>(rawAck);
      const auth = authorizeHost(payload);
      if ('error' in auth) return ack(auth.error);
      bindHost(socket, auth.room);
      ack({ ok: true, snapshot: auth.room.snapshotForHost() });
    });

    socket.on('room:join', (payload, rawAck) => {
      const ack = safeAck<Parameters<Parameters<ClientToServerEvents['room:join']>[1]>[0]>(rawAck);
      const parsed = parse(JoinRoomPayloadSchema, payload);
      if (!parsed.ok) return ack(invalid(parsed.error));
      const room = rooms.get(parsed.data.code);
      if (!room) return ack(invalid('Sala não encontrada. Confira o código com o professor.', 'room_not_found'));
      try {
        const previous = currentPlayer(socket);
        if (previous && previous.room !== room) previous.room.disconnect(previous.playerId);
        const { playerId, playerToken } = room.join(parsed.data);
        socket.data.roomCode = room.code;
        socket.data.role = 'player';
        socket.data.playerId = playerId;
        void socket.join([allChannel(room.code), playerChannel(room.code, playerId)]);
        ack({ ok: true, playerId, playerToken, snapshot: room.snapshotForPlayer(playerId) });
      } catch (err) {
        ack(failure(err));
      }
    });

    socket.on('room:leave', (rawAck) => {
      const ack = safeAck<Ack>(rawAck);
      const current = currentPlayer(socket);
      if (current) {
        current.room.leave(current.playerId);
        void socket.leave(allChannel(current.room.code));
        void socket.leave(playerChannel(current.room.code, current.playerId));
      }
      socket.data = {};
      ack({ ok: true });
    });

    const hostAction = (
      event: 'host:start-question' | 'host:finish-question' | 'host:end-session',
      run: (room: Room) => unknown,
    ) => {
      socket.on(event, async (payload: unknown, rawAck: unknown) => {
        const ack = safeAck<Ack>(rawAck);
        const auth = authorizeHost(payload);
        if ('error' in auth) return ack(auth.error);
        try {
          await run(auth.room);
          ack({ ok: true });
        } catch (err) {
          ack(failure(err));
        }
      });
    };
    hostAction('host:start-question', (room) => room.startNextQuestion());
    hostAction('host:finish-question', (room) => room.finishQuestion());
    hostAction('host:end-session', (room) => room.endSession());

    socket.on('host:update-settings', (payload, rawAck) => {
      const ack = safeAck<Ack>(rawAck);
      const parsed = parse(HostSettingsPayloadSchema, payload);
      if (!parsed.ok) return ack(invalid(parsed.error));
      const auth = authorizeHost(parsed.data);
      if ('error' in auth) return ack(auth.error);
      auth.room.updateSettings(parsed.data.settings);
      ack({ ok: true });
    });

    socket.on('host:kick', (payload, rawAck) => {
      const ack = safeAck<Ack>(rawAck);
      const parsed = parse(HostKickPayloadSchema, payload);
      if (!parsed.ok) return ack(invalid(parsed.error));
      const auth = authorizeHost(parsed.data);
      if ('error' in auth) return ack(auth.error);
      try {
        auth.room.kick(parsed.data.playerId);
        io.to(playerChannel(auth.room.code, parsed.data.playerId)).emit('room:closed', {
          reason: 'Você foi removido da sala pelo professor',
        });
        io.in(playerChannel(auth.room.code, parsed.data.playerId)).socketsLeave([
          allChannel(auth.room.code),
          playerChannel(auth.room.code, parsed.data.playerId),
        ]);
        ack({ ok: true });
      } catch (err) {
        ack(failure(err));
      }
    });

    socket.on('question:progress', (payload) => {
      const current = currentPlayer(socket);
      const parsed = parse(ProgressPayloadSchema, payload);
      if (!current || !parsed.ok) return;
      current.room.reportProgress(current.playerId, parsed.data.done, parsed.data.total);
    });

    socket.on('question:submit', async (payload, rawAck) => {
      const ack = safeAck<Parameters<Parameters<ClientToServerEvents['question:submit']>[1]>[0]>(rawAck);
      const current = currentPlayer(socket);
      if (!current) return ack(invalid('Entre em uma sala antes de responder', 'not_in_room'));
      const parsed = parse(SubmitPayloadSchema, payload);
      if (!parsed.ok) return ack(invalid(parsed.error));
      try {
        const answer = await current.room.submit(current.playerId, parsed.data.code);
        ack({ ok: true, answer });
      } catch (err) {
        ack(failure(err));
      }
    });

    socket.on('disconnect', async () => {
      const current = currentPlayer(socket);
      if (!current) return;
      const others = await io.in(playerChannel(current.room.code, current.playerId)).fetchSockets();
      if (others.length === 0) current.room.disconnect(current.playerId);
    });
  });
}
