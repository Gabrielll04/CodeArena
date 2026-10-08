import { Link } from 'react-router-dom';

export function Logo({ to = '/', size = 'md' }: { to?: string; size?: 'md' | 'lg' }) {
  const big = size === 'lg';
  return (
    <Link to={to} className="group inline-flex items-center gap-2.5" aria-label="CodeArena, início">
      <svg viewBox="0 0 64 64" className={big ? 'h-12 w-12' : 'h-8 w-8'} aria-hidden>
        <rect width="64" height="64" rx="16" fill="#151933" />
        <path d="M24 20 12 32l12 12" fill="none" stroke="#B9FF3B" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m40 20 12 12-12 12" fill="none" stroke="#8C61FF" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="32" cy="32" r="4" fill="#fff" className="origin-center transition group-hover:scale-125" />
      </svg>
      <span className={`font-display font-bold tracking-tight ${big ? 'text-4xl' : 'text-lg'}`}>
        Code<span className="text-lime">Arena</span>
      </span>
    </Link>
  );
}
