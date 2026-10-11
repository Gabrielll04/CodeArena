import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
  forwardRef,
  useEffect,
  useId,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ink';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  // Botões com borda inferior funda: parecem blocos e "afundam" ao clicar.
  primary: 'bg-[#2C47F0] text-white shadow-[0_3px_0_0_#1B2FB0] hover:bg-[#3953FF] active:translate-y-[2px] active:shadow-[0_1px_0_0_#1B2FB0]',
  ink: 'bg-ink text-white shadow-[0_3px_0_0_#05060D] hover:bg-ink-700 active:translate-y-[2px] active:shadow-[0_1px_0_0_#05060D]',
  secondary:
    'bg-surface text-fg ring-1 ring-inset ring-fg/15 shadow-[0_2px_0_0_rgb(var(--fg)/0.12)] hover:bg-fg/[0.04] active:translate-y-[1px] active:shadow-none',
  ghost: 'text-fg/70 hover:bg-fg/[0.06] hover:text-fg',
  danger: 'bg-tomato/10 text-tomato ring-1 ring-inset ring-tomato/30 hover:bg-tomato/15',
};
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-lg gap-2',
  lg: 'h-14 px-6 text-base rounded-xl gap-2.5',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }
>(function Button({ variant = 'secondary', size = 'md', loading, className, children, disabled, ...props }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        'inline-flex select-none items-center justify-center font-bold transition duration-100 disabled:pointer-events-none disabled:opacity-40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Panel({ className, children, ...props }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-2xl border border-fg/[0.09] bg-surface shadow-panel', className)} {...props}>
      {children}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-bold text-fg/80">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-tomato">{error}</p> : hint ? <p className="text-xs text-fg/55">{hint}</p> : null}
    </div>
  );
}

const inputBase =
  'w-full min-w-0 rounded-lg bg-surface px-3 py-2 text-fg placeholder:text-fg/40 ring-1 ring-inset ring-fg/20 outline-none transition focus:ring-2 focus:ring-cobalt disabled:opacity-50';

/** Tamanho de texto padrão dos campos, só quando a chamada não define outro (as classes não se sobrepõem). */
const inputSize = (className?: string) => (/(^|\s)text-(xs|sm|base|lg|\d?xl|\[)/.test(className ?? '') ? '' : 'text-sm');

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cx(inputBase, inputSize(className), className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cx(inputBase, inputSize(className), 'min-h-[80px] resize-y', className)} {...props} />;
});

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputBase, inputSize(className), 'appearance-none pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, description, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string; id?: string }) {
  const autoId = useId();
  const inputId = id ?? autoId;
  return (
    <label htmlFor={inputId} className="flex cursor-pointer items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium text-fg">{label}</span>
        {description && <span className="block text-xs text-fg/60">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={inputId} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-fg/10 ring-1 ring-fg/10 transition peer-checked:bg-cobalt peer-focus-visible:ring-2 peer-focus-visible:ring-cobalt" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
    </label>
  );
}

const BADGE_TONES = {
  neutral: 'bg-fg/[0.06] text-fg/75 ring-fg/10',
  mint: 'bg-mint/10 text-mint ring-mint/25',
  cobalt: 'bg-cobalt/10 text-cobalt ring-cobalt/25',
  tomato: 'bg-tomato/10 text-tomato ring-tomato/25',
  sky: 'bg-sky/10 text-sky-deep ring-sky/30',
  sun: 'bg-sun-soft text-sun-deep ring-sun/40',
} as const;

export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof BADGE_TONES; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ring-1 ring-inset', BADGE_TONES[tone], className)}>
      {children}
    </span>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean | 'full';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Portal em document.body: ancestrais com backdrop-filter/transform (ex.: a barra superior)
  // viram o "containing block" de elementos fixed e prenderiam o diálogo dentro deles.
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
        >
          <div className="absolute inset-0 bg-ink/45" onClick={onClose} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className={cx(
              'relative flex max-h-full w-full flex-col overflow-hidden rounded-2xl border border-fg/10 bg-surface shadow-lift',
              wide === 'full' ? 'h-full max-w-[1500px]' : wide ? 'max-w-3xl' : 'max-w-lg',
            )}
          >
            <div className="flex items-center justify-between border-b border-fg/[0.07] px-5 py-4">
              <h2 className="font-display text-lg font-bold">{title}</h2>
              <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-fg/60 hover:bg-fg/10 hover:text-fg">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-fg/[0.07] px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-fg/20 p-8 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-fg/60">{children}</div>}
    </div>
  );
}

export function Icon({ name, className = 'h-4 w-4' }: { name: 'check' | 'arrow-up' | 'arrow-down' | 'sound' | 'mute' | 'plus' | 'trash' | 'copy' | 'download' | 'upload' | 'play' | 'stop' | 'up' | 'down' | 'eye' | 'warning' | 'bolt' | 'back' | 'link'; className?: string }) {
  const paths: Record<typeof name, ReactNode> = {
    check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
    'arrow-up': <path d="M12 19V5m-6 6 6-6 6 6" />,
    'arrow-down': <path d="M12 5v14m6-6-6 6-6-6" />,
    sound: (
      <>
        <path d="M4 10v4h4l5 4V6L8 10H4z" />
        <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />
      </>
    ),
    mute: (
      <>
        <path d="M4 10v4h4l5 4V6L8 10H4z" />
        <path d="m17 9 5 6m0-6-5 6" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    trash: <path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
    copy: (
      <>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15V5a1 1 0 0 1 1-1h9" />
      </>
    ),
    download: <path d="M12 4v11m-5-5 5 5 5-5M5 20h14" />,
    upload: <path d="M12 16V5m-5 5 5-5 5 5M5 20h14" />,
    play: <path d="M7 5v14l12-7z" />,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    up: <path d="m6 15 6-6 6 6" />,
    down: <path d="m6 9 6 6 6-6" />,
    eye: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    warning: <path d="M12 9v4m0 4h.01M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />,
    bolt: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
    back: <path d="M19 12H5m6-6-6 6 6 6" />,
    link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />,
  };
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
}
