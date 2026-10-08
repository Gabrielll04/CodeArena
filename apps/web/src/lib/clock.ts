import { useEffect, useState } from 'react';

/** Diferença entre o relógio do servidor e o local. Atualizada a cada snapshot recebido. */
let offsetMs = 0;

export function syncServerClock(serverNow: number): void {
  offsetMs = serverNow - Date.now();
}

export function serverNow(): number {
  return Date.now() + offsetMs;
}

/** Re-renderiza periodicamente enquanto `active`, devolvendo o horário do servidor. */
export function useServerNow(active: boolean, intervalMs = 200): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    if (!active) return;
    setNow(serverNow());
    const timer = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs]);
  return now;
}
