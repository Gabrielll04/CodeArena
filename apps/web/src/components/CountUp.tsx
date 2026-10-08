import { animate, useMotionValue, useTransform, motion, useReducedMotion } from 'framer-motion';
import { useEffect } from 'react';

export function CountUp({ value, from = 0, duration = 0.9, className }: { value: number; from?: number; duration?: number; className?: string }) {
  const reduced = useReducedMotion();
  const motionValue = useMotionValue(from);
  const text = useTransform(motionValue, (v) => Math.round(v).toLocaleString('pt-BR'));
  useEffect(() => {
    if (reduced) {
      motionValue.set(value);
      return;
    }
    const controls = animate(motionValue, value, { duration, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [value, duration, motionValue, reduced]);
  return <motion.span className={className}>{text}</motion.span>;
}
