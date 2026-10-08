import { useState } from 'react';
import type { ClientQuizPlugin, PluginUIContext } from '@codearena/plugin-sdk/ui';
import { cx } from './ui';

/** Painel à direita do editor: preview e/ou ferramentas fornecidas pelo plugin. */
export function PluginPanel({ plugin, context }: { plugin: ClientQuizPlugin<any>; context: PluginUIContext }) {
  const tabs = [
    plugin.renderPreview && { id: 'preview' as const, label: plugin.previewTitle ?? 'Preview', render: plugin.renderPreview },
    plugin.renderSidePanel && { id: 'side' as const, label: plugin.sidePanelTitle ?? 'Ferramentas', render: plugin.renderSidePanel },
  ].filter(Boolean) as { id: 'preview' | 'side'; label: string; render: (ctx: PluginUIContext) => React.ReactNode }[];
  const [active, setActive] = useState(tabs[0]?.id);

  if (!tabs.length) {
    return <p className="p-4 text-sm text-white/50">O plugin {plugin.displayName} não tem painel lateral.</p>;
  }
  const current = tabs.find((t) => t.id === active) ?? tabs[0]!;
  return (
    <div className="flex h-full min-h-0 flex-col">
      {tabs.length > 1 && (
        <div className="flex gap-1 border-b border-white/[0.07] p-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActive(tab.id)}
              className={cx('rounded-lg px-3 py-1 text-xs font-semibold', tab.id === current.id ? 'bg-white/10 text-white' : 'text-white/50 hover:text-white')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">{current.render(context)}</div>
    </div>
  );
}

export function pluginPanelTitle(plugin: ClientQuizPlugin<any> | undefined): string {
  if (!plugin) return 'Painel';
  return plugin.previewTitle ?? plugin.sidePanelTitle ?? 'Painel';
}
