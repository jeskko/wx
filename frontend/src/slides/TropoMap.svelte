<script lang="ts" module>
  import type { Basemap } from '../map/basemap';
  import type { MapLabel } from '../map/MapView.svelte';
  import type { Grid } from '../map/grid';
  export interface TropoPoint {
    name: string;
    lat: number;
    lon: number;
  }
  export interface TropoData {
    base: Basemap;
    grid: Grid;
    labels: MapLabel[];
    points: TropoPoint[];
    origin: string;
  }

  /** Tropo index 0..10 → [r, g, b, a]; below ~1 (standard atmosphere) stays transparent. */
  const STOPS: [number, [number, number, number, number]][] = [
    [1, [60, 140, 230, 0]],
    [2, [60, 140, 230, 70]],
    [3, [40, 200, 200, 140]],
    [5, [245, 230, 60, 190]],
    [6.5, [250, 140, 30, 210]],
    [8, [230, 40, 40, 225]],
    [10, [200, 40, 220, 235]],
  ];

  export function tropoRgba(v: number): [number, number, number, number] {
    if (!(v > STOPS[0][0])) return [0, 0, 0, 0];
    for (let k = 1; k < STOPS.length; k++) {
      const [x1, c1] = STOPS[k];
      if (v <= x1) {
        const [x0, c0] = STOPS[k - 1];
        const f = (v - x0) / (x1 - x0);
        return [0, 1, 2, 3].map((i) => Math.round(c0[i] + (c1[i] - c0[i]) * f)) as [number, number, number, number];
      }
    }
    return STOPS[STOPS.length - 1][1];
  }

  /** Category of an index value: 0 normal … 4 strong ducting. */
  export function tropoLevel(v: number): number {
    return v < 1 ? 0 : v < 3 ? 1 : v < 5 ? 2 : v < 7.5 ? 3 : 4;
  }
</script>

<script lang="ts">
  // VHF/UHF tropospheric propagation for the next 48 h, animated (3-hourly frames, interpolated).
  import MapView from '../map/MapView.svelte';
  import { fitLoop, loopFraction } from '../lib/loop';
  import { mapSize } from '../map/basemap';
  import { forward } from '../map/proj';
  import { drawGridImage } from '../map/render';
  import { capitalize, time, weekday } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<TropoData> = $props();
  const L = $derived(ctx.lang);
  const size = $derived(mapSize(data.base));

  const LEVELS: Record<'fi' | 'en', string[]> = {
    fi: ['normaali', 'hieman parantunut', 'parantunut', 'kanavoitumista', 'voimakasta kanavoitumista'],
    en: ['normal', 'slightly enhanced', 'enhanced', 'ducting', 'strong ducting'],
  };
  const LEGEND = [0.5, 2, 4, 6.2, 8.8]; // representative values for the swatches

  let canvas: HTMLCanvasElement | undefined = $state();
  let tLabel = $state(0);
  let progress = $state(0);
  let now = $state<{ v: number; top: number }[]>([]);

  $effect(() => {
    if (!canvas) return;
    const g = data.grid;
    const { nx, ny } = g;
    const small = document.createElement('canvas');
    small.width = nx;
    small.height = ny;
    const sctx = small.getContext('2d')!;
    const img = sctx.createImageData(nx, ny);
    canvas.width = size.w;
    canvas.height = size.h;
    const c2d = canvas.getContext('2d')!;
    const pts = data.points.map((p) => forward(p.lat, p.lon));

    const start = Math.max(0, g.timeIndex(ctx.now.getTime()));
    const end = g.times.length - 1;
    const span = Math.max(1, end - start);
    // 48 h in ~10 s, fitted to the slide length
    const plan = fitLoop(ctx.duration, 10000, 1500);
    const t0 = performance.now();
    let raf = 0;
    let lastFrame = -1;

    const draw = (ms: number) => {
      const f = loopFraction(ms - t0, plan);
      const tf = start + f * span;
      progress = f;
      const i0 = Math.min(end, Math.floor(tf));
      const i1 = Math.min(end, i0 + 1);
      const ft = tf - i0;
      tLabel = g.times[i0] + (g.times[i1] - g.times[i0]) * ft;
      // redraw at most ~30 times a second worth of change; the field is coarse in time
      const key = Math.round(tf * 40);
      if (key !== lastFrame) {
        lastFrame = key;
        const a0 = g.field('tropo', i0);
        const a1 = g.field('tropo', i1);
        const d = img.data;
        for (let j = 0; j < ny; j++) {
          for (let i = 0; i < nx; i++) {
            const k = j * nx + i;
            const o = ((ny - 1 - j) * nx + i) * 4; // south row first -> flip
            const v = a0[k] + (a1[k] - a0[k]) * ft;
            const c = Number.isNaN(v) ? ([0, 0, 0, 0] as const) : tropoRgba(v);
            d[o] = c[0];
            d[o + 1] = c[1];
            d[o + 2] = c[2];
            d[o + 3] = c[3];
          }
        }
        sctx.putImageData(img, 0, 0);
        c2d.clearRect(0, 0, size.w, size.h);
        drawGridImage(c2d, small, g, data.base.extent, size.w, size.h);
        now = pts.map(([e, n]) => ({ v: g.sample('tropo', tf, e, n), top: g.sample('ductTop', Math.round(tf), e, n) }));
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  });

  const tz = 'Europe/Helsinki';
</script>

<div class="mapslide">
  <MapView base={data.base} w={size.w} h={size.h} labels={data.labels}>
    <canvas bind:this={canvas}></canvas>
  </MapView>
  <div class="panel side">
    <div class="day">{capitalize(weekday(L, new Date(tLabel), tz, 'long'))}</div>
    <div class="clock">{time(L, new Date(tLabel), tz)}</div>
    <div class="bar"><span style:width={`${progress * 100}%`}></span></div>
    <ul class="places">
      {#each data.points as p, i (p.name)}
        {@const s = now[i]}
        {#if s && !Number.isNaN(s.v)}
          {@const c = tropoRgba(Math.max(2.5, s.v))}
          <li>
            <span class="sw" style:background={s.v < 1 ? 'transparent' : `rgb(${c[0]},${c[1]},${c[2]})`}></span>
            <span class="pn">{p.name}</span>
            <span class="lv">{LEVELS[L][tropoLevel(s.v)]}{#if s.v >= 5 && s.top > 0}{' '}<small>· {L === 'fi' ? 'kanava' : 'duct'} {Math.round(s.top / 10) * 10} m</small>{/if}</span>
          </li>
        {/if}
      {/each}
    </ul>
    <ul class="legend">
      {#each LEGEND as v, k (k)}
        {@const c = tropoRgba(Math.max(2.5, v))}
        <li><span class="sw" style:background={k === 0 ? 'transparent' : `rgb(${c[0]},${c[1]},${c[2]})`}></span>{capitalize(LEVELS[L][k])}</li>
      {/each}
    </ul>
    <p class="note">
      {L === 'fi'
        ? 'Troposfäärin radiokeli ilmakehän taitekertoimesta · malli HARMONIE · Ilmatieteen laitos'
        : 'Tropospheric propagation from atmospheric refractivity · HARMONIE model · Finnish Meteorological Institute'}
    </p>
  </div>
</div>

<style>
  .mapslide {
    display: flex;
    gap: 22px;
    height: 100%;
  }
  .side {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .day {
    font-size: 32px;
    color: var(--c-accent);
  }
  .clock {
    font-size: 64px;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    height: 10px;
    background: var(--progress-track);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 8px;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--c-accent);
  }
  .places,
  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .places li {
    display: grid;
    grid-template-columns: 26px auto 1fr;
    align-items: baseline;
    gap: 10px;
    font-size: 23px;
  }
  .places .pn {
    color: var(--c-value);
    white-space: nowrap;
  }
  .places .lv {
    color: var(--c-label);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .places small {
    font-size: 19px;
  }
  .places .sw {
    align-self: center;
    width: 22px;
    height: 14px;
  }
  .legend {
    margin-top: 10px;
    font-size: 20px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 14px;
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .sw {
    width: 36px;
    height: 18px;
    border: 2px solid rgba(0, 0, 0, 0.5);
    flex: none;
  }
  .note {
    margin: auto 0 0;
    font-size: 17px;
    color: var(--c-label);
  }
</style>
