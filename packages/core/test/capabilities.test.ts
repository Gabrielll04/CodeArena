import { describe, expect, it } from 'vitest';
import { buildCapabilityMap, capabilitiesToRecover, normalizeText, recoveryQuestions, type CapabilitySessionInput } from '../src';

const heranca = { type: 'capacidade-tecnica', name: 'Herança' } as const;
const encapsulamento = { type: 'conhecimento', name: 'Encapsulamento' } as const;

const zumbi = {
  id: 'zumbi',
  title: 'O zumbi é um mob',
  checklist: [
    { id: 'extends', label: 'Usar extends', optional: false, capability: heranca },
    { id: 'reaproveita', label: 'Reaproveitar apresentar()', optional: true, capability: heranca },
  ],
};
const vida = {
  id: 'vida',
  title: 'A vida protegida',
  checklist: [
    { id: 'privado', label: 'Campo privado', optional: false, capability: encapsulamento },
    { id: 'sem-capacidade', label: 'Sem capacidade', optional: false },
  ],
};
const mark = (met: boolean) => ({ met });

function session(id: string, startedAt: number, evaluations: CapabilitySessionInput['evaluations'], questions = [zumbi, vida]): CapabilitySessionInput {
  return {
    id,
    packTitle: `Pack ${id}`,
    startedAt,
    questions,
    players: [
      { id: `${id}-ana`, name: 'Ana Souza' },
      { id: `${id}-bia`, name: 'Bia' },
    ],
    evaluations,
  };
}

describe('mapa de capacidades', () => {
  const first = session('s1', 1, [
    { playerId: 's1-ana', questionId: 'zumbi', marks: { extends: mark(false), reaproveita: mark(true) } },
    { playerId: 's1-ana', questionId: 'vida', marks: { privado: mark(true), 'sem-capacidade': mark(false) } },
    { playerId: 's1-bia', questionId: 'zumbi', marks: { extends: mark(true), reaproveita: mark(false) } },
  ]);

  it('dá a situação de cada capacidade por aluno, e critérios sem capacidade ficam de fora', () => {
    const map = buildCapabilityMap([first]);
    expect(map.capabilities.map((c) => c.key)).toEqual(['capacidade-tecnica:heranca', 'conhecimento:encapsulamento']);
    const [ana, bia] = map.students;
    expect(ana).toMatchObject({ key: 'ana souza', name: 'Ana Souza', sessionIds: ['s1'] });
    expect(ana!.cells['capacidade-tecnica:heranca']).toMatchObject({ status: 'to-recover', met: 1, unmet: 1 });
    expect(ana!.cells['conhecimento:encapsulamento']).toMatchObject({ status: 'developed', met: 1, unmet: 0 });
    // Só um desejável faltando: em desenvolvimento, não a recuperar.
    expect(bia!.cells['capacidade-tecnica:heranca']!.status).toBe('developing');
    // Bia não fez a questão de encapsulamento.
    expect(bia!.cells['conhecimento:encapsulamento']).toBeUndefined();
  });

  it('a atividade mais recente decide, e o mesmo aluno é reconhecido pelo nome sem acentos nem maiúsculas', () => {
    const recovery = session('s2', 2, [{ playerId: 's2-ana', questionId: 'zumbi', marks: { extends: mark(true), reaproveita: mark(true) } }], [zumbi]);
    recovery.players[0]!.name = '  ANA  souza ';
    // Fora de ordem de propósito: o mapa ordena pela data.
    const map = buildCapabilityMap([recovery, first]);
    const ana = map.students.find((s) => s.key === 'ana souza')!;
    expect(ana.name).toBe('  ANA  souza ');
    expect(ana.sessionIds).toEqual(['s1', 's2']);
    expect(ana.cells['capacidade-tecnica:heranca']).toMatchObject({ status: 'recovered', met: 3, unmet: 1, latestSessionId: 's2' });
    expect(map.sessions.map((s) => s.id)).toEqual(['s1', 's2']);
  });

  it('lista o que recuperar e monta as questões da recuperação só com críticos das capacidades pedidas', () => {
    const map = buildCapabilityMap([first]);
    expect(capabilitiesToRecover(map)).toEqual(['capacidade-tecnica:heranca']);
    expect(capabilitiesToRecover(map, ['bia'])).toEqual([]);
    expect(recoveryQuestions([first], ['capacidade-tecnica:heranca']).map((q) => q.id)).toEqual(['zumbi']);
    expect(recoveryQuestions([first], ['conhecimento:encapsulamento', 'capacidade-tecnica:heranca']).map((q) => q.id)).toEqual(['zumbi', 'vida']);
    // A mesma questão em duas atividades entra uma vez, na versão mais recente.
    const renamed = { ...zumbi, title: 'O zumbi, de novo' };
    const later = session('s3', 3, [], [renamed]);
    expect(recoveryQuestions([later, first], ['capacidade-tecnica:heranca'])).toEqual([renamed]);
  });

  it('normaliza nomes e textos', () => {
    expect(normalizeText('  Pietra   Vitória ')).toBe('pietra vitoria');
  });
});
