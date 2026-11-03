/**
 * Small CodeMirror 6 wrapper themed with the editor's CSS variables.
 */
import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { keymap } from '@codemirror/view';
import { EditorState, Prec } from '@codemirror/state';
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

const highlight = HighlightStyle.define([
  { tag: [t.propertyName, t.attributeName], color: 'var(--cm-prop)' },
  { tag: [t.number, t.unit, t.integer, t.float], color: 'var(--cm-num)' },
  { tag: [t.string, t.attributeValue, t.special(t.string)], color: 'var(--cm-str)' },
  { tag: [t.keyword, t.atom, t.bool, t.color, t.constant(t.name)], color: 'var(--cm-kw)' },
  { tag: [t.tagName, t.className, t.typeName], color: 'var(--cm-tag)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--text-3)', fontStyle: 'italic' },
  { tag: [t.punctuation, t.separator, t.bracket, t.angleBracket], color: 'var(--text-2)' },
  { tag: [t.variableName, t.function(t.variableName), t.labelName], color: 'var(--cm-fn)' },
]);

const theme = EditorView.theme({
  '&': {
    fontSize: '11.5px',
    backgroundColor: 'var(--bg-2)',
    color: 'var(--text-0)',
    borderRadius: 'var(--r-sm)',
    border: '1px solid var(--border)',
  },
  '&.cm-focused': { outline: 'none', borderColor: 'var(--accent)' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55' },
  '.cm-content': { caretColor: 'var(--text-0)', padding: '6px 0' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--text-3)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--accent-softer)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-1)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': { backgroundColor: 'var(--accent-soft) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--text-0)' },
  '.cm-tooltip': { backgroundColor: 'var(--bg-elev)', border: '1px solid var(--border-strong)', color: 'var(--text-0)' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--accent)', color: '#fff' },
  '.cm-foldGutter span': { color: 'var(--text-3)' },
  '.cm-matchingBracket': { backgroundColor: 'var(--accent-soft)', outline: 'none' },
});

export interface CodeEditorProps {
  value: string;
  onChange?: (v: string) => void;
  /** Mod+Enter */
  onSubmit?: (v: string) => void;
  onBlur?: (v: string) => void;
  language: 'css' | 'html';
  minHeight?: number;
  maxHeight?: number;
  ariaLabel?: string;
  /** compact: no line numbers / folding gutter */
  compact?: boolean;
}

export function CodeEditor({ value, onChange, onSubmit, onBlur, language, minHeight = 120, maxHeight = 360, ariaLabel, compact }: CodeEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const cbs = useRef({ onChange, onSubmit, onBlur });
  cbs.current = { onChange, onSubmit, onBlur };

  useEffect(() => {
    const extensions = [
      basicSetup,
      language === 'css' ? css() : html(),
      syntaxHighlighting(highlight),
      theme,
      EditorView.lineWrapping,
      EditorView.theme({ '&': { minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px` }, '.cm-scroller': { overflow: 'auto' } }),
      Prec.highest(
        keymap.of([
          {
            key: 'Mod-Enter',
            run: (v) => {
              cbs.current.onSubmit?.(v.state.doc.toString());
              return true;
            },
          },
        ]),
      ),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) cbs.current.onChange?.(u.state.doc.toString());
        if (u.focusChanged && !u.view.hasFocus) cbs.current.onBlur?.(u.state.doc.toString());
      }),
      EditorView.contentAttributes.of({ 'aria-label': ariaLabel ?? 'Code editor' }),
    ];
    if (compact) extensions.push(EditorView.theme({ '.cm-gutters': { display: 'none' } }));
    const v = new EditorView({ state: EditorState.create({ doc: value, extensions }), parent: host.current! });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, compact]);

  // sync external value when not being edited
  useEffect(() => {
    const v = view.current;
    if (!v || v.hasFocus) return;
    const cur = v.state.doc.toString();
    if (cur !== value) v.dispatch({ changes: { from: 0, to: cur.length, insert: value } });
  }, [value]);

  return <div ref={host} className="k-code" onKeyDown={(e) => e.stopPropagation()} />;
}
