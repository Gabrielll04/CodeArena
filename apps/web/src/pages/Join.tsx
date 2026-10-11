import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AVATAR_IDS, PlayerNameSchema, RoomCodeSchema, type AvatarId } from '@codearena/schemas';
import { AvatarPicker } from '../components/AvatarPicker';
import { Logo } from '../components/Logo';
import { Pedestal } from '../components/Pedestal';
import { Button, Field, Input, Panel } from '../components/ui';
import { api } from '../lib/api';
import { usePlayer } from '../stores/player';

export function JoinPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { join, session, status } = usePlayer();
  const [code, setCode] = useState(params.get('code')?.replace(/\D/g, '').slice(0, 6) ?? '');
  const [name, setName] = useState(session?.name ?? '');
  const [avatar, setAvatar] = useState<AvatarId>(
    session?.avatar ?? AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)]!,
  );
  const [room, setRoom] = useState<{ title: string } | { error: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRoom(null);
    if (!RoomCodeSchema.safeParse(code).success) return;
    let cancelled = false;
    api
      .roomInfo(code)
      .then((info) => !cancelled && setRoom({ title: info.packTitle }))
      .catch(() => !cancelled && setRoom({ error: 'Sala não encontrada. Confira o código.' }));
    return () => {
      cancelled = true;
    };
  }, [code]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const codeCheck = RoomCodeSchema.safeParse(code);
    if (!codeCheck.success) return setError(codeCheck.error.issues[0]!.message);
    const nameCheck = PlayerNameSchema.safeParse(name);
    if (!nameCheck.success) return setError(nameCheck.error.issues[0]!.message);
    const result = await join({ code, name: nameCheck.data, avatar });
    if (!result.ok) return setError(result.error);
    navigate(`/play/${code}`);
  };

  return (
    <main className="mx-auto flex min-h-full max-w-2xl flex-col justify-center gap-6 px-5 py-8">
      <Logo />
      <Panel className="p-6 sm:p-8">
        <form onSubmit={submit} className="space-y-6" noValidate>
          <div>
            <h1 className="font-display text-4xl font-black">Entrar na sala</h1>
            <p className="mt-1 text-sm text-fg/60">Sem cadastro. Escolha um nome e um avatar.</p>
          </div>

          <Field
            label="Código da sala"
            htmlFor="room-code"
            hint={room && 'title' in room ? `Sala: ${room.title}` : undefined}
            error={room && 'error' in room ? room.error : null}
          >
            <Input
              id="room-code"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000000"
              value={code}
              maxLength={6}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="h-16 text-center font-display text-4xl font-extrabold tracking-[0.3em] tabular"
            />
          </Field>

          <Field label="Seu nome" htmlFor="player-name" hint="Como a turma vai ver você no placar.">
            <Input id="player-name" value={name} maxLength={24} autoComplete="nickname" onChange={(e) => setName(e.target.value)} placeholder="Ex.: Ana" />
          </Field>

          <div className="space-y-2">
            <span className="block text-sm font-bold text-fg/80">Avatar</span>
            <AvatarPicker value={avatar} onChange={setAvatar} />
          </div>

          {error && (
            <p role="alert" className="rounded-lg bg-tomato/10 px-3 py-2 text-sm font-semibold text-tomato">
              {error}
            </p>
          )}

          <div className="flex items-end gap-4">
            <Pedestal avatar={avatar} size={72} />
            <Button type="submit" variant="primary" size="lg" className="flex-1" loading={status === 'joining'}>
              Entrar
            </Button>
          </div>
        </form>
      </Panel>
    </main>
  );
}
