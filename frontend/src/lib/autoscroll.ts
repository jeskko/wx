// Svelte action: if the element's content overflows, hold still for a moment, then scroll
// smoothly to the bottom so that it arrives shortly before the slide ends, and stay there.
//
//   <div class="list" use:autoscroll={{ total: ctx.duration * 1000 }}>…</div>
//
// The element needs a bounded height and `overflow: hidden`.

export interface AutoscrollOpts {
  /** time the slide is on screen (ms) */
  total: number;
  /** still time before scrolling starts (ms) */
  hold?: number;
  /** still time at the bottom (ms) */
  tail?: number;
  /** never slower than this (px/s), so short slides still scroll visibly */
  minSpeed?: number;
}

export function autoscroll(node: HTMLElement, opts: AutoscrollOpts) {
  let raf = 0;
  let timer = 0;

  function run(o: AutoscrollOpts) {
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    node.scrollTop = 0;
    const hold = o.hold ?? 2500;
    const tail = o.tail ?? 1500;
    timer = window.setTimeout(() => {
      const dist = node.scrollHeight - node.clientHeight;
      if (dist <= 2) return;
      const avail = Math.max(1000, o.total - hold - tail);
      const ms = Math.min(avail, (dist / (o.minSpeed ?? 25)) * 1000);
      const t0 = performance.now();
      const step = (now: number) => {
        const f = Math.min(1, (now - t0) / ms);
        // ease in/out
        const e = f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
        node.scrollTop = dist * e;
        if (f < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, hold);
  }

  // wait a frame so layout (fonts, images) has settled
  requestAnimationFrame(() => run(opts));
  return {
    update(o: AutoscrollOpts) {
      run(o);
    },
    destroy() {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
    },
  };
}
