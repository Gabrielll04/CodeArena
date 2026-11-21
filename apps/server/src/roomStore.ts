import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Room, RoomState } from '@codearena/core';

/** O que o servidor precisa, além do estado da sala, para religar a sala ao histórico depois de reiniciar. */
export interface RoomMeta {
  historyId: string;
  /** Hash da chave do professor. */
  owner: string | null;
  packId: string | null;
}

export interface StoredRoom extends RoomMeta {
  state: RoomState;
}

/**
 * Salas abertas, gravadas num SQLite local (`<dataDir>/codearena.db`) a cada mudança, para retomar as sessões se o
 * servidor cair ou reiniciar. Cada sala é uma linha com o estado completo em JSON; a linha some quando a sala acaba.
 * O arquivo guarda os tokens de professor e alunos: fica só no servidor.
 */
export class RoomStore {
  private readonly db: DatabaseSync;
  private readonly upsert;
  private readonly remove;
  private closed = false;

  constructor(options: { dataDir: string }) {
    mkdirSync(options.dataDir, { recursive: true });
    this.db = new DatabaseSync(join(options.dataDir, 'codearena.db'));
    // WAL: cada gravação é um commit curto e não trava a leitura; NORMAL basta para sobreviver a uma queda do processo.
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      CREATE TABLE IF NOT EXISTS rooms (
        code TEXT PRIMARY KEY,
        history_id TEXT NOT NULL,
        owner TEXT,
        pack_id TEXT,
        state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    this.upsert = this.db.prepare(`
      INSERT INTO rooms (code, history_id, owner, pack_id, state, updated_at) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (code) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at
    `);
    this.remove = this.db.prepare('DELETE FROM rooms WHERE code = ?');
  }

  save(room: Room, meta: RoomMeta): void {
    // Depois de fechar (desligamento), as salas já estão gravadas: o que mudar agora é só a desconexão dos alunos.
    if (this.closed) return;
    const state = room.toState();
    this.upsert.run(room.code, meta.historyId, meta.owner, meta.packId, JSON.stringify(state), state.savedAt);
  }

  delete(code: string): void {
    if (this.closed) return;
    this.remove.run(code);
  }

  /** Salas gravadas. Linhas que não dão para ler voltam em `broken` (ficam no arquivo para recuperação manual). */
  list(): { rooms: StoredRoom[]; broken: string[] } {
    const rows = this.db.prepare('SELECT code, history_id, owner, pack_id, state FROM rooms').all() as {
      code: string;
      history_id: string;
      owner: string | null;
      pack_id: string | null;
      state: string;
    }[];
    const rooms: StoredRoom[] = [];
    const broken: string[] = [];
    for (const row of rows) {
      try {
        rooms.push({ historyId: row.history_id, owner: row.owner, packId: row.pack_id, state: JSON.parse(row.state) as RoomState });
      } catch {
        broken.push(row.code);
      }
    }
    return { rooms, broken };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.db.close();
  }
}
