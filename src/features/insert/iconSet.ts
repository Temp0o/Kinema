/** All lucide icons (deduplicated aliases) with lazily rendered SVG markup. */
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { icons } from 'lucide-react';

export interface IconEntry {
  /** PascalCase export name, e.g. ArrowRight */
  name: string;
  /** kebab-case label, e.g. arrow-right */
  label: string;
  Comp: ComponentType<Record<string, unknown>>;
}

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Za-z])(\d)/g, '$1-$2').toLowerCase();

let cache: IconEntry[] | null = null;

export function allIcons(): IconEntry[] {
  if (cache) return cache;
  const byComp = new Map<unknown, string[]>();
  for (const [name, Comp] of Object.entries(icons)) {
    const list = byComp.get(Comp) ?? [];
    list.push(name);
    byComp.set(Comp, list);
  }
  const out: IconEntry[] = [];
  for (const [Comp, names] of byComp) {
    const primary = [...names].sort((a, b) => a.length - b.length)[0];
    const aliases = names.filter((n) => n !== primary).map(kebab);
    out.push({ name: primary, label: [kebab(primary), ...aliases].join(' '), Comp: Comp as IconEntry['Comp'] });
  }
  cache = out.sort((a, b) => a.name.localeCompare(b.name));
  return cache;
}

/** Standalone, editable SVG markup (stroke currentColor) for an icon. */
export function iconSvgMarkup(entry: IconEntry, size = 48, strokeWidth = 2): string {
  const markup = renderToStaticMarkup(createElement(entry.Comp, { size, strokeWidth, color: 'currentColor', absoluteStrokeWidth: false }));
  const withNs = /xmlns=/.test(markup) ? markup : markup.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  return withNs.replace(/\sclass="[^"]*"/, '');
}
