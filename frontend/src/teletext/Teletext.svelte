<script lang="ts">
  // Teletext presentation: a Level 1.5 decoder on a 4:3 screen. Runs as an in-vision carousel
  // ("Pages from Ceefax") through the enabled pages and their subpages; typing a page number,
  // the colour keys or clicking a page number holds a page for a while, like a real set.
  import { untrack } from 'svelte';
  import type { Config } from '../engine/config';
  import type { Place } from '../lib/types';
  import { C, COLS, ROWS } from './codes';
  import { decode } from './decode';
  import { dm, wd } from './fmt';
  import { Layout } from './page';
  import { carousel, pageDef, PAGES } from './pages';
  import { frame, makeEnv } from './service';
  import { loadFont, paint } from './render';

  let { config, places }: { config: Config; places: Place[] } = $props();
  const L = $derived(config.lang);

  const IDLE_MS = 120_000; // manual selection returns to the carousel after this
  const CACHE_MS = 90_000;

  let canvas: HTMLCanvasElement | undefined = $state();
  let box = $state({ w: 800, h: 600 });
  let wide = $state(false);

  // what is on screen
  let pageNum = $state(100);
  let subs = $state<Uint8Array[]>([]);
  let subIdx = $state(0);
  // header state
  let typed = $state(''); // digits typed so far
  let rolling = $state<number | null>(null); // page number rolling in the header while searching
  let wanted = $state<number | null>(null); // page being searched for (status field)
  let hold = $state(false);
  let manual = false;
  let seqPos = -1;
  let subTimer = 0;
  let idleTimer = 0;
  let token = 0;

  const cache = new Map<number, { at: number; subs: Promise<Uint8Array[] | null> }>();

  function build(num: number): Promise<Uint8Array[] | null> {
    const hit = cache.get(num);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.subs;
    const def = pageDef(num);
    const p = (async () => {
      if (!def) return null;
      try {
        const env = makeEnv(config.lang, config, places, new Date());
        const layouts = await def.build(env);
        if (!layouts?.length) return null;
        return layouts.map((l) => {
          const bytes = l.encode();
          if (l.lost.length && import.meta.env.DEV) console.debug(`teletext ${num}: attributes ate content`, l.lost);
          return bytes;
        });
      } catch (e) {
        console.warn('teletext page', num, e);
        return null;
      }
    })();
    cache.set(num, { at: Date.now(), subs: p });
    // a failed build shouldn't stick
    void p.then((r) => r == null && cache.delete(num));
    return p;
  }

  const seq = $derived(carousel(config));
  const secondsFor = (num: number) => seq.find((s) => s.num === num)?.seconds ?? 12;

  /** Search for a page: roll the header until it is built (at least ~1 s, as on a real set). */
  async function goto(num: number, auto: boolean): Promise<boolean> {
    const my = ++token;
    clearTimeout(subTimer);
    wanted = num;
    let r = pageNum;
    rolling = r;
    const roll = window.setInterval(() => {
      r = r >= 899 ? 100 : r + 1 + Math.floor(Math.random() * 6);
      rolling = r;
    }, 45);
    const [res] = await Promise.all([build(num), new Promise((ok) => setTimeout(ok, auto ? 900 : 700))]);
    clearInterval(roll);
    if (my !== token) return false;
    rolling = null;
    wanted = null;
    if (!res) {
      if (auto) return false;
      subs = [notFound(num)];
    } else subs = res;
    pageNum = num;
    subIdx = 0;
    typed = '';
    scheduleSub();
    return !!res;
  }

  function notFound(num: number): Uint8Array {
    const lay = frame({ title: L === 'fi' ? 'Sivua ei löydy' : 'Page not found' });
    lay.text(5, 2, L === 'fi' ? `Sivua ${num} ei ole juuri nyt` : `Page ${num} is not available`, C.White);
    lay.text(6, 2, L === 'fi' ? 'saatavilla.' : 'right now.', C.White);
    lay.text(9, 2, L === 'fi' ? 'Etusivu 100' : 'Index 100', C.Yellow);
    return lay.encode();
  }

  function scheduleSub() {
    clearTimeout(subTimer);
    if (hold) return;
    subTimer = window.setTimeout(() => {
      if (subIdx < subs.length - 1) {
        subIdx++;
        scheduleSub();
      } else if (!manual) void next();
      else {
        subIdx = 0; // a held page keeps rotating its subpages
        scheduleSub();
      }
    }, secondsFor(pageNum) * 1000);
  }

  /** Next page of the carousel (skips pages that have nothing to show). */
  async function next() {
    for (let tries = 0; tries < seq.length; tries++) {
      seqPos = (seqPos + 1) % seq.length;
      const num = seq[seqPos].num;
      if (await goto(num, true)) {
        // fetch the one after in the background so the next search is short
        const after = seq[(seqPos + 1) % seq.length]?.num;
        if (after) void build(after);
        return;
      }
      if (manual) return;
    }
  }

  function poke() {
    manual = true;
    clearTimeout(idleTimer);
    idleTimer = window.setTimeout(() => {
      manual = false;
      hold = false;
      // carry on from the page shown, or from the start
      seqPos = seq.findIndex((s) => s.num === pageNum);
      void next();
    }, IDLE_MS);
  }

  function select(num: number) {
    poke();
    void goto(num, false);
  }

  /** Neighbour page in number order. */
  function neighbour(dir: 1 | -1): number {
    const nums = PAGES.map((p) => p.num);
    const i = nums.indexOf(pageNum);
    if (i < 0) return nums[0];
    return nums[(i + dir + nums.length) % nums.length];
  }

  const fastext = $derived.by(() => {
    const def = pageDef(pageNum);
    const prev = pageDef(neighbour(-1));
    const nxt = pageDef(neighbour(1));
    // yellow: the page's section index; on an index page, the other section
    const SECTIONS = [100, 400, 600];
    const sec = pageDef(SECTIONS.includes(pageNum) ? (pageNum === 400 ? 600 : pageNum === 600 ? 400 : 600) : (def?.section ?? 100));
    const lab = (d: typeof def) => (d?.short ?? d?.title)?.[L] ?? '';
    return [
      { num: prev?.num ?? 100, label: lab(prev), colour: C.Red },
      { num: nxt?.num ?? 100, label: lab(nxt), colour: C.Green },
      { num: sec?.num ?? 100, label: lab(sec), colour: C.Yellow },
      { num: 100, label: L === 'fi' ? 'Etusivu' : 'Index', colour: C.Cyan },
    ];
  });

  /** Fastext row 24: labels packed left to right, one attribute cell before each; the
   *  longest label is shortened until all four fit in 40 cells. Each label keeps a quarter of
   *  the row if it fits there, so the row looks the same from page to page. */
  const fastextLayout = $derived.by(() => {
    const labels = fastext.map((f) => f.label);
    while (labels.reduce((n, l) => n + l.length + 1, 0) > COLS) {
      const k = labels.reduce((a, l, i) => (l.length > labels[a].length ? i : a), 0);
      labels[k] = labels[k].slice(0, -1);
    }
    let col = 1;
    return fastext.map((f, i) => {
      col = Math.max(col, i * 10 + 1);
      const out = { ...f, label: labels[i], col };
      col += labels[i].length + 1;
      return out;
    });
  });

  function onKey(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tgt = e.target as HTMLElement | null;
    if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'SELECT' || tgt.tagName === 'TEXTAREA')) return;
    if (/^[0-9]$/.test(e.key)) {
      poke();
      // first digit 1-8, as on a real set
      if (!typed && (e.key === '0' || e.key === '9')) return;
      typed += e.key;
      if (typed.length === 3) {
        const n = Number(typed);
        void goto(n, false);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowRight':
        select(neighbour(1));
        break;
      case 'ArrowLeft':
        select(neighbour(-1));
        break;
      case 'ArrowUp':
      case 'ArrowDown':
        if (subs.length > 1) {
          poke();
          subIdx = (subIdx + (e.key === 'ArrowDown' ? 1 : subs.length - 1)) % subs.length;
          scheduleSub();
        }
        break;
      case ' ':
        e.preventDefault();
        poke();
        hold = !hold;
        if (hold) clearTimeout(subTimer);
        else scheduleSub();
        break;
      case 'r':
      case 'g':
      case 'y':
      case 'c':
        select(fastext['rgyc'.indexOf(e.key)].num);
        break;
      case 'w':
        wide = !wide;
        break;
    }
  }

  // ------------------------------------------------------------------ drawing
  let now = $state(new Date());
  let flashOn = $state(true);

  function header(): Uint8Array {
    const h = new Layout();
    const req = hold ? 'HOLD' : typed ? `P${typed.padEnd(3, '-')}` : `P${wanted ?? pageNum}`;
    h.text(0, 1, req, hold ? C.Red : C.White);
    h.text(0, 8, 'wx.fi', C.Yellow);
    h.text(0, 14, String(rolling ?? pageNum), rolling != null ? C.Green : C.White);
    const tz = 'Europe/Helsinki';
    h.text(0, 18, `${wd(L, now, tz)} ${dm(L, now, tz)}`, C.White);
    const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZone: tz }).format(now);
    h.text(0, 31, clock, C.Yellow);
    for (const f of fastextLayout) h.text(24, f.col, f.label, f.colour);
    return h.encode(0);
  }

  function draw() {
    if (!canvas) return;
    const g = canvas.getContext('2d');
    if (!g) return;
    const page = new Uint8Array(ROWS * COLS).fill(0x20);
    const sub = subs[subIdx];
    if (sub) page.set(sub.subarray(COLS, 24 * COLS), COLS);
    const hdr = header();
    page.set(hdr.subarray(0, COLS), 0);
    page.set(hdr.subarray(24 * COLS), 24 * COLS);
    const W = canvas.width;
    const H = canvas.height;
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    // safe area: the text doesn't reach the edges of a TV picture
    const mx = W * 0.05;
    const my = H * 0.04;
    paint(g, decode(page), mx, my, W - 2 * mx, H - 2 * my, flashOn);
  }

  function resize() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const aspect = wide ? 16 / 9 : 4 / 3;
    const w = Math.min(vw, vh * aspect);
    box = { w, h: w / aspect };
  }

  $effect(() => {
    void wide;
    resize();
  });

  $effect(() => {
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(box.w * dpr);
    canvas.height = Math.round(box.h * dpr);
    untrack(draw);
  });

  // redraw on any state change
  $effect(() => {
    void [subs, subIdx, pageNum, typed, rolling, wanted, hold, now, flashOn, L];
    draw();
  });

  function onClick(ev: MouseEvent) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = rect.width * 0.05;
    const my = rect.height * 0.04;
    const col = Math.floor(((ev.clientX - rect.left - mx) / (rect.width - 2 * mx)) * COLS);
    const row = Math.floor(((ev.clientY - rect.top - my) / (rect.height - 2 * my)) * ROWS);
    if (row === 24) {
      const f = fastextLayout.find((x) => col >= x.col - 1 && col < x.col + x.label.length) ?? fastextLayout[Math.min(3, Math.floor(col / 10))];
      select(f.num);
      return;
    }
    // a page number under the pointer (index pages, "Säähakemisto 400" links)
    const sub = subs[subIdx];
    if (!sub || row < 1 || row > 23) return;
    const text = Array.from(sub.subarray(row * COLS, (row + 1) * COLS), (b) => (b >= 0x30 && b <= 0x39 ? String.fromCharCode(b) : ' ')).join('');
    for (const m of text.matchAll(/\b[1-8]\d\d\b/g)) {
      if (col >= m.index! - 1 && col <= m.index! + 3) {
        select(Number(m[0]));
        return;
      }
    }
  }

  $effect(() => {
    let alive = true;
    void loadFont().then(() => alive && draw());
    const tick = window.setInterval(() => {
      const t = Date.now();
      flashOn = t % 1000 < 750;
      if (Math.floor(t / 1000) !== Math.floor(now.getTime() / 1000)) now = new Date(t);
    }, 125);
    window.addEventListener('resize', resize);
    seqPos = -1;
    untrack(() => void next());
    return () => {
      alive = false;
      clearInterval(tick);
      clearTimeout(subTimer);
      clearTimeout(idleTimer);
      window.removeEventListener('resize', resize);
      token++;
    };
  });
</script>

<svelte:window onkeydown={onKey} />

<div class="tv">
  <div class="screen" style:width={`${box.w}px`} style:height={`${box.h}px`}>
    <canvas bind:this={canvas} onclick={onClick}></canvas>
    <div class="scan"></div>
  </div>
</div>

<style>
  .tv {
    position: fixed;
    inset: 0;
    background: #000;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .screen {
    position: relative;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: pointer;
  }
  /* a faint hint of interlaced lines; the page itself stays pixel-exact */
  .scan {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.18) 0 1px, transparent 1px 3px);
  }
</style>
