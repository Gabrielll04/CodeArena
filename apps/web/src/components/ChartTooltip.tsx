import { createPortal } from 'react-dom';
import { useCallback, useState, type FocusEvent, type MouseEvent, type ReactNode } from 'react';

interface TooltipState {
  content: ReactNode;
  left: number;
  top: number;
}

/**
 * Dica dos gráficos: aparece no hover e no foco do teclado, acima da marca. Ela só repete o que também está na tabela
 * ou nos rótulos, nunca é o único lugar de um valor.
 */
export function useChartTooltip() {
  const [state, setState] = useState<TooltipState | null>(null);

  const show = useCallback((event: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, content: ReactNode) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setState({ content, left: rect.left + rect.width / 2, top: rect.top });
  }, []);
  const hide = useCallback(() => setState(null), []);

  const bind = (content: ReactNode) => ({
    onMouseEnter: (event: MouseEvent<HTMLElement>) => show(event, content),
    onFocus: (event: FocusEvent<HTMLElement>) => show(event, content),
    onMouseLeave: hide,
    onBlur: hide,
  });

  const tooltip = state
    ? createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 max-w-xs -translate-x-1/2 -translate-y-full rounded-xl border border-white/10 bg-ink-800 px-3 py-2 text-xs text-white/80 shadow-2xl"
          style={{ left: Math.min(Math.max(state.left, 170), window.innerWidth - 170), top: state.top - 8 }}
        >
          {state.content}
        </div>,
        document.body,
      )
    : null;

  return { bind, tooltip };
}
