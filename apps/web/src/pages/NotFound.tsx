import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';

export function NotFoundPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
      <Logo />
      <p className="font-display text-2xl font-bold">Página não encontrada</p>
      <Link to="/" className="text-mint underline-offset-4 hover:underline">
        Voltar ao início
      </Link>
    </div>
  );
}
