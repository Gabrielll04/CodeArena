import type { ReactNode } from 'react';
import { useSound } from '../lib/sound';
import { Logo } from './Logo';
import { Icon } from './ui';

export function SoundToggle() {
  const { enabled, toggle } = useSound();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      aria-label={enabled ? 'Desligar sons' : 'Ligar sons'}
      title={enabled ? 'Sons ligados' : 'Sons desligados'}
      className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
    >
      <Icon name={enabled ? 'sound' : 'mute'} className="h-5 w-5" />
    </button>
  );
}

export function TopBar({ children, right, logoTo = '/' }: { children?: ReactNode; right?: ReactNode; logoTo?: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-white/[0.07] bg-ink-900/80 px-4 backdrop-blur">
      <Logo to={logoTo} />
      <div className="flex min-w-0 flex-1 items-center gap-4">{children}</div>
      <div className="flex items-center gap-2">
        {right}
        <SoundToggle />
      </div>
    </header>
  );
}

export function ConnectionBanner({ connected }: { connected: boolean }) {
  if (connected) return null;
  return (
    <div role="status" className="bg-amber/15 px-4 py-1.5 text-center text-xs font-semibold text-amber">
      Conexão perdida. Reconectando; seu progresso está salvo no servidor.
    </div>
  );
}
