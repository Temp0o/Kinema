/**
 * Spotlight overlay + coach-mark card + paused pill for the onboarding tour.
 * Never traps the user: Pause / Skip are always reachable, a missing target falls
 * back to a centred, non-blocking card, and every DOM read is defensive.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from 'zustand';
import { ArrowLeft, ArrowRight, GraduationCap, MousePointerClick, Pause, Play, X } from 'lucide-react';
import { useUI } from '@/core/store/uiStore';
import { Button, Kbd } from '@/ui/primitives';
import type { TourStep } from './engine';
import { placeCard, padBox, unionBoxes, type Box } from './geometry';
import { tour } from './tour';
import './tour.css';

const WAIT_MS = 2000;
/** Open app layers (dialogs, menus, popovers, palette) that own Escape. */
const FOREIGN_LAYERS = '.k-dialog, .k-menu, .k-popover, .k-select-content, .k-cmdk';

function resolveTarget(step: TourStep): Element[] {
  const t = step.target;
  if (!t) return [];
  try {
    if (typeof t === 'function') {
      const r = t();
      return (Array.isArray(r) ? r : r ? [r] : []).filter((e) => e?.isConnected);
    }
    const sel = /^[[.#]/.test(t) ? t : `[data-tour="${t}"]`;
    const el = document.querySelector(sel);
    return el ? [el] : [];
  } catch {
    return [];
  }
}

/** Element box; `display: contents` wrappers measure their children. */
function measure(el: Element, depth = 0): Box | null {
  const r = el.getBoundingClientRect();
  if (r.width > 0 || r.height > 0) return { x: r.left, y: r.top, w: r.width, h: r.height };
  if (depth > 2) return null;
  return unionBoxes([...el.children].map((c) => measure(c, depth + 1)).filter((b): b is Box => !!b));
}

const sameBox = (a: Box | null, b: Box | null) => a === b || (!!a && !!b && Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y) && Math.round(a.w) === Math.round(b.w) && Math.round(a.h) === Math.round(b.h));

function useAccent() {
  const route = useUI((s) => s.route);
  const mode = useUI((s) => s.mode);
  const preview = useUI((s) => s.previewOpen);
  if (route !== 'editor') return 'var(--accent)';
  return preview ? 'var(--mode-preview)' : mode === 'animate' ? 'var(--mode-animate)' : 'var(--mode-design)';
}

export function TourOverlay() {
  const phase = useStore(tour.store, (s) => s.phase);
  const restore = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (phase === 'running' && !restore.current) restore.current = document.activeElement as HTMLElement | null;
    if (phase === 'idle' && restore.current) {
      if (restore.current.isConnected) restore.current.focus?.({ preventScroll: true });
      restore.current = null;
    }
  }, [phase]);
  if (phase === 'idle' || typeof document === 'undefined') return null;
  return createPortal(phase === 'paused' ? <TourPill /> : <TourSpotlight />, document.body);
}

function TourPill() {
  const index = useStore(tour.store, (s) => s.index);
  const accent = useAccent();
  return (
    <div className="k-tour-pill" role="status" aria-label="Tour paused" style={{ ['--tour-accent' as string]: accent }}>
      <GraduationCap className="k-tour-pill__icon" />
      <span>
        Tour paused · step {Math.max(1, index)} of {tour.steps.length - 1}
      </span>
      <button className="k-tour-pill__btn k-tour-pill__btn--primary" onClick={() => tour.resume()}>
        <Play /> Resume
      </button>
      <button className="k-tour-pill__btn" onClick={() => tour.exit()} aria-label="Exit tour">
        Exit
      </button>
    </div>
  );
}

function TourSpotlight() {
  const { index, epoch, confirmingExit } = useStore(tour.store);
  const step = tour.steps[index];
  const accent = useAccent();
  const [box, setBox] = useState<Box | null>(null);
  const [missing, setMissing] = useState(false);
  const [nudge, setNudge] = useState(0);
  const [vw, setVw] = useState(() => window.innerWidth);
  const [vh, setVh] = useState(() => window.innerHeight);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = useState({ w: 340, h: 220 });

  const centred = !step?.target;

  // Track the target: rAF while active (layout, scroll, panel changes), ResizeObserver for size changes.
  useEffect(() => {
    if (!step) return;
    setBox(null);
    setMissing(false);
    if (centred) return;
    const started = performance.now();
    let raf = 0;
    let lastCheck = 0;
    let observed: Element | null = null;
    let current: Box | null = null;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => tick(performance.now(), true)) : null;
    const tick = (now: number, fromObserver = false) => {
      try {
        if (now - lastCheck > 120) {
          lastCheck = now;
          if (tour.checkUntil()) return;
        }
        const els = resolveTarget(step);
        const b = unionBoxes(els.map((e) => measure(e)).filter((x): x is Box => !!x));
        if (els[0] !== observed && ro) {
          if (observed) ro.unobserve(observed);
          observed = els[0] ?? null;
          if (observed) ro.observe(observed);
        }
        if (b) {
          if (!sameBox(b, current)) setBox((current = b));
          setMissing(false);
        } else {
          if (current) setBox((current = null));
          if (now - started > WAIT_MS) {
            if (step.optional) return tour.skipCurrent();
            setMissing(true);
          }
        }
      } catch {
        /* never break the app because the DOM changed under us */
      }
      if (!fromObserver) raf = requestAnimationFrame((t) => tick(t));
    };
    raf = requestAnimationFrame((t) => tick(t));
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [epoch]);

  // Centred steps can still have an `until` condition.
  useEffect(() => {
    if (!centred || typeof step?.advance !== 'object') return;
    const id = window.setInterval(() => tour.checkUntil(), 150);
    return () => window.clearInterval(id);
  }, [epoch, centred, step]);

  useEffect(() => {
    const onResize = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // 'click-target' steps advance after the app has handled the click.
  useEffect(() => {
    if (step?.advance !== 'click-target') return;
    const onClick = (e: MouseEvent) => {
      const els = resolveTarget(step);
      if (els.some((el) => el.contains(e.target as Node))) {
        const at = tour.store.getState().epoch;
        window.setTimeout(() => tour.store.getState().epoch === at && tour.next(), 60);
      }
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [epoch, step]);

  // Keyboard: Esc asks to leave; arrows navigate while the card has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inCard = !!cardRef.current?.contains(document.activeElement);
      if (e.key === 'Escape') {
        if (document.querySelector(FOREIGN_LAYERS)) return;
        const a = document.activeElement as HTMLElement | null;
        if (!inCard && a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) return;
        e.preventDefault();
        e.stopImmediatePropagation();
        tour.askExit(!tour.store.getState().confirmingExit);
        return;
      }
      if (!inCard || tour.store.getState().confirmingExit) return;
      if (e.key === 'ArrowRight' && step?.advance === 'next') {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (index === tour.steps.length - 1) tour.complete();
        else tour.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopImmediatePropagation();
        tour.back();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [index, step]);

  // Focus the card on each step (not a button, so Space/Enter keep working in the app).
  const showCard = centred || !!box || missing;
  useEffect(() => {
    if (showCard) cardRef.current?.focus({ preventScroll: true });
  }, [epoch, showCard]);
  useEffect(() => {
    if (confirmingExit) cardRef.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
  }, [confirmingExit]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (Math.abs(w - cardSize.w) > 1 || Math.abs(h - cardSize.h) > 1) setCardSize({ w, h });
  });

  if (!step) return null;
  if (!showCard) return <div className="k-tour" aria-hidden />; // briefly waiting for the target

  const large = !!box && (box.w > 420 || box.h > 320);
  const hole = box ? padBox(box, large ? 2 : 6, vw, vh) : null;
  const pos = placeCard(hole, cardSize.w, cardSize.h, missing ? 'center' : (step.placement ?? 'bottom'), vw, vh);
  const blocking = !missing; // a missing target never blocks the screen
  const isFirst = index === 0;
  const isLast = index === tour.steps.length - 1;
  const interactive = step.advance !== 'next';
  const total = tour.steps.length - 1;

  const onBlocked = () => setNudge((n) => n + 1);

  return (
    <div className="k-tour" style={{ ['--tour-accent' as string]: accent }} data-step={step.id}>
      {hole ? (
        <>
          <div className="k-tour__hole" style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }} />
          <div className="k-tour__ring" style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }} />
          {blocking && (
            <>
              <div className="k-tour__block" style={{ left: 0, top: 0, right: 0, height: hole.y }} onPointerDown={onBlocked} />
              <div className="k-tour__block" style={{ left: 0, top: hole.y + hole.h, right: 0, bottom: 0 }} onPointerDown={onBlocked} />
              <div className="k-tour__block" style={{ left: 0, top: hole.y, width: hole.x, height: hole.h }} onPointerDown={onBlocked} />
              <div className="k-tour__block" style={{ left: hole.x + hole.w, top: hole.y, right: 0, height: hole.h }} onPointerDown={onBlocked} />
            </>
          )}
        </>
      ) : (
        <div className={missing ? 'k-tour__dim k-tour__dim--soft' : 'k-tour__dim'} data-blocking={blocking ? 'true' : undefined} onPointerDown={blocking ? onBlocked : undefined} />
      )}

      <div
        ref={cardRef}
        className="k-tour-card"
        role="dialog"
        aria-modal="false"
        aria-labelledby="k-tour-title"
        aria-describedby="k-tour-body"
        tabIndex={-1}
        data-side={pos.side}
        data-welcome={isFirst ? 'true' : undefined}
        style={{ left: pos.x, top: pos.y }}
      >
        <div className="k-tour-card__top">
          {isFirst ? (
            <span className="k-tour-card__count">
              <GraduationCap /> Interactive tour · 2 min
            </span>
          ) : (
            <span className="k-tour-card__count">
              Step {index} of {total}
            </span>
          )}
          {!isFirst && (
            <div className="k-tour-card__progress" aria-hidden>
              <i style={{ width: `${(index / total) * 100}%` }} />
            </div>
          )}
        </div>
        <h2 id="k-tour-title" className="k-tour-card__title" aria-live="polite">
          {step.title}
        </h2>
        <p id="k-tour-body" className="k-tour-card__body">
          {step.body}
        </p>
        {missing && <p className="k-tour-card__missing">{step.missing ?? 'This part of the app isn’t on screen right now. Carry on with Next, or pause and come back.'}</p>}
        {interactive && step.prompt && !missing && (
          <div className="k-tour-card__prompt" key={nudge} data-nudge={nudge ? 'true' : undefined}>
            <MousePointerClick />
            <span>{step.prompt}</span>
          </div>
        )}

        {confirmingExit ? (
          <div className="k-tour-card__confirm" role="alertdialog" aria-label="Leave the tour?">
            <p>Leave the tour? You can replay it any time from Help.</p>
            <div className="k-tour-card__actions">
              <Button size="sm" variant="ghost" onClick={() => tour.exit()}>
                Leave tour
              </Button>
              <Button size="sm" variant="ghost" icon={<Pause />} onClick={() => tour.pause()}>
                Pause
              </Button>
              <Button size="sm" variant="primary" data-autofocus onClick={() => tour.askExit(false)}>
                Keep going
              </Button>
            </div>
          </div>
        ) : isFirst ? (
          <div className="k-tour-card__foot">
            <button className="k-tour-card__link" onClick={() => tour.exit()}>
              Don’t show again
            </button>
            <div className="k-tour-card__actions">
              <Button size="sm" variant="ghost" onClick={() => tour.exit()}>
                Skip
              </Button>
              <Button size="sm" variant="primary" onClick={() => tour.next()}>
                Take the tour (2 min) <ArrowRight />
              </Button>
            </div>
          </div>
        ) : (
          <div className="k-tour-card__foot">
            <div className="k-tour-card__actions">
              {!isLast && (
                <>
                  <Button size="sm" variant="ghost" icon={<Pause />} onClick={() => tour.pause()} title="Pause the tour and explore freely">
                    Pause
                  </Button>
                  <Button size="sm" variant="ghost" icon={<X />} onClick={() => tour.exit()}>
                    Skip tour
                  </Button>
                </>
              )}
            </div>
            <div className="k-tour-card__actions">
              <Button size="sm" variant="ghost" icon={<ArrowLeft />} onClick={() => tour.back()} aria-label="Back">
                Back
              </Button>
              {isLast ? (
                <Button size="sm" variant="primary" onClick={() => tour.complete()}>
                  Finish
                </Button>
              ) : interactive && !missing ? (
                <Button size="sm" variant="ghost" className="k-tour-card__skipstep" onClick={() => tour.next()}>
                  Skip step
                </Button>
              ) : (
                <Button size="sm" variant="primary" onClick={() => tour.next()}>
                  Next <ArrowRight />
                </Button>
              )}
            </div>
          </div>
        )}
        {!confirmingExit && (
          <div className="k-tour-card__keys" aria-hidden>
            {interactive ? (
              <span>Do it in the app to continue</span>
            ) : (
              <span>
                <Kbd keys="←" /> <Kbd keys="→" /> navigate
              </span>
            )}
            <span>
              <Kbd keys="Esc" /> exit
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
