/**
 * Atividades avaliadas de exemplo para o mapa de capacidades (testes de navegador, prints e vídeo). Usa as questões
 * dos packs de exemplo do plugin backend-http, com capacidades MSEP em cada critério, e uma turma fictícia.
 * Sobe tudo pela importação de sessão do Histórico, como um professor faria.
 */

const CAPABILITIES = {
  'usar-express': ['capacidade-tecnica', 'Criar servidor Express'],
  'rota-health': ['capacidade-tecnica', 'Definir rotas'],
  'health-responde-ok': ['conhecimento', 'Respostas HTTP'],
  'json-parser': ['capacidade-tecnica', 'Ler o corpo da requisição'],
  'rota-echo': ['capacidade-tecnica', 'Definir rotas'],
  'echo-responde': ['conhecimento', 'Respostas HTTP'],
  'rota-users': ['capacidade-tecnica', 'Definir rotas'],
  'usa-params': ['capacidade-tecnica', 'Parâmetros de rota'],
  'responde-42': ['capacidade-tecnica', 'Parâmetros de rota'],
  'responde-7': ['capacidade-tecnica', 'Parâmetros de rota'],
  'post-cria': ['conhecimento', 'Estado em memória'],
  'get-lista': ['capacidade-tecnica', 'Definir rotas'],
  'usa-push': ['conhecimento', 'Estado em memória'],
  'echo-devolve': ['capacidade-tecnica', 'Depurar código'],
  'echo-outro-corpo': ['capacidade-tecnica', 'Ler o corpo da requisição'],
  existente: ['capacidade-tecnica', 'Depurar código'],
  'inexistente-99': ['capacidade-tecnica', 'Tratar erros'],
  'inexistente-3': ['capacidade-tecnica', 'Tratar erros'],
  'rota-ping': ['capacidade-tecnica', 'Depurar código'],
  'ping-responde': ['conhecimento', 'Respostas HTTP'],
  'ping-json': ['conhecimento', 'Respostas HTTP'],
};
/** Critérios desejáveis (o resto é crítico). */
const DESIRABLE = new Set(['responde-7', 'usa-push', 'echo-outro-corpo', 'ping-json']);

export const STUDENTS = ['Ana Lima', 'Bruno Costa', 'Carla Dias', 'Davi Rocha', 'Elisa Prado', 'Felipe Nunes', 'Gabi Torres', 'Hugo Alves', 'Iara Mendes', 'João Pires', 'Karen Souza', 'Lucas Moreira'];

/** Quem errou o quê (por id do critério); o resto acertou. Fixo, para os prints saírem sempre iguais. */
const MISSES = {
  'Bruno Costa': ['usa-params', 'responde-42', 'usa-push'],
  'Carla Dias': ['json-parser', 'echo-responde', 'inexistente-99'],
  'Davi Rocha': ['usa-params', 'responde-42', 'responde-7', 'post-cria', 'inexistente-99', 'inexistente-3'],
  'Elisa Prado': ['responde-7'],
  'Felipe Nunes': ['post-cria', 'get-lista', 'usa-push', 'ping-json'],
  'Hugo Alves': ['usa-params', 'responde-42', 'inexistente-3'],
  'Iara Mendes': ['echo-outro-corpo'],
  'João Pires': ['json-parser', 'usa-params', 'responde-42', 'inexistente-99', 'inexistente-3'],
  'Lucas Moreira': ['post-cria', 'usa-push'],
};

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const DAY = 24 * 60 * 60 * 1000;

function withCapabilities(questions) {
  return questions.map((question) => ({
    ...question,
    checklist: question.checklist.map((item) => {
      const capability = CAPABILITIES[item.id];
      return {
        ...item,
        optional: DESIRABLE.has(item.id) || item.optional,
        ...(capability ? { capability: { type: capability[0], name: capability[1] } } : {}),
      };
    }),
  }));
}

function record({ n, title, packId, startedAt, questions, students, misses }) {
  const players = students.map((name, i) => ({ id: `p${n}-${i}`, name, avatar: 'bolt', delivered: true }));
  return {
    id: uuid(n),
    version: 1,
    mode: 'assessment',
    roomCode: String(400000 + n),
    packId,
    packTitle: title,
    startedAt,
    endedAt: startedAt + 50 * 60 * 1000,
    settings: { mode: 'assessment', assessmentMinutes: 50, allowPaste: false },
    questions,
    players,
    report: {},
    answers: [],
    evaluations: players.flatMap((player) =>
      questions.map((question) => ({
        playerId: player.id,
        questionId: question.id,
        marks: Object.fromEntries(
          question.checklist.map((item) => [item.id, { met: !(misses[player.name] ?? []).includes(item.id), source: 'professor' }]),
        ),
        updatedAt: startedAt,
      })),
    ),
    autoCheck: 'none',
  };
}

/** Busca as questões dos packs de exemplo e monta três atividades: duas da turma e uma recuperação. */
export async function capabilitySessions(baseUrl, now = Date.now()) {
  const pack = async (id) => {
    const stored = await (await fetch(`${baseUrl}/api/packs/${id}`)).json();
    return withCapabilities(stored.pack.questions.map((q) => ({ ...q, pluginId: q.pluginId ?? stored.pack.pack.pluginId })));
  };
  const basic = await pack('exemplo-backend-http-basico');
  const debug = await pack('exemplo-depuracao-backend-http');
  const recoveryStudents = ['Bruno Costa', 'Davi Rocha', 'Hugo Alves', 'João Pires'];
  return [
    record({ n: 1, title: 'API básica com Node', packId: 'exemplo-backend-http-basico', startedAt: now - 14 * DAY, questions: basic, students: STUDENTS, misses: MISSES }),
    record({ n: 2, title: 'Depuração de APIs com Express', packId: 'exemplo-depuracao-backend-http', startedAt: now - 7 * DAY, questions: debug, students: STUDENTS, misses: MISSES }),
    // Recuperação de "Parâmetros de rota": Bruno, Davi e Hugo recuperaram; João ainda não.
    record({
      n: 3,
      title: 'Recuperação: Parâmetros de rota',
      packId: null,
      startedAt: now - 2 * DAY,
      questions: basic.filter((q) => q.id === 'parametro-rota'),
      students: recoveryStudents,
      misses: { 'João Pires': ['usa-params', 'responde-42'] },
    }),
  ];
}

/** Importa as atividades no histórico da chave do professor. */
export async function importCapabilitySessions(baseUrl, teacherKey, now) {
  for (const session of await capabilitySessions(baseUrl, now)) {
    const response = await fetch(`${baseUrl}/api/history/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-teacher-key': teacherKey },
      body: JSON.stringify(session),
    });
    if (!response.ok && response.status !== 409) throw new Error(`Importação falhou: ${response.status} ${await response.text()}`);
  }
}
