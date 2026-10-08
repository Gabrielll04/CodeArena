/** Mensagens trocadas entre o app e o iframe isolado do preview. */
export const PREVIEW_CHANNEL = 'codearena-rn-preview';

export interface PreviewError {
  kind: 'syntax' | 'runtime' | 'export' | 'module';
  message: string;
  line?: number | null;
}

export type ToSandboxMessage = { channel: typeof PREVIEW_CHANNEL; type: 'render'; id: number; code: string };

export type FromSandboxMessage =
  | { channel: typeof PREVIEW_CHANNEL; type: 'ready' }
  | { channel: typeof PREVIEW_CHANNEL; type: 'result'; id: number; ok: true }
  | { channel: typeof PREVIEW_CHANNEL; type: 'result'; id: number; ok: false; error: PreviewError }
  | { channel: typeof PREVIEW_CHANNEL; type: 'runtime-error'; error: PreviewError };
