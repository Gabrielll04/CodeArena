/**
 * Desenho isométrico em SVG. Cada item concluído da checklist vira um bloco: a torre do aluno, o medidor do
 * professor, a contagem regressiva e o pódio usam as mesmas peças.
 */
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';
import { cx } from './ui';

const COS30 = Math.sqrt(3) / 2;

export interface Point {
  x: number;
  y: number;
}

/** Projeta um ponto do espaço (x para a direita-frente, y para a esquerda-frente, z para cima). */
export function project(x: number, y: number, z: number, unit: number): Point {
  return { x: (x - y) * COS30 * unit, y: (x + y) * 0.5 * unit - z * unit };
}

const poly = (points: Point[]) => points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

/** Mistura a cor com branco (amount > 0) ou com o tom de tinta (amount < 0). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amount > 0 ? [255, 255, 255] : [23, 27, 51];
  const a = Math.abs(amount);
  const channel = (value: number, i: number) => Math.round(value + (target[i]! - value) * a);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(channel);
  return `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** Cores dos blocos, na ordem em que a torre cresce. */
export const BLOCK_COLORS = ['#2C47F0', '#FFB21E', '#E8492C', '#12A877', '#1690C4'] as const;

/** Caixa que envolve uma cena [0..sx] x [0..sy] x [0..sz], para o viewBox. */
export function sceneBox(sx: number, sy: number, sz: number, unit: number, pad = 2) {
  const corners = [0, sx].flatMap((x) => [0, sy].flatMap((y) => [0, sz].map((z) => project(x, y, z, unit))));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const width = Math.max(...xs) - minX + pad;
  const height = Math.max(...ys) - minY + pad;
  return { viewBox: `${minX.toFixed(1)} ${minY.toFixed(1)} ${width.toFixed(1)} ${height.toFixed(1)}`, width, height };
}

export interface IsoBoxProps {
  x?: number;
  y?: number;
  z?: number;
  w?: number;
  d?: number;
  h?: number;
  unit: number;
  color?: string;
  /** Bloco ainda não construído: só o contorno tracejado. */
  ghost?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Bloco isométrico com três faces visíveis (topo claro, esquerda na cor, direita escura). */
export function IsoBox({ x = 0, y = 0, z = 0, w = 1, d = 1, h = 1, unit, color = BLOCK_COLORS[0], ghost, className, children }: IsoBoxProps) {
  const p = (px: number, py: number, pz: number) => project(px, py, pz, unit);
  const top = [p(x, y, z + h), p(x + w, y, z + h), p(x + w, y + d, z + h), p(x, y + d, z + h)];
  const left = [p(x, y + d, z + h), p(x + w, y + d, z + h), p(x + w, y + d, z), p(x, y + d, z)];
  const right = [p(x + w, y, z + h), p(x + w, y + d, z + h), p(x + w, y + d, z), p(x + w, y, z)];
  if (ghost) {
    return (
      <g className={cx('text-fg', className)} fill="currentColor" fillOpacity={0.035} stroke="currentColor" strokeOpacity={0.28} strokeWidth={1} strokeDasharray="3 3" strokeLinejoin="round">
        <polygon points={poly(top)} />
        <polygon points={poly(left)} />
        <polygon points={poly(right)} />
      </g>
    );
  }
  const edge = shade(color, -0.55);
  return (
    <g className={className} stroke={edge} strokeOpacity={0.5} strokeWidth={1} strokeLinejoin="round">
      <polygon points={poly(left)} fill={color} />
      <polygon points={poly(right)} fill={shade(color, -0.28)} />
      <polygon points={poly(top)} fill={shade(color, 0.32)} />
      {children}
    </g>
  );
}

/** Desloca um grupo para "cair" de cima ao aparecer. Sem animação quando o sistema pede menos movimento. */
export function DropIn({ children, delay = 0, distance = 36 }: { children: ReactNode; delay?: number; distance?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.g
      initial={reduce ? false : { y: -distance, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={reduce ? { opacity: 0 } : { y: -distance / 2, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 520, damping: 24, delay }}
    >
      {children}
    </motion.g>
  );
}

/** Bandeira no topo da torre completa. */
function Flag({ at, unit }: { at: Point; unit: number }) {
  const reduce = useReducedMotion();
  const pole = unit * 0.95;
  return (
    <motion.g
      initial={reduce ? false : { scaleY: 0, opacity: 0 }}
      animate={{ scaleY: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 18, delay: 0.15 }}
      style={{ originX: 0, originY: 1 }}
    >
      <line x1={at.x} y1={at.y} x2={at.x} y2={at.y - pole} stroke="#171B33" strokeWidth={1.6} strokeLinecap="round" />
      <path d={`M${at.x} ${at.y - pole} l${unit * 0.55} ${unit * 0.16} l${-unit * 0.55} ${unit * 0.18} z`} fill="#FFB21E" stroke="#171B33" strokeWidth={1.2} strokeLinejoin="round" />
    </motion.g>
  );
}

export interface IsoTowerProps {
  /** Quantidade de itens obrigatórios (altura final da torre). */
  total: number;
  done: number;
  complete?: boolean;
  /** Largura em pixels; a altura acompanha. */
  width?: number;
  className?: string;
}

/**
 * Torre de progresso: uma camada por item obrigatório. Camadas concluídas caem no lugar; as que faltam aparecem
 * como contorno. Com a checklist completa, uma bandeira sobe no topo.
 */
export function IsoTower({ total, done, complete = false, width = 72, className }: IsoTowerProps) {
  const unit = 22;
  const foot = 1.5;
  const layers = Math.max(1, total);
  const layerH = layers <= 3 ? 0.75 : Math.max(0.3, 2.4 / layers);
  const height = layers * layerH;
  const box = sceneBox(foot, foot, height + 1.1, unit, 3);
  const flagAt = project(foot / 2, foot / 2, height, unit);
  const shown = Math.min(done, layers);
  return (
    <svg viewBox={box.viewBox} width={width} height={(width * box.height) / box.width} className={cx('shrink-0 overflow-visible', className)} aria-hidden>
      <IsoBox unit={unit} w={foot} d={foot} h={0.12} z={-0.12} color="#C9CEDD" />
      {Array.from({ length: layers }, (_, i) => i >= shown && <IsoBox key={`g${i}`} unit={unit} w={foot} d={foot} z={i * layerH} h={layerH} ghost />)}
      <AnimatePresence>
        {Array.from({ length: shown }, (_, i) => (
          <DropIn key={i}>
            <IsoBox unit={unit} w={foot} d={foot} z={i * layerH} h={layerH} color={BLOCK_COLORS[i % BLOCK_COLORS.length]} />
          </DropIn>
        ))}
      </AnimatePresence>
      {complete && <Flag at={flagAt} unit={unit} />}
    </svg>
  );
}

/** Medidor compacto: um cubo por item, lado a lado. Usado no painel do professor para cada aluno. */
export function IsoMeter({ total, done, complete = false, className }: { total: number; done: number; complete?: boolean; className?: string }) {
  const unit = 8;
  const count = Math.max(1, total);
  // Os cubos andam na diagonal x/-y: ficam na mesma profundidade, alinhados na horizontal da tela.
  const step = 1.2;
  const left = project(0, 1, 0, unit).x - 1.5;
  const right = project(1 + (count - 1) * step, -(count - 1) * step, 0, unit).x + 1.5;
  const topY = project(0, 0, 1, unit).y - 1.5;
  const bottomY = project(1, 1, 0, unit).y + 1.5;
  return (
    <svg
      viewBox={`${left} ${topY} ${right - left} ${bottomY - topY}`}
      width={(right - left) * 1.15}
      height={(bottomY - topY) * 1.15}
      className={cx('shrink-0 overflow-visible', className)}
      aria-hidden
    >
      {Array.from({ length: count }, (_, i) =>
        i < done ? (
          <DropIn key={`d${i}`} distance={12}>
            <IsoBox unit={unit} x={i * step} y={-i * step} color={complete ? '#12A877' : '#2C47F0'} />
          </DropIn>
        ) : (
          <IsoBox key={`g${i}`} unit={unit} x={i * step} y={-i * step} ghost />
        ),
      )}
    </svg>
  );
}

/** Cubo pequeno que marca um item da checklist (cheio quando concluído). */
export function IsoMark({ done, color = '#12A877', size = 22 }: { done: boolean; color?: string; size?: number }) {
  const unit = 10;
  const box = sceneBox(1, 1, 1, unit, 1.5);
  return (
    <svg viewBox={box.viewBox} width={size} height={(size * box.height) / box.width} className="shrink-0 overflow-visible" aria-hidden>
      <AnimatePresence initial={false} mode="popLayout">
        {done ? (
          <DropIn key="done" distance={10}>
            <IsoBox unit={unit} color={color} />
          </DropIn>
        ) : (
          <IsoBox key="ghost" unit={unit} ghost />
        )}
      </AnimatePresence>
    </svg>
  );
}

/** Pilha da contagem regressiva: um bloco cai a cada segundo. */
export function IsoCountdownStack({ total, placed }: { total: number; placed: number }) {
  const unit = 30;
  const layers = Math.max(1, total);
  const box = sceneBox(1.4, 1.4, layers * 0.7 + 0.3, unit, 3);
  return (
    <svg viewBox={box.viewBox} width={110} height={(110 * box.height) / box.width} className="overflow-visible" aria-hidden>
      <IsoBox unit={unit} w={1.4} d={1.4} h={0.12} z={-0.12} color="#C9CEDD" />
      {Array.from({ length: layers }, (_, i) => i >= placed && <IsoBox key={`g${i}`} unit={unit} w={1.4} d={1.4} z={i * 0.7} h={0.7} ghost />)}
      <AnimatePresence>
        {Array.from({ length: Math.min(placed, layers) }, (_, i) => (
          <DropIn key={i} distance={60}>
            <IsoBox unit={unit} w={1.4} d={1.4} z={i * 0.7} h={0.7} color={BLOCK_COLORS[i % BLOCK_COLORS.length]} />
          </DropIn>
        ))}
      </AnimatePresence>
    </svg>
  );
}
