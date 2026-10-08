import { Fragment } from 'react';

/** Renderiza o enunciado como texto, destacando trechos entre crases como código. Sem HTML do conteúdo. */
export function Prompt({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <p className={className ?? 'whitespace-pre-wrap text-[15px] leading-relaxed text-white/90'}>
      {parts.map((part, i) =>
        part.startsWith('`') && part.endsWith('`') && part.length > 2 ? (
          <code key={i} className="rounded-md bg-white/[0.08] px-1.5 py-0.5 font-mono text-[0.9em] text-lime">
            {part.slice(1, -1)}
          </code>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </p>
  );
}
