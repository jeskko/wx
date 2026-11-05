<script lang="ts" module>
  export interface FieldCity {
    name: string;
    lat: number;
    lon: number;
  }
</script>

<script lang="ts">
  // Animated model map: temperature colours + precipitation over a basemap, with city badges
  // showing the model temperature at the animated time. Used by the world region and capital views.
  import MapView, { type MapLabel } from '../map/MapView.svelte';
  import { projector, type Basemap } from '../map/basemap';
  import type { Grid } from '../map/grid';
  import { drawGridImage, tempRgb } from '../map/render';
  import { pixel } from '../map/proj';
  import { temp } from '../lib/format';

  let {
    base,
    grid,
    w,
    h,
    cities = [],
    startMs,
    hours = 48,
    duration = 10000,
    time = $bindable(0),
    progress = $bindable(0),
    wind = false,
  }: {
    base: Basemap;
    grid: Grid;
    w: number;
    h: number;
    cities?: FieldCity[];
    /** animation start (usually now) */
    startMs: number;
    hours?: number;
    /** ms for one pass */
    duration?: number;
    time?: number;
    progress?: number;
    /** animate wind particles from the grid's u/v fields (m/s along map axes) */
    wind?: boolean;
  } = $props();

  // precipitation mm/h -> colour (same family as the radar palette)
  const PR: [number, [number, number, number, number]][] = [
    [0.1, [120, 210, 255, 170]],
    [0.5, [40, 200, 90, 215]],
    [1, [40, 220, 60, 235]],
    [2, [255, 232, 40, 245]],
    [4, [255, 150, 20, 250]],
    [8, [235, 35, 35, 255]],
  ];

  const fwd = $derived(projector(base));
  // badges in list order (= priority): skip ones too close to the edge or to a badge already placed
  const placedCities = $derived.by(() => {
    const px = pixel(base.extent, w, h, fwd);
    const out: (FieldCity & { m: [number, number]; p: [number, number] })[] = [];
    for (const c of cities) {
      const p = px.fromLatLon(c.lat, c.lon);
      if (p[0] < 30 || p[0] > w - 30 || p[1] < 18 || p[1] > h - 34) continue;
      if (out.some((o) => Math.abs(o.p[0] - p[0]) < 62 && Math.abs(o.p[1] - p[1]) < 48)) continue;
      out.push({ ...c, m: fwd(c.lat, c.lon), p });
    }
    return out;
  });
  let labels = $state<MapLabel[]>([]);
  let canvas: HTMLCanvasElement | undefined = $state();
  let pcanvas: HTMLCanvasElement | undefined = $state();

  $effect(() => {
    if (!canvas) return;
    const g = grid;
    const { nx, ny } = g;
    const small = document.createElement('canvas');
    small.width = nx;
    small.height = ny;
    const sctx = small.getContext('2d')!;
    const img = sctx.createImageData(nx, ny);
    canvas.width = w;
    canvas.height = h;
    const c2d = canvas.getContext('2d')!;
    const t0i = g.timeIndex(startMs);
    const t1i = g.timeIndex(startMs + hours * 3600_000);
    const span = Math.max(0.001, t1i - t0i);
    const HOLD = 1500;
    let t0 = performance.now();
    let raf = 0;
    let lastBadge = -1;

    // wind particles: short white trails; pixel speed is visual (10 m/s ~ 1.3 px per frame)
    const pc = wind && pcanvas ? pcanvas.getContext('2d') : null;
    if (pcanvas) {
      pcanvas.width = w;
      pcanvas.height = h;
    }
    const px = pixel(base.extent, w, h, fwd);
    const K = 0.13;
    const spawn = () => ({ x: Math.random() * w, y: Math.random() * h, age: 40 + Math.floor(Math.random() * 80) });
    const parts = pc ? Array.from({ length: Math.round((w * h) / 320) }, spawn) : [];
    const moveParticles = (tf: number) => {
      if (!pc) return;
      pc.globalCompositeOperation = 'destination-out';
      pc.fillStyle = 'rgba(0,0,0,0.09)';
      pc.fillRect(0, 0, w, h);
      pc.globalCompositeOperation = 'source-over';
      pc.lineWidth = 1.2;
      pc.lineCap = 'round';
      pc.strokeStyle = 'rgba(255,255,255,0.7)';
      pc.beginPath();
      for (const p of parts) {
        const [e, n] = px.toMap(p.x, p.y);
        const u = g.sample('u', tf, e, n);
        const v = g.sample('v', tf, e, n);
        if (Number.isNaN(u) || Number.isNaN(v) || p.age-- <= 0) {
          Object.assign(p, spawn());
          continue;
        }
        const nx2 = p.x + u * K;
        const ny2 = p.y - v * K;
        pc.moveTo(p.x, p.y);
        pc.lineTo(nx2, ny2);
        p.x = nx2;
        p.y = ny2;
        if (p.x < 0 || p.y < 0 || p.x > w || p.y > h) Object.assign(p, spawn());
      }
      pc.stroke();
    };

    const draw = (now: number) => {
      let el = now - t0;
      if (el > duration + HOLD) {
        t0 = now;
        el = 0;
      }
      const f = Math.min(1, el / duration);
      const tf = t0i + f * span;
      progress = f;
      const i0 = Math.floor(tf);
      const i1 = Math.min(g.times.length - 1, i0 + 1);
      const ft = tf - i0;
      time = g.times[i0] + (g.times[i1] - g.times[i0]) * ft;
      const T0 = g.field('t', i0);
      const T1 = g.field('t', i1);
      const P0 = g.field('pr', i0);
      const P1 = g.field('pr', i1);
      const d = img.data;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          const o = ((ny - 1 - j) * nx + i) * 4;
          const tv = T0[k] + (T1[k] - T0[k]) * ft;
          if (Number.isNaN(tv)) {
            d[o + 3] = 0;
            continue;
          }
          const pr = P0[k] + (P1[k] - P0[k]) * ft;
          let col: [number, number, number, number] | null = null;
          for (const [lo, rgba] of PR) if (pr >= lo) col = rgba;
          if (col) {
            d[o] = col[0];
            d[o + 1] = col[1];
            d[o + 2] = col[2];
            d[o + 3] = col[3];
          } else {
            const [r, gg, b] = tempRgb(tv);
            d[o] = r;
            d[o + 1] = gg;
            d[o + 2] = b;
            d[o + 3] = 125;
          }
        }
      }
      sctx.putImageData(img, 0, 0);
      c2d.clearRect(0, 0, w, h);
      drawGridImage(c2d, small, g, base.extent, w, h);
      moveParticles(tf);
      // badges: refresh a few times per second, not every frame
      const bucket = Math.floor(el / 250);
      if (bucket !== lastBadge) {
        lastBadge = bucket;
        labels = placedCities
          .map((c) => {
            const v = g.sample('t', tf, c.m[0], c.m[1]);
            if (Number.isNaN(v)) return null;
            const [r, gg, b] = tempRgb(v);
            return { lat: c.lat, lon: c.lon, text: c.name, badge: temp(v), badgeColor: `rgb(${r},${gg},${b})` } as MapLabel;
          })
          .filter((x): x is MapLabel => !!x);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  });
</script>

<MapView {base} {w} {h} {labels} outline>
  <canvas bind:this={canvas}></canvas>
  {#if wind}<canvas bind:this={pcanvas}></canvas>{/if}
</MapView>
