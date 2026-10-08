import type { AuthoringWarning } from '@codearena/core';
import type { ValidationIssue } from '@codearena/schemas';
import { cx, Icon } from './ui';

export function IssueList({ issues, title = 'Corrija os campos abaixo' }: { issues: ValidationIssue[]; title?: string }) {
  if (!issues.length) return null;
  return (
    <div role="alert" className="rounded-xl border border-coral/30 bg-coral/[0.07] p-3" data-testid="issue-list">
      <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-coral">
        <Icon name="warning" /> {title}
      </p>
      <ul className="max-h-64 space-y-1 overflow-auto">
        {issues.map((issue, i) => (
          <li key={i} className="text-xs">
            <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-[11px] text-coral">{issue.path}</code>{' '}
            <span className="text-white/80">{issue.message}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function WarningList({ warnings }: { warnings: AuthoringWarning[] }) {
  if (!warnings.some((w) => w.level !== 'info')) {
    const infos = warnings.filter((w) => w.level === 'info');
    if (infos.length) {
      return (
        <ul className="space-y-1.5" data-testid="authoring-warnings">
          <li className="text-xs text-lime">Nenhum problema encontrado.</li>
          {infos.map((w, i) => (
            <li key={i} className="text-xs text-white/55">
              {w.message}
            </li>
          ))}
        </ul>
      );
    }
    return <p className="text-xs text-lime">Nenhum problema encontrado: a solução completa a checklist e as regras parecem robustas.</p>;
  }
  return (
    <ul className="space-y-1.5" data-testid="authoring-warnings">
      {warnings.map((w, i) => (
        <li key={i} className={cx('flex gap-2 text-xs', w.level === 'error' ? 'text-coral' : w.level === 'warning' ? 'text-amber' : 'text-white/55')}>
          <Icon name="warning" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            {w.itemId && <code className="mr-1 rounded bg-black/30 px-1 font-mono text-[11px]">{w.itemId}</code>}
            {w.message}
          </span>
        </li>
      ))}
    </ul>
  );
}
