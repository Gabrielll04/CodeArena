import { useId } from 'react';
import type { AvatarId } from '@codearena/schemas';
import { cx } from './ui';

type Shape = 'circle' | 'squircle' | 'hex' | 'diamond' | 'shield' | 'blob';
type Eyes = 'dots' | 'visor' | 'cyclops' | 'slits' | 'pixel';
type Mark = 'antenna' | 'ears' | 'crest' | 'bolt' | 'none' | 'horns';

interface AvatarDesign {
  label: string;
  shape: Shape;
  from: string;
  to: string;
  eyes: Eyes;
  mark: Mark;
}

/** Desenhos fixos por id: formas geométricas com rosto de robô, sem upload. */
export const AVATAR_DESIGNS: Record<AvatarId, AvatarDesign> = {
  bolt: { label: 'Bolt', shape: 'squircle', from: '#3FD9A0', to: '#12A877', eyes: 'visor', mark: 'bolt' },
  prism: { label: 'Prism', shape: 'diamond', from: '#2C47F0', to: '#5CC8F2', eyes: 'dots', mark: 'none' },
  orbit: { label: 'Orbit', shape: 'circle', from: '#5CC8F2', to: '#1B2FB0', eyes: 'cyclops', mark: 'antenna' },
  cube: { label: 'Cube', shape: 'squircle', from: '#FFB21E', to: '#F27A2E', eyes: 'pixel', mark: 'ears' },
  wave: { label: 'Wave', shape: 'blob', from: '#5CC8F2', to: '#2C47F0', eyes: 'slits', mark: 'none' },
  spark: { label: 'Spark', shape: 'hex', from: '#E8492C', to: '#FFB21E', eyes: 'dots', mark: 'crest' },
  hex: { label: 'Hex', shape: 'hex', from: '#2C47F0', to: '#E8492C', eyes: 'visor', mark: 'antenna' },
  comet: { label: 'Comet', shape: 'circle', from: '#F27A2E', to: '#E8492C', eyes: 'slits', mark: 'horns' },
  pixel: { label: 'Pixel', shape: 'squircle', from: '#12A877', to: '#5CC8F2', eyes: 'pixel', mark: 'antenna' },
  nova: { label: 'Nova', shape: 'shield', from: '#FFB21E', to: '#3FD9A0', eyes: 'cyclops', mark: 'crest' },
  gear: { label: 'Gear', shape: 'hex', from: '#9AA3C7', to: '#5A6194', eyes: 'visor', mark: 'ears' },
  drop: { label: 'Drop', shape: 'blob', from: '#1B2FB0', to: '#2C47F0', eyes: 'dots', mark: 'antenna' },
  ring: { label: 'Ring', shape: 'circle', from: '#3FD9A0', to: '#FFB21E', eyes: 'dots', mark: 'ears' },
  leaf: { label: 'Leaf', shape: 'shield', from: '#12A877', to: '#3FD9A0', eyes: 'slits', mark: 'bolt' },
  flare: { label: 'Flare', shape: 'diamond', from: '#E8492C', to: '#2C47F0', eyes: 'cyclops', mark: 'horns' },
  node: { label: 'Node', shape: 'squircle', from: '#5A6194', to: '#5CC8F2', eyes: 'dots', mark: 'crest' },
};

const SHAPES: Record<Shape, string> = {
  circle: 'M32 8a24 24 0 1 1 0 48 24 24 0 0 1 0-48z',
  squircle: 'M32 8c17 0 24 7 24 24s-7 24-24 24S8 49 8 32 15 8 32 8z',
  hex: 'M32 6 54 19v26L32 58 10 45V19z',
  diamond: 'M32 5 58 32 32 59 6 32z',
  shield: 'M32 7c9 4 17 5 23 5v17c0 15-9 25-23 29C18 54 9 44 9 29V12c6 0 14-1 23-5z',
  blob: 'M33 7c13 0 23 9 23 22 0 15-9 27-24 27S8 46 8 31C8 17 19 7 33 7z',
};

function Eyes({ kind }: { kind: Eyes }) {
  switch (kind) {
    case 'visor':
      return (
        <>
          <rect x="17" y="25" width="30" height="12" rx="6" fill="#171B33" />
          <rect x="21" y="29" width="8" height="4" rx="2" fill="#fff" />
          <rect x="35" y="29" width="8" height="4" rx="2" fill="#fff" />
        </>
      );
    case 'cyclops':
      return (
        <>
          <circle cx="32" cy="30" r="9" fill="#171B33" />
          <circle cx="32" cy="30" r="4.5" fill="#fff" />
          <circle cx="33.5" cy="28.5" r="1.5" fill="#171B33" />
        </>
      );
    case 'slits':
      return (
        <>
          <rect x="19" y="28" width="10" height="4" rx="2" fill="#171B33" />
          <rect x="35" y="28" width="10" height="4" rx="2" fill="#171B33" />
        </>
      );
    case 'pixel':
      return (
        <>
          <rect x="20" y="25" width="8" height="8" fill="#171B33" />
          <rect x="36" y="25" width="8" height="8" fill="#171B33" />
          <rect x="22" y="27" width="3" height="3" fill="#fff" />
          <rect x="38" y="27" width="3" height="3" fill="#fff" />
        </>
      );
    default:
      return (
        <>
          <circle cx="24" cy="30" r="4.5" fill="#171B33" />
          <circle cx="40" cy="30" r="4.5" fill="#171B33" />
          <circle cx="25.3" cy="28.7" r="1.4" fill="#fff" />
          <circle cx="41.3" cy="28.7" r="1.4" fill="#fff" />
        </>
      );
  }
}

function Mark({ kind, color }: { kind: Mark; color: string }) {
  switch (kind) {
    case 'antenna':
      return (
        <>
          <path d="M32 9V2" stroke={color} strokeWidth="3" strokeLinecap="round" />
          <circle cx="32" cy="2.5" r="2.5" fill={color} />
        </>
      );
    case 'ears':
      return (
        <>
          <rect x="2" y="26" width="6" height="12" rx="3" fill={color} />
          <rect x="56" y="26" width="6" height="12" rx="3" fill={color} />
        </>
      );
    case 'crest':
      return <path d="M24 10 32 2l8 8" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />;
    case 'bolt':
      return <path d="M35 1 28 10h5l-2 6 7-9h-5z" fill={color} />;
    case 'horns':
      return (
        <>
          <path d="M18 14 12 4l10 6" fill={color} />
          <path d="M46 14 52 4l-10 6" fill={color} />
        </>
      );
    default:
      return null;
  }
}

export function Avatar({ id, size = 40, className, title }: { id: AvatarId; size?: number; className?: string; title?: string }) {
  const design = AVATAR_DESIGNS[id] ?? AVATAR_DESIGNS.bolt;
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cx('shrink-0 overflow-visible', className)}
      role="img"
      aria-label={title ?? `Avatar ${design.label}`}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={design.from} />
          <stop offset="1" stopColor={design.to} />
        </linearGradient>
      </defs>
      <Mark kind={design.mark} color={design.to} />
      <path d={SHAPES[design.shape]} fill={`url(#${gradientId})`} />
      <path d={SHAPES[design.shape]} fill="none" stroke="#fff" strokeOpacity=".18" strokeWidth="1.5" />
      <Eyes kind={design.eyes} />
      <rect x="27" y="42" width="10" height="3" rx="1.5" fill="#171B33" opacity=".55" />
    </svg>
  );
}
