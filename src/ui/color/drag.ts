/** Pointer-drag helper: captures the pointer and reports moves until release. */
export function startDrag(
  e: React.PointerEvent,
  onMove: (ev: PointerEvent) => void,
  onEnd?: (ev: PointerEvent, moved: boolean) => void,
  opts: { immediate?: boolean; threshold?: number } = {},
) {
  if (e.button !== 0) return;
  const el = e.currentTarget as HTMLElement;
  el.setPointerCapture?.(e.pointerId);
  const sx = e.clientX;
  const sy = e.clientY;
  let moved = false;
  const threshold = opts.threshold ?? 2;
  if (opts.immediate) onMove(e.nativeEvent);
  const move = (ev: PointerEvent) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < threshold && !opts.immediate) return;
    moved = true;
    onMove(ev);
  };
  const up = (ev: PointerEvent) => {
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    onEnd?.(ev, moved);
  };
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

/** 0..1 position of a pointer inside an element's box. */
export function relPos(el: HTMLElement, ev: { clientX: number; clientY: number }) {
  const r = el.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (ev.clientX - r.left) / (r.width || 1))),
    y: Math.min(1, Math.max(0, (ev.clientY - r.top) / (r.height || 1))),
  };
}
