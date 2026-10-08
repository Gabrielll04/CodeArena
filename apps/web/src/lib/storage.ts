/** Acesso a localStorage/sessionStorage tolerante a navegação privada e bloqueios. */
function safe(storage: () => Storage) {
  return {
    get<T>(key: string): T | null {
      try {
        const raw = storage().getItem(key);
        return raw === null ? null : (JSON.parse(raw) as T);
      } catch {
        return null;
      }
    },
    set(key: string, value: unknown): void {
      try {
        storage().setItem(key, JSON.stringify(value));
      } catch {
        // armazenamento indisponível: o app segue funcionando sem persistência
      }
    },
    remove(key: string): void {
      try {
        storage().removeItem(key);
      } catch {
        // idem
      }
    },
  };
}

export const local = safe(() => window.localStorage);
export const session = safe(() => window.sessionStorage);
