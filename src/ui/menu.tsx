/**
 * Declarative menu model rendered as either a dropdown or a context menu.
 */
import type { ReactNode } from 'react';
import { DropdownMenu, ContextMenu } from 'radix-ui';
import { Check, ChevronRight } from 'lucide-react';
import { Kbd } from './primitives';

export type MenuEntry =
  | {
      type?: 'item';
      label: ReactNode;
      icon?: ReactNode;
      shortcut?: string;
      onSelect?: () => void;
      disabled?: boolean;
      danger?: boolean;
      checked?: boolean;
    }
  | { type: 'separator' }
  | { type: 'label'; label: ReactNode }
  | { type: 'submenu'; label: ReactNode; icon?: ReactNode; items: MenuEntry[]; disabled?: boolean };

type Kit = typeof DropdownMenu | typeof ContextMenu;

function renderEntries(K: Kit, entries: MenuEntry[]): ReactNode {
  return entries.map((e, i) => {
    if (e.type === 'separator') return <K.Separator key={i} className="k-menu__sep" />;
    if (e.type === 'label')
      return (
        <K.Label key={i} className="k-menu__label">
          {e.label}
        </K.Label>
      );
    if (e.type === 'submenu')
      return (
        <K.Sub key={i}>
          <K.SubTrigger className="k-menu__item" disabled={e.disabled}>
            <span className="k-menu__icon">{e.icon}</span>
            {e.label}
            <span className="k-menu__check">
              <ChevronRight />
            </span>
          </K.SubTrigger>
          <K.Portal>
            <K.SubContent className="k-menu" sideOffset={4} collisionPadding={8}>
              {renderEntries(K, e.items)}
            </K.SubContent>
          </K.Portal>
        </K.Sub>
      );
    return (
      <K.Item
        key={i}
        className={`k-menu__item${e.danger ? ' k-menu__item--danger' : ''}`}
        disabled={e.disabled}
        onSelect={() => e.onSelect?.()}
      >
        <span className="k-menu__icon">{e.icon}</span>
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.label}</span>
        {e.checked && (
          <span className="k-menu__check">
            <Check />
          </span>
        )}
        {e.shortcut && <Kbd keys={e.shortcut} />}
      </K.Item>
    );
  });
}

export function Dropdown({
  trigger,
  items,
  align = 'start',
  side = 'bottom',
  onOpenChange,
}: {
  trigger: ReactNode;
  items: MenuEntry[];
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'bottom' | 'left' | 'right';
  onOpenChange?: (v: boolean) => void;
}) {
  return (
    <DropdownMenu.Root onOpenChange={onOpenChange}>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="k-menu" align={align} side={side} sideOffset={6} collisionPadding={8}>
          {renderEntries(DropdownMenu, items)}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/** Wrap children with a right-click menu. `items` may be a function evaluated on open. */
export function ContextMenuArea({
  children,
  items,
  onOpenChange,
  asChild = true,
}: {
  children: ReactNode;
  items: MenuEntry[] | (() => MenuEntry[]);
  onOpenChange?: (v: boolean) => void;
  asChild?: boolean;
}) {
  return (
    <ContextMenu.Root onOpenChange={onOpenChange} modal={false}>
      <ContextMenu.Trigger asChild={asChild}>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="k-menu" collisionPadding={8}>
          {renderEntries(ContextMenu, typeof items === 'function' ? items() : items)}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
