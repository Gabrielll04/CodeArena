import { motion, useReducedMotion } from 'framer-motion';
import type { AvatarId } from '@codearena/schemas';
import { Avatar } from './Avatar';
import { IsoBox, project, sceneBox } from './iso';

/** Avatar em pé sobre um bloco isométrico. Pula de leve quando o avatar muda. */
export function Pedestal({ avatar, size = 96, color = '#2C47F0' }: { avatar: AvatarId; size?: number; color?: string }) {
  const reduce = useReducedMotion();
  const unit = 40;
  const box = sceneBox(1.5, 1.5, 0.6, unit, 2);
  const top = project(0.75, 0.75, 0.6, unit);
  const avatarSize = unit * 1.7;
  const [minX, minY, width, height] = box.viewBox.split(' ').map(Number) as [number, number, number, number];
  const viewTop = minY - avatarSize + 6;
  const viewHeight = height + avatarSize - 6;
  return (
    <svg viewBox={`${minX} ${viewTop} ${width} ${viewHeight}`} width={size} height={(size * viewHeight) / width} className="overflow-visible" aria-hidden>
      <IsoBox unit={unit} w={1.5} d={1.5} h={0.6} color={color} />
      <motion.g
        key={avatar}
        initial={reduce ? false : { y: -26, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 520, damping: 18 }}
      >
        <g transform={`translate(${top.x - avatarSize / 2} ${top.y - avatarSize + 8})`}>
          <Avatar id={avatar} size={avatarSize} />
        </g>
      </motion.g>
    </svg>
  );
}
