import { useState } from 'react';
import { CodeDiff } from './CodeDiff';
import { Badge, Button, Dialog, Icon } from './ui';

export interface DebugBarProps {
  /** Código com bug entregue ao aluno. */
  original: string;
  /** Código atual do editor. */
  current: string;
  language: string;
  readOnly: boolean;
  onRestore: () => void;
}

/** Faixa das questões de depuração: lembra do objetivo, mostra o que o aluno mudou e permite recomeçar. */
export function DebugBar({ original, current, language, readOnly, onRestore }: DebugBarProps) {
  const [diffOpen, setDiffOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const changed = original !== current;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-coral/20 bg-coral/[0.06] px-4 py-2" data-testid="debug-bar">
      <Badge tone="coral">
        <Icon name="warning" className="h-3 w-3" /> Depuração
      </Badge>
      <span className="min-w-0 flex-1 text-xs text-white/70">Este código tem um bug. Descubra o que está errado e corrija.</span>
      <Button size="sm" variant="ghost" disabled={!changed} onClick={() => setDiffOpen(true)} data-testid="debug-diff">
        <Icon name="eye" /> Ver o que mudei
      </Button>
      {confirming ? (
        <span className="flex items-center gap-1.5 text-xs text-white/70">
          Descartar suas alterações?
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              onRestore();
              setConfirming(false);
            }}
            data-testid="debug-restore-confirm"
          >
            Restaurar
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </span>
      ) : (
        <Button size="sm" variant="ghost" disabled={readOnly || !changed} onClick={() => setConfirming(true)} data-testid="debug-restore">
          Restaurar original
        </Button>
      )}

      <Dialog open={diffOpen} onClose={() => setDiffOpen(false)} title="O que você mudou" wide="full">
        <div className="-mx-5 -my-4 flex h-[calc(100vh-11rem)] flex-col px-5 py-4">
          <div className="mb-2 flex justify-between text-[11px] font-semibold uppercase tracking-wider text-white/45">
            <span>Código com bug (original)</span>
            <span>Seu código</span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl ring-1 ring-white/10">
            <CodeDiff original={original} modified={current} language={language} />
          </div>
        </div>
      </Dialog>
    </div>
  );
}
