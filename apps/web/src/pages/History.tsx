import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { ActiveRoomSummary, SessionHistorySummary } from '@codearena/schemas';
import { TopBar } from '../components/TopBar';
import { Badge, Button, EmptyState, Icon, Input, Panel, Spinner } from '../components/ui';
import { api } from '../lib/api';
import { plural } from '../lib/format';
import { setTeacherKey, teacherKey } from '../lib/teacherKey';
import { rememberHostToken } from '../stores/host';

export const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Sessões encerradas pelo professor deste navegador, das mais recentes para as mais antigas. */
export function HistoryPage() {
  const [sessions, setSessions] = useState<SessionHistorySummary[] | null>(null);
  const [active, setActive] = useState<ActiveRoomSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setSessions(null);
    api
      .listHistory()
      .then(setSessions)
      .catch((err: Error) => setError(err.message));
    api
      .activeRooms()
      .then(setActive)
      .catch(() => setActive([]));
  }, []);
  useEffect(load, [load]);

  return (
    <div className="flex min-h-full flex-col">
      <TopBar logoTo="/teacher">
        <span className="text-sm font-semibold text-white/60">Área do professor</span>
      </TopBar>
      <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Histórico</h1>
            <p className="mt-1 text-white/50">Sessões encerradas, com placar, respostas e avaliações.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ImportSessionButton onImported={load} onError={setError} />
            <Link to="/teacher">
              <Button variant="secondary">Voltar à biblioteca</Button>
            </Link>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral">
            {error}
          </p>
        )}

        {active.length > 0 && <ActiveRooms rooms={active} />}

        {!sessions ? (
          !error && (
            <div className="flex items-center gap-2 text-white/50">
              <Spinner className="h-4 w-4" /> Carregando
            </div>
          )
        ) : sessions.length === 0 ? (
          <EmptyState title="Nenhuma sessão encerrada ainda">As salas que você abrir aparecem aqui quando terminarem.</EmptyState>
        ) : (
          <Panel className="overflow-x-auto p-2">
            <table className="w-full min-w-[600px] text-left text-sm" data-testid="history-list">
              <thead className="text-xs uppercase tracking-wider text-white/40">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2">Pack</th>
                  <th className="px-3 py-2">Tipo</th>
                  <th className="px-3 py-2 text-right">Alunos</th>
                  <th className="px-3 py-2 text-right">Avaliação</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((session) => (
                  <tr key={session.id} className="border-t border-white/[0.05] hover:bg-white/[0.03]" data-testid="history-row">
                    <td className="px-3 py-2 font-mono text-xs text-white/60">{dateTime.format(session.endedAt)}</td>
                    <td className="px-3 py-2">
                      <Link to={`/teacher/historico/${session.id}`} className="font-semibold hover:text-lime">
                        {session.packTitle}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      {session.mode === 'assessment' ? <Badge tone="violet">Atividade</Badge> : <Badge>Competição</Badge>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{session.playerCount}</td>
                    <td className="px-3 py-2 text-right text-xs">
                      {session.mode === 'assessment' ? (
                        <span className={session.evaluatedCount === session.playerCount ? 'text-lime' : 'text-white/60'}>
                          {session.evaluatedCount} de {session.playerCount} avaliados
                        </span>
                      ) : (
                        <span className="text-white/30">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}

        <TeacherKeyPanel onChange={load} />
      </main>
    </div>
  );
}

/** Salas que ainda estão abertas: o professor volta a elas mesmo se saiu da tela (ex.: o servidor caiu no meio da aula). */
function ActiveRooms({ rooms }: { rooms: ActiveRoomSummary[] }) {
  const navigate = useNavigate();
  const rejoin = (room: ActiveRoomSummary) => {
    rememberHostToken(room.roomCode, room.hostToken);
    navigate(`/host/${room.roomCode}`);
  };

  return (
    <section className="space-y-3" aria-labelledby="active-rooms-title" data-testid="active-rooms">
      <h2 id="active-rooms-title" className="flex items-center gap-2 font-display text-lg font-bold">
        <span aria-hidden className="h-2 w-2 rounded-full bg-coral" />
        Em andamento
      </h2>
      {rooms.map((room) => (
        <Panel key={room.roomCode} className="flex flex-wrap items-center justify-between gap-4 p-4" data-testid="active-room">
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{room.packTitle}</span>
              {room.mode === 'assessment' ? <Badge tone="violet">Atividade</Badge> : <Badge>Competição</Badge>}
              <Badge tone={room.phase === 'lobby' ? 'neutral' : 'coral'}>
                {room.phase === 'lobby' ? 'Aguardando início' : 'Em andamento'}
              </Badge>
            </div>
            <p className="text-xs text-white/50">
              Sala <span className="font-mono text-white/70">{room.roomCode}</span> · {plural(room.playerCount, 'aluno')} ·
              aberta em {dateTime.format(room.createdAt)}
            </p>
          </div>
          <Button variant="primary" size="sm" onClick={() => rejoin(room)} data-testid="active-room-rejoin">
            <Icon name="play" /> Voltar para a sala
          </Button>
        </Panel>
      ))}
    </section>
  );
}

/** Traz de volta uma sessão baixada em "Baixar sessão" (ex.: aplicada numa guia anônima, cuja chave sumiu). */
function ImportSessionButton({ onImported, onError }: { onImported: () => void; onError: (message: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const importFile = async (file: File) => {
    setBusy(true);
    onError(null);
    try {
      let record: unknown;
      try {
        record = JSON.parse(await file.text());
      } catch {
        throw new Error('O arquivo não é um JSON válido.');
      }
      await api.importHistory(record);
      onImported();
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()} data-testid="history-import">
        <Icon name="upload" /> Importar sessão
      </Button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Arquivo da sessão"
        data-testid="history-import-file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void importFile(file);
        }}
      />
    </>
  );
}

/** O histórico fica ligado a uma chave guardada neste navegador. Para usar outro navegador, leve a chave junto. */
function TeacherKeyPanel({ onChange }: { onChange: () => void }) {
  const [copied, setCopied] = useState(false);
  const [other, setOther] = useState('');
  const [invalid, setInvalid] = useState(false);
  return (
    <Panel className="space-y-3 p-5">
      <h2 className="text-xs font-bold uppercase tracking-[0.14em] text-white/50">Usar em outro navegador</h2>
      <p className="text-sm text-white/60">
        Copie a chave deste navegador e cole no outro. Quem tem a chave vê este histórico. Numa guia anônima, a chave some
        quando a guia fecha: baixe os Dados (JSON) da sessão antes e use Importar sessão depois.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(teacherKey()).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
        >
          {copied ? 'Chave copiada' : 'Copiar minha chave'}
        </Button>
        <div className="w-full max-w-xs">
          <Input
            aria-label="Chave de outro navegador"
            value={other}
            onChange={(e) => {
              setOther(e.target.value);
              setInvalid(false);
            }}
            placeholder="Colar a chave de outro navegador"
            className="font-mono text-xs"
          />
        </div>
        <Button
          size="sm"
          disabled={!other.trim()}
          onClick={() => {
            if (!window.confirm('Trocar a chave deste navegador? Copie a atual antes, se quiser voltar a ela.')) return;
            if (!setTeacherKey(other)) return setInvalid(true);
            setOther('');
            onChange();
          }}
        >
          Usar esta chave
        </Button>
      </div>
      {invalid && <p className="text-xs text-coral">Chave inválida.</p>}
    </Panel>
  );
}
