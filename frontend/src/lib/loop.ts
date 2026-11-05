// Fit map animations to the slide: a whole number of passes that ends exactly when the slide
// changes, so a pass is never cut off right after it restarts.

/** Time lost at the start of a slide (fade-in delay), not used for animation. */
export const LEAD_MS = 250;
/** The slide usually stays up a little longer than planned (the next slide loads first):
 *  after the planned passes the last frame is held this long before looping again
 *  (only happens when the show is paused). */
export const GRACE_MS = 4000;

export interface LoopPlan {
  /** ms of one pass of the animation itself */
  play: number;
  /** ms the last frame is held before the next pass */
  hold: number;
  /** number of passes on the slide */
  loops: number;
}

/**
 * playMs + holdMs is the natural length of one pass; it is stretched or squeezed (by at most
 * about a third) so that `loops` passes fill the slide. The hold never exceeds a quarter of a pass.
 */
export function fitLoop(slideSeconds: number, playMs: number, holdMs: number): LoopPlan {
  const avail = Math.max(2000, slideSeconds * 1000 - LEAD_MS);
  const loops = Math.max(1, Math.round(avail / (playMs + holdMs)));
  const cycle = avail / loops;
  const hold = Math.min(holdMs, cycle * 0.25);
  return { play: cycle - hold, hold, loops };
}

/** Animation position 0..1 at `el` ms after the slide appeared (continuous animations). */
export function loopFraction(el: number, p: LoopPlan): number {
  const cycle = p.play + p.hold;
  const planned = p.loops * cycle;
  if (el >= planned) {
    const extra = el - planned;
    if (extra < GRACE_MS) return 1;
    el = extra - GRACE_MS;
  }
  return Math.min(1, (el % cycle) / p.play);
}

/**
 * Frame timer for stepped loops (radar, road conditions): `n` frames, the last one held.
 * Calls `show(k)` for each frame; returns a stop function.
 */
export function frameLoop(n: number, slideSeconds: number, frameMs: number, holdMs: number, show: (k: number) => void): () => void {
  if (n < 2) {
    show(0);
    return () => {};
  }
  const plan = fitLoop(slideSeconds, frameMs * (n - 1), holdMs);
  const per = plan.play / (n - 1);
  let k = 0;
  let pass = 0;
  let timer = 0;
  const tick = () => {
    k = (k + 1) % n;
    show(k);
    if (k === n - 1) pass++;
    // the last planned pass holds until the slide changes (with a grace period)
    timer = window.setTimeout(tick, k === n - 1 ? plan.hold + (pass === plan.loops ? GRACE_MS : 0) : per);
  };
  show(0);
  timer = window.setTimeout(tick, per);
  return () => clearTimeout(timer);
}
