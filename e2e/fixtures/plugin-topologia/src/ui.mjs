/**
 * Editor visual da topologia (plugin de referência). Escrito sem JSX para rodar sem build.
 *
 * O editor é controlado: desenha sempre `code` e chama `onChange` só em mudanças concluídas (adicionar,
 * soltar depois de arrastar, ligar cabo, confirmar IP, remover). Sem `onChange`, fica somente leitura.
 */
import { createElement as h, useEffect, useRef, useState } from 'react';
import plugin from './index.mjs';
import { EMPTY, TYPES, labelOf, nextId, parseTopology, serialize } from './topology.mjs';

const WIDTH = 800;
const HEIGHT = 480;
const COLORS = { pc: '#5CC8F2', switch: '#3FD9A0', roteador: '#FFC34D' };

function Glyph({ type }) {
  const color = COLORS[type];
  if (type === 'pc') {
    return h('g', null,
      h('rect', { x: -24, y: -22, width: 48, height: 32, rx: 4, fill: '#111426', stroke: color, strokeWidth: 3 }),
      h('rect', { x: -6, y: 10, width: 12, height: 8, fill: color }),
      h('rect', { x: -16, y: 18, width: 32, height: 4, rx: 2, fill: color }),
    );
  }
  if (type === 'switch') {
    return h('g', null,
      h('rect', { x: -34, y: -14, width: 68, height: 28, rx: 6, fill: '#111426', stroke: color, strokeWidth: 3 }),
      [-20, -8, 4, 16].map((x) => h('rect', { key: x, x, y: -4, width: 6, height: 8, rx: 1, fill: color })),
    );
  }
  return h('g', null,
    h('circle', { r: 22, fill: '#111426', stroke: color, strokeWidth: 3 }),
    h('path', { d: 'M-12 -4h18l-5-5M12 4H-6l5 5', fill: 'none', stroke: color, strokeWidth: 3, strokeLinecap: 'round', strokeLinejoin: 'round' }),
  );
}

function Button({ onClick, disabled, active, testid, children }) {
  return h('button', {
    type: 'button',
    onClick,
    disabled,
    'data-testid': testid,
    'aria-pressed': active === undefined ? undefined : active,
    className: `rounded-md px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40 ${active ? 'bg-white text-[#111426]' : 'bg-white/15 text-white ring-1 ring-inset ring-white/20 hover:bg-white/25'}`,
  }, children);
}

function TopologyEditor({ code, readOnly, onChange }) {
  const parsed = parseTopology(code || EMPTY);
  const doc = parsed.doc ?? { devices: [], links: [] };
  const editable = Boolean(onChange) && !readOnly && !parsed.error;
  const [selected, setSelected] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [from, setFrom] = useState(null);
  const [drag, setDrag] = useState(null);
  const svg = useRef(null);

  const commit = (next) => onChange?.(serialize(next));
  const device = doc.devices.find((d) => d.id === selected) ?? null;
  const link = typeof selected === 'number' ? doc.links[selected] : null;
  const position = (d) => (drag?.id === d.id ? drag : d);

  const toSvg = (event) => {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: Math.round(Math.min(WIDTH - 40, Math.max(40, point.x))), y: Math.round(Math.min(HEIGHT - 40, Math.max(40, point.y))) };
  };

  const add = (type) => {
    const n = doc.devices.length;
    const id = nextId(doc, type);
    commit({ ...doc, devices: [...doc.devices, { id, type, x: 120 + (n % 5) * 140, y: 110 + (Math.floor(n / 5) % 3) * 130, ...(TYPES[type].hasIp && { ip: '' }) }] });
    setSelected(id);
  };

  const remove = () => {
    if (device) commit({ devices: doc.devices.filter((d) => d.id !== device.id), links: doc.links.filter((l) => !l.includes(device.id)) });
    if (link) commit({ ...doc, links: doc.links.filter((_, i) => i !== selected) });
    setSelected(null);
  };

  const activate = (id) => {
    if (connecting && editable) {
      if (!from) return setFrom(id);
      if (from !== id && !doc.links.some((l) => l.includes(from) && l.includes(id))) commit({ ...doc, links: [...doc.links, [from, id]] });
      setFrom(null);
      return;
    }
    setSelected(id);
  };

  const move = (id, dx, dy) => {
    const d = doc.devices.find((x) => x.id === id);
    if (d) commit({ ...doc, devices: doc.devices.map((x) => (x.id === id ? { ...x, x: Math.min(WIDTH - 40, Math.max(40, x.x + dx)), y: Math.min(HEIGHT - 40, Math.max(40, x.y + dy)) } : x)) });
  };

  useEffect(() => {
    if (!connecting) setFrom(null);
  }, [connecting]);

  const byId = new Map(doc.devices.map((d) => [d.id, d]));
  const hint = !editable
    ? 'Somente leitura.'
    : connecting
      ? from
        ? `Escolha o aparelho para ligar a ${labelOf(byId.get(from))}.`
        : 'Escolha o primeiro aparelho do cabo.'
      : 'Arraste para mover. Selecione um aparelho para configurar.';

  return h('div', { className: 'flex h-full min-h-[320px] flex-col text-white', 'data-testid': 'topologia' },
    h('div', { className: 'flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2' },
      editable && [
        h(Button, { key: 'pc', onClick: () => add('pc'), testid: 'topo-add-pc' }, '+ PC'),
        h(Button, { key: 'sw', onClick: () => add('switch'), testid: 'topo-add-switch' }, '+ Switch'),
        h(Button, { key: 'r', onClick: () => add('roteador'), testid: 'topo-add-roteador' }, '+ Roteador'),
        h('span', { key: 'sep', className: 'mx-1 h-5 w-px bg-white/15' }),
        h(Button, { key: 'cabo', onClick: () => setConnecting((v) => !v), active: connecting, testid: 'topo-connect' }, 'Ligar cabo'),
      ],
      h('span', { className: 'text-xs text-white/60', 'aria-live': 'polite' }, parsed.error ?? hint),
    ),
    h('div', { className: 'flex min-h-0 flex-1' },
      h('svg', {
        ref: svg,
        viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
        className: 'min-h-0 min-w-0 flex-1 touch-none select-none',
        role: 'application',
        'aria-label': 'Área da topologia',
        onPointerMove: (e) => drag && setDrag({ ...drag, ...toSvg(e), moved: true }),
        onPointerUp: () => {
          if (drag?.moved) move(drag.id, drag.x - byId.get(drag.id).x, drag.y - byId.get(drag.id).y);
          else if (drag) activate(drag.id);
          setDrag(null);
        },
        onPointerLeave: () => setDrag(null),
        onPointerDown: (e) => e.target === svg.current && setSelected(null),
      },
        doc.links.map(([a, b], i) => {
          const pa = position(byId.get(a));
          const pb = position(byId.get(b));
          return h('g', { key: `${a}-${b}` },
            h('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, stroke: selected === i ? '#FFFFFF' : '#8A9BFF', strokeWidth: selected === i ? 4 : 3 }),
            // Faixa larga e invisível para facilitar o clique no cabo.
            h('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, stroke: 'transparent', strokeWidth: 16, onPointerDown: () => !connecting && setSelected(i), 'data-testid': `topo-link-${a}-${b}` }),
          );
        }),
        doc.devices.map((d) => {
          const p = position(d);
          const isSelected = selected === d.id || from === d.id;
          return h('g', {
            key: d.id,
            transform: `translate(${p.x} ${p.y})`,
            tabIndex: 0,
            role: 'button',
            'aria-label': `${labelOf(d)}${d.ip ? `, IP ${d.ip}` : ''}`,
            'aria-pressed': isSelected,
            'data-testid': `topo-device-${d.id}`,
            className: 'cursor-pointer outline-none',
            onPointerDown: (e) => {
              e.stopPropagation();
              if (!editable) return setSelected(d.id);
              setDrag({ id: d.id, x: d.x, y: d.y, moved: false });
            },
            onKeyDown: (e) => {
              const step = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[e.key];
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                activate(d.id);
              } else if (step && editable) {
                e.preventDefault();
                move(d.id, step[0], step[1]);
              } else if ((e.key === 'Delete' || e.key === 'Backspace') && editable) {
                setSelected(d.id);
                commit({ devices: doc.devices.filter((x) => x.id !== d.id), links: doc.links.filter((l) => !l.includes(d.id)) });
              }
            },
          },
            // Área de clique do aparelho inteiro (ícone e textos), sem vãos.
            h('rect', { x: -46, y: -34, width: 92, height: 104, fill: 'transparent' }),
            isSelected && h('rect', { x: -44, y: -32, width: 88, height: 62, rx: 12, fill: 'none', stroke: '#FFFFFF', strokeWidth: 2, strokeDasharray: '4 4' }),
            h(Glyph, { type: d.type }),
            h('text', { y: 44, textAnchor: 'middle', fill: '#E8EBF5', fontSize: 14, fontWeight: 700 }, labelOf(d)),
            d.ip && h('text', { y: 62, textAnchor: 'middle', fill: '#8A93B8', fontSize: 12, fontFamily: 'ui-monospace, monospace' }, d.ip),
          );
        }),
        !doc.devices.length && h('text', { x: WIDTH / 2, y: HEIGHT / 2, textAnchor: 'middle', fill: '#6A7199', fontSize: 16 }, editable ? 'Adicione aparelhos pela barra acima.' : 'Topologia vazia.'),
      ),
      h(Inspector, { device, link, byId, editable, onIp: (ip) => commit({ ...doc, devices: doc.devices.map((x) => (x.id === device.id ? { ...x, ip } : x)) }), onRemove: remove }),
    ),
  );
}

function Inspector({ device, link, byId, editable, onIp, onRemove }) {
  const [ip, setIp] = useState(device?.ip ?? '');
  useEffect(() => setIp(device?.ip ?? ''), [device?.id, device?.ip]);
  const box = (children) => h('aside', { className: 'w-52 shrink-0 space-y-3 border-l border-white/10 p-3 text-sm', 'aria-label': 'Aparelho selecionado' }, children);

  if (link) {
    return box([
      h('p', { key: 't', className: 'font-semibold' }, 'Cabo'),
      h('p', { key: 'd', className: 'text-white/70' }, `${labelOf(byId.get(link[0]))} até ${labelOf(byId.get(link[1]))}`),
      editable && h(Button, { key: 'r', onClick: onRemove, testid: 'topo-remove' }, 'Remover cabo'),
    ]);
  }
  if (!device) {
    return box(h('p', { className: 'text-white/60' }, 'Selecione um aparelho ou um cabo para ver os detalhes.'));
  }
  const save = () => ip !== (device.ip ?? '') && onIp(ip.trim());
  return box([
    h('p', { key: 't', className: 'font-semibold' }, labelOf(device)),
    TYPES[device.type].hasIp &&
      h('label', { key: 'ip', className: 'block space-y-1' },
        h('span', { className: 'block text-xs text-white/60' }, 'Endereço IP'),
        h('input', {
          value: ip,
          disabled: !editable,
          placeholder: '192.168.0.10',
          'data-testid': 'topo-ip',
          onChange: (e) => setIp(e.target.value),
          onBlur: save,
          onKeyDown: (e) => e.key === 'Enter' && save(),
          className: 'w-full rounded-md bg-black/30 px-2 py-1 font-mono text-xs outline-none ring-1 ring-white/15 focus:ring-white/40',
        }),
      ),
    !TYPES[device.type].hasIp && h('p', { key: 'sw', className: 'text-xs text-white/60' }, 'Switches não precisam de IP: só repassam o tráfego entre os cabos.'),
    editable && h(Button, { key: 'r', onClick: onRemove, testid: 'topo-remove' }, 'Remover aparelho'),
  ]);
}

export default {
  ...plugin,
  renderEditor: (context) => h(TopologyEditor, context),
};
