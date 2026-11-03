/**
 * Read-only CodeMirror viewer themed with the app's CSS variables, so it
 * follows the dark/light theme automatically.
 */
import { useEffect, useRef } from 'react';
import { Compartment, EditorSelection, EditorState } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLineGutter, keymap, lineNumbers } from '@codemirror/view';
import { HighlightStyle, bracketMatching, codeFolding, foldGutter, syntaxHighlighting } from '@codemirror/language';
import { defaultKeymap } from '@codemirror/commands';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { tags as t } from '@lezer/highlight';
import './export.css';

export type CodeLang = 'html' | 'css' | 'js';

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.modifier, t.operatorKeyword, t.controlKeyword], color: 'var(--code-keyword)' },
  { tag: [t.tagName, t.standard(t.tagName)], color: 'var(--code-tag)' },
  { tag: [t.attributeName, t.propertyName], color: 'var(--code-attr)' },
  { tag: [t.string, t.attributeValue, t.special(t.string)], color: 'var(--code-string)' },
  { tag: [t.number, t.unit, t.bool, t.atom, t.color], color: 'var(--code-number)' },
  { tag: [t.className, t.labelName, t.typeName], color: 'var(--code-class)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: 'var(--code-fn)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--code-comment)', fontStyle: 'italic' },
  { tag: [t.definitionKeyword, t.self, t.special(t.variableName)], color: 'var(--code-keyword)' },
  { tag: [t.angleBracket, t.bracket, t.punctuation, t.separator], color: 'var(--code-punct)' },
  { tag: t.variableName, color: 'var(--code-var)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--text-0)', fontSize: '11.5px' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6' },
  '.cm-content': { padding: '8px 0', caretColor: 'var(--accent)' },
  '.cm-gutters': { backgroundColor: 'transparent', color: 'var(--text-3)', border: 'none', paddingLeft: '4px' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-1)' },
  '.cm-foldGutter .cm-gutterElement': { color: 'var(--text-3)', cursor: 'pointer' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--code-selection) !important' },
  '.cm-selectionMatch': { backgroundColor: 'var(--accent-softer)' },
  '.cm-matchingBracket': { backgroundColor: 'var(--accent-soft)', outline: 'none' },
  '.cm-searchMatch': { backgroundColor: 'var(--warning-soft)', outline: '1px solid var(--warning)' },
  '.cm-panels': { backgroundColor: 'var(--bg-2)', color: 'var(--text-0)', borderColor: 'var(--border)' },
  '.cm-panel input, .cm-panel button': { fontFamily: 'var(--font-ui)', fontSize: '11.5px' },
  '.cm-foldPlaceholder': { backgroundColor: 'var(--bg-3)', border: 'none', color: 'var(--text-2)', padding: '0 4px' },
  '.cm-k-reveal': { backgroundColor: 'var(--select-soft)' },
});

function langExt(lang: CodeLang) {
  return lang === 'html' ? html() : lang === 'css' ? css() : javascript();
}

export function CodeViewer({
  value,
  lang,
  reveal,
  ariaLabel,
}: {
  value: string;
  lang: CodeLang;
  /** Text to scroll to and select (e.g. the selected element's class). */
  reveal?: string | null;
  ariaLabel?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const langComp = useRef(new Compartment());
  const lastReveal = useRef<string | null>(null);

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          codeFolding(),
          foldGutter(),
          drawSelection(),
          bracketMatching(),
          highlightSelectionMatches(),
          search({ top: true }),
          keymap.of([...searchKeymap, ...defaultKeymap]),
          EditorState.readOnly.of(true),
          EditorView.contentAttributes.of({ 'aria-label': ariaLabel ?? 'Generated code', 'aria-readonly': 'true' }),
          syntaxHighlighting(highlight),
          theme,
          langComp.current.of(langExt(lang)),
        ],
      }),
    });
    view.current = v;
    return () => {
      v.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: langComp.current.reconfigure(langExt(lang)) });
  }, [lang]);

  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const cur = v.state.doc.toString();
    if (cur !== value) {
      const top = v.scrollDOM.scrollTop;
      v.dispatch({ changes: { from: 0, to: cur.length, insert: value } });
      lastReveal.current = null;
      v.scrollDOM.scrollTop = top;
    }
    if (reveal && reveal !== lastReveal.current) {
      const i = value.indexOf(reveal);
      if (i >= 0) {
        lastReveal.current = reveal;
        v.dispatch({
          selection: EditorSelection.single(i, i + reveal.length),
          effects: EditorView.scrollIntoView(i, { y: 'center' }),
        });
      }
    } else if (!reveal) lastReveal.current = null;
  }, [value, reveal]);

  return <div ref={host} className="k-code" />;
}
