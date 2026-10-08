import { randomBytes } from 'node:crypto';
import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseQuestionPack, resolveQuestions, type QuestionPack, type ValidationIssue } from '@codearena/schemas';

export interface StoredPack {
  id: string;
  source: 'builtin' | 'user';
  createdAt: string;
  updatedAt: string;
  pack: QuestionPack;
}

export interface PackSummary {
  id: string;
  source: 'builtin' | 'user';
  title: string;
  description: string;
  pluginId: string;
  pluginIds: string[];
  version: string;
  tags: string[];
  questionCount: number;
  updatedAt: string;
}

export class PackValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super('Pack inválido');
  }
}

export class PackStoreError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function slugify(text: string): string {
  return (
    text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'pack'
  );
}

const ID_PATTERN = /^[a-z0-9-]{1,80}$/;

/** Armazena packs em arquivos JSON locais (um arquivo por pack). */
export class PackStore {
  private packs = new Map<string, StoredPack>();
  private readonly userDir: string;

  constructor(
    private readonly options: { dataDir: string; contentDir: string; log?: (message: string) => void },
  ) {
    this.userDir = join(options.dataDir, 'packs');
  }

  async init(): Promise<void> {
    await mkdir(this.userDir, { recursive: true });
    await this.loadDir(this.options.contentDir, 'builtin');
    await this.loadDir(this.userDir, 'user');
  }

  private async loadDir(dir: string, source: StoredPack['source']): Promise<void> {
    let files: string[] = [];
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
    } catch {
      return;
    }
    for (const file of files) {
      try {
        const raw = JSON.parse(await readFile(join(dir, file), 'utf8'));
        if (source === 'builtin') {
          const parsed = parseQuestionPack(raw);
          if (!parsed.ok) {
            this.options.log?.(`Pack de exemplo inválido ignorado (${file}): ${parsed.issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`);
            continue;
          }
          const id = `exemplo-${file.replace(/\.json$/, '')}`;
          const now = new Date(0).toISOString();
          this.packs.set(id, { id, source, createdAt: now, updatedAt: now, pack: parsed.value });
        } else {
          const parsed = parseQuestionPack(raw.pack);
          if (!parsed.ok || typeof raw.id !== 'string') continue;
          this.packs.set(raw.id, { ...raw, source: 'user', pack: parsed.value });
        }
      } catch (err) {
        this.options.log?.(`Falha ao ler ${file}: ${(err as Error).message}`);
      }
    }
  }

  list(): PackSummary[] {
    return [...this.packs.values()]
      .map((stored) => {
        const { pack } = stored;
        return {
          id: stored.id,
          source: stored.source,
          title: pack.pack.title,
          description: pack.pack.description,
          pluginId: pack.pack.pluginId,
          pluginIds: [...new Set(resolveQuestions(pack).map((q) => q.pluginId))],
          version: pack.pack.version,
          tags: pack.pack.tags,
          questionCount: pack.questions.length,
          updatedAt: stored.updatedAt,
        };
      })
      .sort((a, b) => (a.source === b.source ? a.title.localeCompare(b.title, 'pt-BR') : a.source === 'user' ? -1 : 1));
  }

  get(id: string): StoredPack | undefined {
    return this.packs.get(id);
  }

  async create(input: unknown): Promise<StoredPack> {
    const parsed = parseQuestionPack(input);
    if (!parsed.ok) throw new PackValidationError(parsed.issues);
    const id = `${slugify(parsed.value.pack.title)}-${randomBytes(3).toString('hex')}`;
    const now = new Date().toISOString();
    const stored: StoredPack = { id, source: 'user', createdAt: now, updatedAt: now, pack: parsed.value };
    await this.write(stored);
    this.packs.set(id, stored);
    return stored;
  }

  async update(id: string, input: unknown): Promise<StoredPack> {
    const existing = this.requireUserPack(id);
    const parsed = parseQuestionPack(input);
    if (!parsed.ok) throw new PackValidationError(parsed.issues);
    const stored: StoredPack = { ...existing, updatedAt: new Date().toISOString(), pack: parsed.value };
    await this.write(stored);
    this.packs.set(id, stored);
    return stored;
  }

  async delete(id: string): Promise<void> {
    this.requireUserPack(id);
    await rm(join(this.userDir, `${id}.json`), { force: true });
    this.packs.delete(id);
  }

  private requireUserPack(id: string): StoredPack {
    const existing = this.packs.get(id);
    if (!existing) throw new PackStoreError(404, 'Pack não encontrado');
    if (existing.source === 'builtin') {
      throw new PackStoreError(403, 'Packs de exemplo são somente leitura. Duplique o pack para editar.');
    }
    return existing;
  }

  private async write(stored: StoredPack): Promise<void> {
    if (!ID_PATTERN.test(stored.id)) throw new PackStoreError(400, 'id de pack inválido');
    const file = join(this.userDir, `${stored.id}.json`);
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify(stored, null, 2)}\n`, 'utf8');
    await rename(tmp, file);
  }
}
