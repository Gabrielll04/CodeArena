/**
 * Documento da resposta: a topologia que o aluno monta, guardada como JSON.
 *   { "devices": [{ "id": "pc1", "type": "pc", "x": 160, "y": 320, "ip": "192.168.0.10" }], "links": [["pc1", "sw1"]] }
 * Funções puras, usadas pelos validadores (servidor e navegador) e pelo editor.
 */
export const EMPTY = '{"devices":[],"links":[]}';

export const TYPES = {
  pc: { prefix: 'pc', name: 'PC', plural: 'PCs', hasIp: true },
  switch: { prefix: 'sw', name: 'Switch', plural: 'switches', hasIp: false },
  roteador: { prefix: 'r', name: 'Roteador', plural: 'roteadores', hasIp: true },
};

const ID = /^[a-z]+[0-9]+$/;

/** Lê o documento. Devolve { doc } ou { error } com uma mensagem para o aluno. */
export function parseTopology(code) {
  let raw;
  try {
    raw = JSON.parse(code || EMPTY);
  } catch {
    return { error: 'A topologia não pôde ser lida.' };
  }
  if (!raw || !Array.isArray(raw.devices) || !Array.isArray(raw.links)) return { error: 'A topologia não pôde ser lida.' };
  const devices = [];
  const ids = new Set();
  for (const d of raw.devices) {
    if (!d || !ID.test(d.id) || !TYPES[d.type] || ids.has(d.id)) return { error: 'A topologia tem um aparelho inválido.' };
    ids.add(d.id);
    devices.push({ id: d.id, type: d.type, x: Number(d.x) || 0, y: Number(d.y) || 0, ...(typeof d.ip === 'string' && { ip: d.ip }) });
  }
  const links = [];
  const seen = new Set();
  for (const l of raw.links) {
    if (!Array.isArray(l) || l.length !== 2 || !ids.has(l[0]) || !ids.has(l[1]) || l[0] === l[1]) return { error: 'A topologia tem um cabo inválido.' };
    const key = [...l].sort().join('|');
    if (!seen.has(key)) links.push([l[0], l[1]]);
    seen.add(key);
  }
  return { doc: { devices, links } };
}

export const serialize = (doc) => JSON.stringify(doc);

/** "pc2" -> "PC2", "sw1" -> "Switch1". */
export function labelOf(device) {
  const type = TYPES[device.type];
  return `${type.name}${device.id.slice(type.prefix.length)}`;
}

export function nextId(doc, type) {
  const prefix = TYPES[type].prefix;
  let n = 1;
  while (doc.devices.some((d) => d.id === `${prefix}${n}`)) n++;
  return `${prefix}${n}`;
}

export function neighbors(doc, id) {
  return doc.links.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : []));
}

export function parseIp(text) {
  const parts = String(text ?? '').trim().split('.');
  if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return null;
  return parts.reduce((acc, p) => acc * 256 + Number(p), 0);
}

export function parseCidr(text) {
  const [ip, bits] = String(text).split('/');
  const base = parseIp(ip);
  const size = Number(bits);
  if (base === null || !Number.isInteger(size) || size < 8 || size > 30) return null;
  const block = 2 ** (32 - size);
  return { network: base - (base % block), block };
}

/** Caminho de camada 2 (só atravessa switches) entre dois aparelhos. */
export function linkedThroughSwitches(doc, from, to) {
  const byId = new Map(doc.devices.map((d) => [d.id, d]));
  const visited = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const current = queue.shift();
    for (const next of neighbors(doc, current)) {
      if (next === to) return true;
      if (!visited.has(next) && byId.get(next)?.type === 'switch') {
        visited.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}
