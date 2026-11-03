/**
 * The tiny, dependency-free runtime shipped as `script.js` when a page uses
 * interactive animation triggers. Everything visual lives in CSS; the script
 * only toggles state classes:
 *
 *   [data-k-inview]  → adds `is-inview` once the element scrolls into view
 *   [data-k-hover]   → (re)adds `is-hovered` on pointerenter
 *                      (`data-k-hover="loop"` removes it again on pointerleave)
 *   [data-k-click]   → (re)adds `is-clicked` on every click
 *   [data-k-each]    → numbers elements matched by `selector[; selector…]`
 *                      with `--k-i` (`--k-i-2`, …) for staggered delays
 */

export interface RuntimeFeatures {
  inView: boolean;
  hover: boolean;
  click: boolean;
  each: boolean;
  /** Show in-view content immediately for users who prefer reduced motion. */
  respectReducedMotion: boolean;
}

export function runtimeSource(f: RuntimeFeatures): string {
  const lines: string[] = [];
  lines.push(
    '/* Kinema animation runtime — toggles state classes; all motion is in styles.css. */',
    '(function () {',
    "  'use strict';",
    '  var doc = document;',
    '  function all(sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); }',
  );
  if (f.hover || f.click) {
    lines.push(
      '  function restart(el, cls) {',
      '    el.classList.remove(cls);',
      '    void el.offsetWidth;',
      '    el.classList.add(cls);',
      '  }',
    );
  }
  if (f.each) {
    lines.push(
      "  all('[data-k-each]').forEach(function (el) {",
      "    el.getAttribute('data-k-each').split(';').forEach(function (sel, n) {",
      "      var name = n ? '--k-i-' + (n + 1) : '--k-i';",
      '      try {',
      '        all(sel.trim(), el).forEach(function (target, i) { target.style.setProperty(name, String(i)); });',
      '      } catch (e) { /* invalid selector */ }',
      '    });',
      '  });',
    );
  }
  if (f.inView) {
    lines.push(
      "  var pending = all('[data-k-inview]');",
      '  var show = function (el) { el.classList.add(\'is-inview\'); };',
      f.respectReducedMotion
        ? "  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;"
        : '  var reduce = false;',
      "  if (reduce || !('IntersectionObserver' in window)) {",
      '    pending.forEach(show);',
      '  } else {',
      '    var io = new IntersectionObserver(function (entries) {',
      '      entries.forEach(function (entry) {',
      '        if (entry.isIntersecting) {',
      '          show(entry.target);',
      '          io.unobserve(entry.target);',
      '        }',
      '      });',
      "    }, { rootMargin: '0px 0px -8% 0px', threshold: 0 });",
      '    pending.forEach(function (el) { io.observe(el); });',
      '  }',
    );
  }
  if (f.hover) {
    lines.push(
      "  all('[data-k-hover]').forEach(function (el) {",
      "    el.addEventListener('pointerenter', function () { restart(el, 'is-hovered'); });",
      "    if (el.getAttribute('data-k-hover') === 'loop') {",
      "      el.addEventListener('pointerleave', function () { el.classList.remove('is-hovered'); });",
      '    }',
      '  });',
    );
  }
  if (f.click) {
    lines.push(
      "  all('[data-k-click]').forEach(function (el) {",
      "    el.addEventListener('click', function () { restart(el, 'is-clicked'); });",
      '  });',
    );
  }
  lines.push('})();', '');
  return lines.join('\n');
}

/** Whitespace/comment minifier for the runtime (its source is written to be ASI-safe). */
export function minifyRuntime(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('')
    .replace(/\s*([{}();,:=+|!?<>])\s*/g, '$1')
    .replace(/\bfunction\(/g, 'function(');
}
