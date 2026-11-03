/**
 * Inline text editing on the real canvas element.
 *
 * Lifecycle: `startTextEditing(id)` sets `ui.editingTextId`; NodeView renders the
 * element contentEditable and calls `attachTextEditor(el, id)` from a layout
 * effect; the session ends on Escape / click outside / blur and commits a single
 * history entry (or none if nothing changed).
 */
import { docApi, useDoc } from '@/core/store/docStore';
import { uiApi } from '@/core/store/uiStore';
import { removeNode } from '@/core/model/tree';
import type { KDocument, NodeId } from '@/core/model/types';
import { sanitizeRich } from './sanitize';

interface Session {
  id: NodeId;
  el: HTMLElement | null;
  initial: string;
  html: string;
  /** a transaction was opened for this session (node created by the text tool) */
  ownsTx: boolean;
  detach?: () => void;
}

let session: Session | null = null;
let pendingCaret: { x: number; y: number } | null = null;
let pendingSelectAll = false;

export function isEditingText(): boolean {
  return !!session;
}

export function editingElement(): HTMLElement | null {
  return session?.el ?? null;
}

/**
 * Begin editing a text/button/link leaf. `caret` (client coords) places the caret
 * at the click point; otherwise the whole text is selected. `ownsTx` means the
 * caller opened a transaction that the session commits (or cancels if empty).
 */
export function startTextEditing(id: NodeId, opts: { caret?: { x: number; y: number }; selectAll?: boolean; ownsTx?: boolean } = {}) {
  const n = docApi.doc.nodes[id];
  if (!n) return;
  if (session && session.id !== id) commitTextEditing();
  pendingCaret = opts.caret ?? null;
  pendingSelectAll = opts.selectAll ?? !opts.caret;
  session = { id, el: null, initial: n.props.text ?? '', html: n.props.text ?? '', ownsTx: !!opts.ownsTx };
  uiApi.set({ selection: [id], editingTextId: id, hoverId: null });
}

/** Normalize contentEditable output into the allowed inline subset. */
export function cleanEditedHtml(raw: string): string {
  let html = raw
    .replace(/<div><br\s*\/?><\/div>/gi, '<br>')
    .replace(/<\/div>\s*<div[^>]*>/gi, '<br>')
    .replace(/<\/?(div|p)[^>]*>/gi, (m) => (m.startsWith('</') ? '' : '<br>'))
    .replace(/^<br>/, '');
  html = sanitizeRich(html);
  // a lone trailing <br> is a contentEditable artifact
  if (/<br\s*\/?>$/i.test(html) && !/<br\s*\/?><br\s*\/?>$/i.test(html)) html = html.replace(/<br\s*\/?>$/i, '');
  if (html.replace(/<br\s*\/?>/gi, '').replace(/&nbsp;|​/g, ' ').trim() === '') return '';
  return html.replace(/​/g, '');
}

/** End the session, writing one history entry if the text changed. */
export function commitTextEditing() {
  const s = session;
  if (!s) return;
  session = null;
  s.detach?.();
  if (s.el) s.html = s.el.innerHTML;
  const html = cleanEditedHtml(s.html);
  const doc = docApi.doc;
  const n = doc.nodes[s.id];
  const ui = uiApi.state;
  if (ui.editingTextId === s.id) uiApi.set({ editingTextId: null });
  if (!n) {
    if (s.ownsTx) docApi.cancel();
    return;
  }
  const emptyText = html === '' && n.type === 'text';
  if (s.ownsTx) {
    if (emptyText) {
      docApi.cancel();
      uiApi.set({ selection: [] });
      return;
    }
    docApi.mutate('Edit text', (d) => {
      d.nodes[s.id].props.text = html;
    });
    docApi.commit('Add text');
    return;
  }
  if (emptyText) {
    // Figma-like: emptying a text layer removes it
    docApi.mutate('Delete empty text', (d) => removeNode(d as KDocument, s.id));
    uiApi.set({ selection: [] });
    return;
  }
  if (html === (n.props.text ?? '')) {
    // restore sanitized DOM if the browser left artifacts behind
    if (s.el) s.el.innerHTML = sanitizeRich(html) || '&#8203;';
    return;
  }
  docApi.mutate('Edit text', (d) => {
    d.nodes[s.id].props.text = html;
  });
}

/** Abort editing without saving (used when the node disappears). */
export function cancelTextEditing() {
  const s = session;
  if (!s) return;
  session = null;
  s.detach?.();
  if (s.ownsTx) docApi.cancel();
  if (uiApi.state.editingTextId === s.id) uiApi.set({ editingTextId: null });
}

function placeCaret(el: HTMLElement) {
  const sel = window.getSelection();
  if (!sel) return;
  let range: Range | null = null;
  if (pendingCaret) {
    const { x, y } = pendingCaret;
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    if (doc.caretPositionFromPoint) {
      const pos = doc.caretPositionFromPoint(x, y);
      if (pos && el.contains(pos.offsetNode)) {
        range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
      }
    } else if (doc.caretRangeFromPoint) {
      const r = doc.caretRangeFromPoint(x, y);
      if (r && el.contains(r.startContainer)) range = r;
    }
  }
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(el);
    if (!pendingSelectAll) range.collapse(false);
  }
  sel.removeAllRanges();
  sel.addRange(range);
  pendingCaret = null;
  pendingSelectAll = false;
}

function insertPlainText(text: string) {
  // execCommand keeps the native undo stack working inside the editor
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, i) => {
    if (i > 0) document.execCommand('insertLineBreak');
    if (line) document.execCommand('insertText', false, line);
  });
}

/**
 * Called by NodeView when the element for `id` becomes editable. Returns a
 * cleanup that commits the session if it's still open (e.g. selection changed
 * elsewhere and editing ended without an explicit commit).
 */
export function attachTextEditor(el: HTMLElement, id: NodeId): () => void {
  if (!session || session.id !== id) {
    // editing started externally (e.g. another module set editingTextId)
    const n = docApi.doc.nodes[id];
    session = { id, el: null, initial: n?.props.text ?? '', html: n?.props.text ?? '', ownsTx: false };
    pendingSelectAll = !pendingCaret;
  }
  const s = session;
  s.el = el;
  el.focus({ preventScroll: true });
  placeCaret(el);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
      e.preventDefault();
      e.stopPropagation();
      commitTextEditing();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      return;
    }
    // keep the editor's keys away from global shortcuts (they also skip typing targets)
    e.stopPropagation();
  };
  const onInput = () => {
    s.html = el.innerHTML;
  };
  const onPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const text = e.clipboardData?.getData('text/plain') ?? '';
    if (text) insertPlainText(text);
    s.html = el.innerHTML;
  };
  const onDrop = (e: DragEvent) => e.preventDefault();
  const onBlur = () => {
    // switching windows keeps the editor open
    if (!document.hasFocus()) return;
    if (session === s) commitTextEditing();
  };
  el.addEventListener('keydown', onKeyDown);
  el.addEventListener('input', onInput);
  el.addEventListener('paste', onPaste);
  el.addEventListener('drop', onDrop);
  el.addEventListener('blur', onBlur);
  const detach = () => {
    el.removeEventListener('keydown', onKeyDown);
    el.removeEventListener('input', onInput);
    el.removeEventListener('paste', onPaste);
    el.removeEventListener('drop', onDrop);
    el.removeEventListener('blur', onBlur);
  };
  s.detach = detach;
  return () => {
    if (session === s) {
      s.html = el.innerHTML;
      // NodeView is leaving edit mode without an explicit commit
      queueMicrotask(() => {
        if (session === s) commitTextEditing();
      });
    } else detach();
  };
}

/** Undo/redo while a session is open would fight with the DOM — commit first. */
export function installTextEditGuards(): () => void {
  return useDoc.subscribe((st, prev) => {
    if (!session || st.doc === prev.doc) return;
    if (!st.doc.nodes[session.id]) cancelTextEditing();
  });
}
