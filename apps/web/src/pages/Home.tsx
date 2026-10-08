import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { Button, Input, Panel } from '../components/ui';

const STEPS = [
  { title: 'Desafio', text: 'O professor abre uma sala com questões de código.' },
  { title: 'Checklist', text: 'Cada item marca sozinho conforme você escreve.' },
  { title: 'XP', text: 'Resposta completa e rápida vale mais pontos.' },
];

export function HomePage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');

  return (
    <main className="mx-auto flex min-h-full max-w-5xl flex-col justify-center gap-10 px-5 py-10">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
        <Logo size="lg" />
        <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-6xl">
          Escreva o código.
          <br />
          <span className="text-lime">A checklist confirma.</span> O relógio decide.
        </h1>
        <p className="max-w-xl text-lg text-white/60">Desafios de programação ao vivo para a turma inteira, validados automaticamente.</p>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel className="p-6">
          <h2 className="font-display text-xl font-bold">Entrar em uma sala</h2>
          <p className="mt-1 text-sm text-white/50">Digite o código de 6 dígitos que o professor mostrou.</p>
          <form
            className="mt-5 flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              navigate(`/join${code ? `?code=${code}` : ''}`);
            }}
          >
            <Input
              aria-label="Código da sala"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000000"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="h-14 flex-1 text-center font-mono text-2xl tracking-[0.4em]"
            />
            <Button type="submit" variant="primary" size="lg">
              Entrar
            </Button>
          </form>
        </Panel>
        <Panel className="flex flex-col p-6">
          <h2 className="font-display text-xl font-bold">Área do professor</h2>
          <p className="mt-1 text-sm text-white/50">Importe ou crie questões, abra uma sala e acompanhe a turma.</p>
          <div className="mt-auto pt-5">
            <Link to="/teacher">
              <Button variant="violet" size="lg" className="w-full">
                Abrir biblioteca de questões
              </Button>
            </Link>
          </div>
        </Panel>
      </div>

      <ol className="grid gap-3 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3 rounded-2xl border border-white/[0.06] p-4">
            <span className="font-mono text-sm font-bold text-lime">0{i + 1}</span>
            <span>
              <span className="block font-semibold">{step.title}</span>
              <span className="text-sm text-white/50">{step.text}</span>
            </span>
          </li>
        ))}
      </ol>
    </main>
  );
}
