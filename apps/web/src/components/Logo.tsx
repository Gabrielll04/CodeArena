import { motion, useReducedMotion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { IsoBox, sceneBox } from './iso';

/** Marca: um bloco cobalto com um bloco menor por cima, que pula ao passar o mouse. */
export function LogoMark({ size = 32 }: { size?: number }) {
  const reduce = useReducedMotion();
  const unit = 16;
  const box = sceneBox(1.6, 1.6, 2.15, unit, 2);
  return (
    <svg viewBox={box.viewBox} width={size} height={(size * box.height) / box.width} className="overflow-visible" aria-hidden>
      <IsoBox unit={unit} w={1.6} d={1.6} h={1.1} color="#2C47F0" />
      <motion.g variants={reduce ? undefined : { rest: { y: 0 }, hover: { y: -5 } }} transition={{ type: 'spring', stiffness: 600, damping: 14 }}>
        <IsoBox unit={unit} x={0.45} y={0.45} z={1.1} w={0.7} d={0.7} h={0.7} color="#FFB21E" />
      </motion.g>
    </svg>
  );
}

export function Logo({ to = '/', size = 'md' }: { to?: string; size?: 'md' | 'lg' }) {
  const big = size === 'lg';
  return (
    <motion.span initial="rest" animate="rest" whileHover="hover" className="inline-flex">
      <Link to={to} className="inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt" aria-label="CodeArena, início">
        <LogoMark size={big ? 44 : 28} />
        <span className={`font-display font-extrabold ${big ? 'text-3xl' : 'text-lg'}`}>CodeArena</span>
      </Link>
    </motion.span>
  );
}
