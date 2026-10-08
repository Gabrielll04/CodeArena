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

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'violet';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-lime text-ink-950 hover:brightness-110 shadow-[0_8px_24px_-12px_rgba(185,255,59,.7)]',
  violet: 'bg-violet text-white hover:brightness-110 shadow-[0_8px_24px_-12px_rgba(140,97,255,.8)]',
  secondary: 'bg-white/[0.07] text-white ring-1 ring-white/10 hover:bg-white/[0.12]',
  ghost: 'text-white/70 hover:bg-white/[0.06] hover:text-white',
  danger: 'bg-coral/15 text-coral ring-1 ring-coral/30 hover:bg-coral/25',
};
const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-10 px-4 text-sm rounded-xl gap-2',
  lg: 'h-14 px-6 text-base rounded-2xl gap-2.5',
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
        'inline-flex select-none items-center justify-center font-semibold transition duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-900',
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
    <div className={cx('rounded-2xl border border-white/[0.07] bg-ink-850/80 shadow-panel backdrop-blur', className)} {...props}>
      {children}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-semibold uppercase tracking-wider text-white/55">
        {label}
      </label>
      {children}
      {error ? <p className="text-xs text-coral">{error}</p> : hint ? <p className="text-xs text-white/40">{hint}</p> : null}
    </div>
  );
}

const inputBase =
  'w-full rounded-xl bg-ink-950/60 px-3 py-2 text-sm text-white placeholder:text-white/25 ring-1 ring-white/10 outline-none transition focus:ring-2 focus:ring-lime/60 disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cx(inputBase, className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...props },
  ref,
) {
  return <textarea ref={ref} className={cx(inputBase, 'min-h-[80px] resize-y', className)} {...props} />;
});

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputBase, 'appearance-none pr-8', className)} {...props}>
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
        <span className="block text-sm font-medium text-white">{label}</span>
        {description && <span className="block text-xs text-white/45">{description}</span>}
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input id={inputId} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
        <span className="h-6 w-11 rounded-full bg-white/10 ring-1 ring-white/10 transition peer-checked:bg-lime/80 peer-focus-visible:ring-2 peer-focus-visible:ring-lime" />
        <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5 peer-checked:bg-ink-950" />
      </span>
    </label>
  );
}

const BADGE_TONES = {
  neutral: 'bg-white/[0.07] text-white/70 ring-white/10',
  lime: 'bg-lime-soft text-lime ring-lime/25',
  violet: 'bg-violet-soft text-[#C3ADFF] ring-violet/30',
  coral: 'bg-coral-soft text-coral ring-coral/30',
  cyan: 'bg-cyan-soft text-cyan ring-cyan/30',
  amber: 'bg-amber-soft text-amber ring-amber/30',
} as const;

export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof BADGE_TONES; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1', BADGE_TONES[tone], className)}>
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
          <div className="absolute inset-0 bg-ink-950/85" onClick={onClose} aria-hidden />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className={cx(
              'relative flex max-h-full w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-ink-850 shadow-2xl',
              wide === 'full' ? 'h-full max-w-[1500px]' : wide ? 'max-w-3xl' : 'max-w-lg',
            )}
          >
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <h2 className="font-display text-lg font-bold">{title}</h2>
              <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-white/50 hover:bg-white/10 hover:text-white">
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
            {footer && <div className="flex justify-end gap-2 border-t border-white/[0.07] px-5 py-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 p-8 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <div className="mt-2 text-sm text-white/50">{children}</div>}
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
