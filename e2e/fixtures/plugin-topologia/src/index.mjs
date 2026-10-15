/**
 * Plugin visual de referência: o aluno monta uma rede local num editor gráfico e a checklist confere
 * aparelhos, cabos, endereços IP e um ping simulado. A resposta é o JSON da topologia (answerFormat "document");
 * os validadores são funções puras sobre esse JSON, então rodam iguais no navegador e no servidor.
 */
import { EMPTY, TYPES, labelOf, linkedThroughSwitches, neighbors, parseCidr, parseIp, parseTopology } from './topology.mjs';

/** Validação mínima de parâmetros no formato safeParse (sem dependências). */
function schema(check) {
  return {
    safeParse(value) {
      const problem = check(value ?? {});
      return problem ? { success: false, error: { issues: [{ path: [problem[0]], message: problem[1] }] } } : { success: true, data: value };
    },
  };
}
const tipoValido = (v, campo) => (TYPES[v?.[campo]] ? null : [campo, `use ${Object.keys(TYPES).join(', ')}`]);

function withDoc(session, check) {
  if (session.error) return { passed: false, message: session.error };
  return check(session.doc);
}

export default {
  id: 'topologia-teste',
  displayName: 'Topologia de rede (referência)',
  description: 'Montar redes locais: PCs, switches, roteadores, cabos e endereços IP.',
  version: '1.0.0',
  editorLanguage: 'json',
  answerFormat: 'document',
  answerLabel: 'Topologia',
  getStarterCode: (question) => question.starterCode || EMPTY,
  createSession: ({ code }) => parseTopology(code),
  validators: {
    contarDispositivos: {
      description: 'A topologia tem pelo menos N aparelhos do tipo indicado.',
      mode: 'static',
      params: schema((v) => tipoValido(v, 'tipo') ?? (Number.isInteger(v.minimo) && v.minimo > 0 ? null : ['minimo', 'inteiro maior que 0'])),
      exampleParams: { tipo: 'pc', minimo: 2 },
      validate: ({ session, params }) =>
        withDoc(session, (doc) => {
          const count = doc.devices.filter((d) => d.type === params.tipo).length;
          const type = TYPES[params.tipo];
          return count >= params.minimo ? true : { passed: false, message: `${count} de ${params.minimo} ${params.minimo === 1 ? type.name.toLowerCase() : type.plural}` };
        }),
    },
    ligados: {
      description: 'Todo aparelho do tipo indicado tem um cabo direto até um aparelho do outro tipo.',
      mode: 'static',
      params: schema((v) => tipoValido(v, 'tipo') ?? tipoValido(v, 'a')),
      exampleParams: { tipo: 'pc', a: 'switch' },
      validate: ({ session, params }) =>
        withDoc(session, (doc) => {
          const devices = doc.devices.filter((d) => d.type === params.tipo);
          if (!devices.length) return false;
          const byId = new Map(doc.devices.map((d) => [d.id, d]));
          const loose = devices.find((d) => !neighbors(doc, d.id).some((n) => byId.get(n)?.type === params.a));
          return loose ? { passed: false, message: `${labelOf(loose)} sem cabo até um ${TYPES[params.a].name.toLowerCase()}` } : true;
        }),
    },
    ipsNaRede: {
      description: 'Todo aparelho do tipo indicado tem um IP válido, único e dentro da rede (ex.: 192.168.0.0/24).',
      mode: 'static',
      params: schema((v) => tipoValido(v, 'tipo') ?? (parseCidr(v.rede) ? null : ['rede', 'use o formato 192.168.0.0/24'])),
      exampleParams: { tipo: 'pc', rede: '192.168.0.0/24' },
      validate: ({ session, params }) =>
        withDoc(session, (doc) => {
          const { network, block } = parseCidr(params.rede);
          const devices = doc.devices.filter((d) => d.type === params.tipo);
          if (!devices.length) return false;
          const used = new Set();
          for (const device of devices) {
            const ip = parseIp(device.ip);
            if (ip === null) return { passed: false, message: `${labelOf(device)} sem IP válido` };
            if (ip < network || ip >= network + block) return { passed: false, message: `${labelOf(device)} fora da rede ${params.rede}` };
            if (ip === network || ip === network + block - 1) return { passed: false, message: `${labelOf(device)} usa um endereço reservado da rede` };
            if (used.has(ip)) return { passed: false, message: `IP repetido em ${labelOf(device)}` };
            used.add(ip);
          }
          return true;
        }),
    },
    ping: {
      description: 'Ping simulado entre dois aparelhos da mesma rede, ligados por cabos e switches.',
      mode: 'static',
      params: schema((v) => (typeof v.de !== 'string' ? ['de', 'nome do aparelho, ex.: PC1'] : typeof v.para !== 'string' ? ['para', 'nome do aparelho, ex.: PC2'] : null)),
      exampleParams: { de: 'PC1', para: 'PC2', mascara: 24 },
      validate: ({ session, params }) =>
        withDoc(session, (doc) => {
          const find = (name) => doc.devices.find((d) => labelOf(d).toLowerCase() === name.toLowerCase());
          const from = find(params.de);
          const to = find(params.para);
          if (!from || !to) return { passed: false, message: `${from ? params.para : params.de} não existe` };
          const a = parseIp(from.ip);
          const b = parseIp(to.ip);
          if (a === null || b === null) return { passed: false, message: `${a === null ? labelOf(from) : labelOf(to)} sem IP` };
          const block = 2 ** (32 - (Number(params.mascara) || 24));
          if (Math.floor(a / block) !== Math.floor(b / block)) return { passed: false, message: `${labelOf(from)} e ${labelOf(to)} estão em redes diferentes` };
          if (!linkedThroughSwitches(doc, from.id, to.id)) return { passed: false, message: `Sem caminho de cabos entre ${labelOf(from)} e ${labelOf(to)}` };
          return true;
        }),
    },
  },
  authoring: { defaultStarterCode: EMPTY },
};
