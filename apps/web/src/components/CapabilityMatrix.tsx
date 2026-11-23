import type { CapabilityCell, CapabilityMap, CapabilityRef } from '@codearena/core';
import { STATUS_META } from '../lib/capabilities';
import { useChartTooltip } from './ChartTooltip';
import { cx, Icon } from './ui';

/**
 * Matriz aluno × capacidade. Cada célula mostra a situação com cor e ícone, e a dica traz as evidências (critério,
 * questão e atividade). É também a "tabela" do gráfico de barras: todos os valores ficam legíveis sem hover.
 */
export function CapabilityMatrix({
  map,
  capabilities,
  highlighted,
  selectedStudents,
  onToggleStudent,
  onToggleAll,
}: {
  map: CapabilityMap;
  capabilities: CapabilityRef[];
  highlighted: ReadonlySet<string>;
  selectedStudents: ReadonlySet<string>;
  onToggleStudent: (key: string) => void;
  onToggleAll: () => void;
}) {
  const { bind, tooltip } = useChartTooltip();
  const sessionTitle = new Map(map.sessions.map((s) => [s.id, s.packTitle]));
  const allSelected = map.students.length > 0 && map.students.every((s) => selectedStudents.has(s.key));

  return (
    <div className="overflow-x-auto" data-testid="capability-matrix">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <caption className="sr-only">Situação de cada aluno em cada capacidade</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-ink-850 px-3 pb-3 text-left align-bottom">
              <label className="flex items-center gap-2 text-xs font-medium text-white/50">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleAll}
                  className="h-4 w-4 accent-lime"
                  aria-label="Selecionar todos os alunos"
                />
                Aluno
              </label>
            </th>
            {capabilities.map((capability) => (
              <th
                key={capability.key}
                scope="col"
                title={capability.name}
                className={cx(
                  'min-w-[5.5rem] max-w-[7rem] px-1 pb-3 text-center align-bottom text-[11px] font-medium leading-tight',
                  highlighted.has(capability.key) ? 'text-white' : 'text-white/50',
                )}
              >
                <span className="line-clamp-3">{capability.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {map.students.map((student) => {
            const selected = selectedStudents.has(student.key);
            const toRecover = Object.values(student.cells).filter((c) => c.status === 'to-recover').length;
            return (
              <tr key={student.key} data-testid={`matrix-row-${student.name}`} className="group">
                <th
                  scope="row"
                  className={cx(
                    'sticky left-0 z-10 border-t border-white/[0.05] px-3 py-1.5 text-left font-normal',
                    selected ? 'bg-ink-700' : 'bg-ink-850 group-hover:bg-ink-800',
                  )}
                >
                  <label className="flex min-w-[11rem] cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => onToggleStudent(student.key)}
                      className="h-4 w-4 accent-lime"
                      data-testid={`select-student-${student.name}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-white/90">{student.name}</span>
                      <span className="block text-[11px] text-white/40">
                        {toRecover > 0 ? `${toRecover} a recuperar` : 'Nada a recuperar'}
                      </span>
                    </span>
                  </label>
                </th>
                {capabilities.map((capability) => {
                  const cell = student.cells[capability.key];
                  return (
                    <td
                      key={capability.key}
                      className={cx('border-t border-white/[0.05] px-1 py-1.5 text-center', highlighted.has(capability.key) && 'bg-white/[0.04]')}
                    >
                      {cell ? (
                        <button
                          type="button"
                          className={cx(
                            'mx-auto flex h-8 w-full max-w-[3rem] items-center justify-center rounded-lg transition hover:brightness-125 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white',
                            STATUS_META[cell.status].soft,
                            STATUS_META[cell.status].text,
                          )}
                          aria-label={`${student.name}, ${capability.name}: ${STATUS_META[cell.status].label}. ${evidenceText(cell, sessionTitle)}`}
                          data-status={cell.status}
                          {...bind(<CellDetail name={capability.name} cell={cell} sessionTitle={sessionTitle} />)}
                        >
                          <Icon name={STATUS_META[cell.status].icon} className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="text-white/20" aria-label="Sem avaliação">
                          -
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {tooltip}
    </div>
  );
}

function CellDetail({ name, cell, sessionTitle }: { name: string; cell: CapabilityCell; sessionTitle: Map<string, string> }) {
  const meta = STATUS_META[cell.status];
  return (
    <>
      <p className="font-semibold text-white">
        {meta.label} <span className="font-normal text-white/50">em {name}</span>
      </p>
      <ul className="mt-1.5 space-y-1">
        {cell.evidence.slice(-6).map((e, index) => (
          <li key={index} className="flex gap-1.5">
            <span className={cx('mt-0.5 shrink-0', e.met ? 'text-lime' : e.critical ? 'text-coral' : 'text-amber')}>
              <Icon name={e.met ? 'check' : 'x'} className="h-3 w-3" />
            </span>
            <span>
              {e.criterionLabel}
              {!e.critical && <span className="text-white/40"> (desejável)</span>}
              <span className="block text-white/40">
                {e.questionTitle} · {sessionTitle.get(e.sessionId)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {cell.evidence.length > 6 && <p className="mt-1 text-white/40">e mais {cell.evidence.length - 6}</p>}
    </>
  );
}

function evidenceText(cell: CapabilityCell, sessionTitle: Map<string, string>): string {
  return cell.evidence
    .map((e) => `${e.criterionLabel}: ${e.met ? 'atendido' : 'não atendido'} (${e.questionTitle}, ${sessionTitle.get(e.sessionId)})`)
    .join('; ');
}
