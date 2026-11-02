/**
 * Floating "Editing component ◆ Name — Done" bar shown over the canvas while a
 * component master is open in isolation. Portaled into `.k-editor__canvas`.
 */
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { useUI } from '@/core/store/uiStore';
import { useDoc } from '@/core/store/docStore';
import { exitComponentEditing, renameComponent } from './componentActions';
import { listInstances } from './componentModel';
import './components.css';

function useCanvasHost(active: boolean): HTMLElement | null {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (!active) {
      setEl(null);
      return;
    }
    let raf = 0;
    const find = () => {
      const found = document.querySelector<HTMLElement>('.k-editor__canvas');
      if (found) setEl(found);
      else raf = requestAnimationFrame(find);
    };
    find();
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return el;
}

export function ComponentEditBar() {
  const route = useUI((s) => s.route);
  const compId = useUI((s) => s.editingComponentId);
  const comp = useDoc((s) => (compId ? s.doc.components[compId] : undefined));
  const count = useDoc((s) => (compId ? listInstances(s.doc, compId).length : 0));
  const host = useCanvasHost(route === 'editor' && !!comp);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  useEffect(() => setVal(comp?.name ?? ''), [comp?.name]);
  if (!host || !comp) return null;
  return createPortal(
    <div className="k-compbar" role="status" aria-label="Editing component">
      <span className="k-compbar__label">Editing component</span>
      <span className="k-compbar__diamond" aria-hidden>
        ◆
      </span>
      {editing ? (
        <input
          className="k-compbar__input"
          autoFocus
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setVal(comp.name);
              setEditing(false);
            }
          }}
          onBlur={() => {
            setEditing(false);
            renameComponent(comp.id, val);
          }}
        />
      ) : (
        <button className="k-compbar__name" title="Double-click to rename" onDoubleClick={() => setEditing(true)}>
          {comp.name}
        </button>
      )}
      <span className="k-compbar__meta">
        {count} instance{count === 1 ? '' : 's'}
      </span>
      <button className="k-compbar__done" onClick={exitComponentEditing} title="Back to page (Esc)">
        <Check />
        Done
      </button>
    </div>,
    host,
  );
}
