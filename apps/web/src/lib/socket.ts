import { io, type Socket } from 'socket.io-client';
import type { Ack, ClientToServerEvents, ServerToClientEvents } from '@codearena/schemas';

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

export function getSocket(): AppSocket {
  if (!socket) {
    socket = io({ transports: ['websocket', 'polling'], reconnectionDelayMax: 3000 });
  }
  return socket;
}

type AckOf<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]> extends [unknown, (res: infer R) => void]
  ? R
  : Ack;

/** Emite um evento com confirmação e timeout; falhas de rede viram `{ ok: false }`. */
export async function request<E extends keyof ClientToServerEvents>(
  event: E,
  payload: Parameters<ClientToServerEvents[E]>[0],
  timeoutMs = 10000,
): Promise<AckOf<E>> {
  const s = getSocket();
  try {
    // emitWithAck não preserva a tipagem por evento; o retorno é tipado por AckOf.
    const withTimeout = s.timeout(timeoutMs) as unknown as { emitWithAck(e: string, p: unknown): Promise<AckOf<E>> };
    return await withTimeout.emitWithAck(event, payload);
  } catch {
    return { ok: false, error: 'Sem resposta do servidor. Verifique a conexão.', code: 'invalid_state' } as AckOf<E>;
  }
}

type NoPayloadEvent = {
  [E in keyof ClientToServerEvents]: Parameters<ClientToServerEvents[E]> extends [(res: never) => void] ? E : never;
}[keyof ClientToServerEvents];

type AckOfNoPayload<E extends keyof ClientToServerEvents> = Parameters<ClientToServerEvents[E]> extends [(res: infer R) => void]
  ? R
  : Ack;

/** Como `request`, para eventos sem payload (só a confirmação). */
export async function requestWithoutPayload<E extends NoPayloadEvent>(event: E, timeoutMs = 10000): Promise<AckOfNoPayload<E>> {
  const s = getSocket();
  try {
    const withTimeout = s.timeout(timeoutMs) as unknown as { emitWithAck(e: string): Promise<AckOfNoPayload<E>> };
    return await withTimeout.emitWithAck(event);
  } catch {
    return { ok: false, error: 'Sem resposta do servidor. Verifique a conexão.', code: 'invalid_state' } as AckOfNoPayload<E>;
  }
}
