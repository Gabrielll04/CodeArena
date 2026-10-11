import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { IsoMark, IsoTower } from './iso';
import { cx } from './ui';

const STEPS = [
  { label: 'Importar Text e View', line: "import { Text, View } from 'react-native';" },
  { label: 'Exportar o componente App', line: 'export default function App() {' },
  { label: 'Mostrar o texto "Olá, turma"', line: '  return <Text>Olá, turma</Text>;' },
];

/**
 * Demonstração da mecânica na página inicial: o código aparece, a checklist marca sozinha e a torre sobe.
 * Roda sozinha em ciclo; ao clicar num item, o visitante assume o controle.
 */
export function HeroDemo() {
  const reduce = useReducedMotion();
  const [done, setDone] = useState<boolean[]>(() => STEPS.map((_, i) => Boolean(reduce) || i === 0));
  const [auto, setAuto] = useState(!reduce);
  const count = done.filter(Boolean).length;
  const complete = count === STEPS.length;

  useEffect(() => {
    if (!auto) return;
    const timer = setTimeout(
      () => setDone((current) => (current.every(Boolean) ? STEPS.map(() => false) : current.map((value, i) => value || i === current.indexOf(false)))),
      complete ? 2600 : count === 0 ? 900 : 1400,
    );
    return () => clearTimeout(timer);
  }, [auto, done, complete, count]);

  const toggle = (index: number) => {
    setAuto(false);
    setDone((current) => current.map((value, i) => (i === index ? !value : value)));
  };

  const lines = [
    done[0] && { key: 'import', text: STEPS[0]!.line },
    done[0] && { key: 'blank', text: '' },
    done[1] && { key: 'open', text: STEPS[1]!.line },
    done[2] && { key: 'body', text: STEPS[2]!.line },
    done[1] && { key: 'close', text: '}' },
  ].filter(Boolean) as { key: string; text: string }[];

  return (
    <div className="relative rounded-2xl border border-fg/10 bg-surface p-3 shadow-lift" aria-label="Demonstração: a checklist acompanha o código">
      <div className="workbench overflow-hidden rounded-xl">
        <div className="flex items-center justify-between border-b border-fg/[0.08] px-4 py-2 font-mono text-xs text-fg/60">
          <span>App.tsx</span>
          <span>{auto ? 'demonstração' : 'você no controle'}</span>
        </div>
        <pre className="h-44 overflow-hidden sm:h-[9.5rem] whitespace-pre-wrap break-words px-4 py-3 font-mono text-[12px] leading-6 text-fg/90 sm:text-[13px]" aria-hidden>
          <AnimatePresence initial={false}>
            {lines.map((line) => (
              <motion.div key={line.key} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {line.text || ' '}
              </motion.div>
            ))}
          </AnimatePresence>
          <span className="inline-block h-4 w-[2px] translate-y-[3px] animate-pulse bg-sun" />
        </pre>
      </div>

      <div className="flex items-center gap-4 px-2 pb-1 pt-4">
        <ul className="min-w-0 flex-1 space-y-1">
          {STEPS.map((step, i) => (
            <li key={step.label}>
              <button
                type="button"
                aria-pressed={done[i]}
                onClick={() => toggle(i)}
                className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm transition hover:bg-fg/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt"
              >
                <IsoMark done={Boolean(done[i])} />
                <span className={cx(done[i] ? 'text-fg' : 'text-fg/60')}>{step.label}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="relative flex shrink-0 flex-col items-center">
          <AnimatePresence>
            {complete && (
              <motion.span
                initial={{ opacity: 0, y: 8, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.25 }}
                className="absolute -top-9 whitespace-nowrap rounded-md bg-sun px-2 py-0.5 font-mono text-sm font-bold text-ink"
              >
                +840 XP
              </motion.span>
            )}
          </AnimatePresence>
          <IsoTower total={STEPS.length} done={count} complete={complete} width={104} />
        </div>
      </div>
    </div>
  );
}
