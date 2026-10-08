import { AVATAR_IDS, type AvatarId } from '@codearena/schemas';
import { Avatar, AVATAR_DESIGNS } from './Avatar';
import { cx } from './ui';

export function AvatarPicker({ value, onChange }: { value: AvatarId; onChange: (id: AvatarId) => void }) {
  return (
    <div role="radiogroup" aria-label="Escolha seu avatar" className="grid grid-cols-4 gap-2 sm:grid-cols-8">
      {AVATAR_IDS.map((id) => {
        const selected = id === value;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={AVATAR_DESIGNS[id].label}
            data-testid={`avatar-${id}`}
            onClick={() => onChange(id)}
            className={cx(
              'flex aspect-square items-center justify-center rounded-2xl transition',
              selected ? 'bg-lime/15 ring-2 ring-lime' : 'bg-white/[0.04] ring-1 ring-white/[0.08] hover:bg-white/[0.08]',
            )}
          >
            <Avatar id={id} size={44} className={cx('transition', selected && 'scale-110')} />
          </button>
        );
      })}
    </div>
  );
}
