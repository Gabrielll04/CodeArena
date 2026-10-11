import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Spinner } from './components/ui';
import { HomePage } from './pages/Home';
import { JoinPage } from './pages/Join';
import { NotFoundPage } from './pages/NotFound';

const PlayPage = lazy(() => import('./pages/Play').then((m) => ({ default: m.PlayPage })));
const TeacherPage = lazy(() => import('./pages/Teacher').then((m) => ({ default: m.TeacherPage })));
const PackEditorPage = lazy(() => import('./pages/PackEditor').then((m) => ({ default: m.PackEditorPage })));
const HostPage = lazy(() => import('./pages/Host').then((m) => ({ default: m.HostPage })));

function Loading() {
  return (
    <div className="flex h-full items-center justify-center gap-2 text-fg/60">
      <Spinner className="h-5 w-5" /> Carregando
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/play/:code" element={<PlayPage />} />
        <Route path="/teacher" element={<TeacherPage />} />
        <Route path="/teacher/packs/new" element={<PackEditorPage />} />
        <Route path="/teacher/packs/:id/edit" element={<PackEditorPage />} />
        <Route path="/host/:code" element={<HostPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
