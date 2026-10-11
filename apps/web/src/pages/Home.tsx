import { motion } from 'framer-motion';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HeroDemo } from '../components/HeroDemo';
import { Logo } from '../components/Logo';
import { Button, Input } from '../components/ui';

const STEPS = [
  { title: 'O professor abre a sala', text: 'Escolhe um pack de questões e mostra o código de 6 dígitos para a turma.' },
  { title: 'A turma escreve o código', text: 'Cada item da checklist marca sozinho e vira um bloco da torre.' },
  { title: 'O servidor confere', text: 'Com a torre completa, a resposta é validada de novo e vale XP. Quem termina antes ganha mais.' },
];

export function HomePage() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');

  return (
    <main className="mx-auto flex min-h-full max-w-6xl flex-col px-5 py-6 sm:py-8">
      <header className="flex items-center justify-between gap-4">
        <Logo />
        <Link to="/teacher" className="rounded-lg px-3 py-2 text-sm font-bold text-fg/70 transition hover:bg-fg/[0.06] hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalt">
          Área do professor
        </Link>
      </header>

      <section className="grid flex-1 items-center gap-10 py-10 md:grid-cols-[1.1fr_1fr] md:gap-14 md:py-14">
        <motion.div className="min-w-0" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <h1 className="font-display text-[2.5rem] font-black leading-[0.98] sm:text-5xl lg:text-[3.2rem]">
            Escreva o código.
            <br />
            A checklist confere.
            <br />
            <span className="text-cobalt">A torre sobe.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg leading-relaxed text-fg/70">
            Desafios de programação ao vivo para a turma inteira, conferidos automaticamente enquanto cada aluno digita.
          </p>

          <form
            className="mt-8 max-w-md"
            onSubmit={(event) => {
              event.preventDefault();
              navigate(`/join${code ? `?code=${code}` : ''}`);
            }}
          >
            <label htmlFor="home-room-code" className="mb-2 block text-sm font-bold text-fg/80">
              Código da sala
            </label>
            <div className="flex gap-2">
              <Input
                id="home-room-code"
                inputMode="numeric"
                autoComplete="off"
                placeholder="000000"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="h-14 flex-1 text-center font-display text-3xl font-extrabold tracking-[0.3em] tabular"
              />
              <Button type="submit" variant="primary" size="lg">
                Entrar
              </Button>
            </div>
          </form>
        </motion.div>

        <motion.div className="min-w-0" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}>
          <HeroDemo />
        </motion.div>
      </section>

      <ol className="grid gap-6 border-t border-fg/10 pt-6 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <p className="font-display text-sm font-extrabold text-cobalt">Passo {i + 1}</p>
            <p className="mt-1 font-bold">{step.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-fg/65">{step.text}</p>
          </li>
        ))}
      </ol>
    </main>
  );
}
