<script lang="ts" module>
  import type { Basemap } from '../map/basemap';
  import type { MapLabel } from '../map/MapView.svelte';
  import type { Grid } from '../map/grid';
  export interface CloudData {
    base: Basemap;
    grid: Grid;
    labels: MapLabel[];
  }
</script>

<script lang="ts">
  // Next 24 h of model cloud cover and precipitation, animated hour by hour (interpolated).
  import MapView from '../map/MapView.svelte';
  import { fitLoop, loopFraction } from '../lib/loop';
  import { mapSize } from '../map/basemap';
  import { drawGridImage } from '../map/render';
  import { capitalize, time, weekday } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<CloudData> = $props();
  const L = $derived(ctx.lang);
  const size = $derived(mapSize(data.base));

  // precipitation mm/h -> colour (same family as the radar palette)
  const PR: [number, [number, number, number, number]][] = [
    [0.1, [120, 210, 255, 150]],
    [0.5, [40, 200, 90, 205]],
    [1, [40, 220, 60, 230]],
    [2, [255, 232, 40, 240]],
    [4, [255, 150, 20, 250]],
    [8, [235, 35, 35, 255]],
  ];

  let canvas: HTMLCanvasElement | undefined = $state();
  let tLabel = $state(0);
  let progress = $state(0);

  $effect(() => {
    if (!canvas) return;
    const g = data.grid;
    const { nx, ny } = g;
    // draw at grid resolution into an offscreen canvas, then scale up smoothly
    const small = document.createElement('canvas');
    small.width = nx;
    small.height = ny;
    const sctx = small.getContext('2d')!;
    const img = sctx.createImageData(nx, ny);
    canvas.width = size.w;
    canvas.height = size.h;
    const c2d = canvas.getContext('2d')!;

    const start = g.timeIndex(ctx.now.getTime());
    const end = g.times.length - 1;
    const span = Math.max(1, end - start);
    // the full 24 h in ~9 s, fitted to the slide length
    const plan = fitLoop(ctx.duration, 9000, 1500);
    const t0 = performance.now();
    let raf = 0;

    const draw = (now: number) => {
      const f = loopFraction(now - t0, plan);
      const tf = start + f * span;
      progress = f;
      tLabel = g.times[0] + tf * 3600_000;
      const i0 = Math.floor(tf);
      const i1 = Math.min(end, i0 + 1);
      const ft = tf - i0;
      const c0 = g.field('cloud', i0);
      const c1 = g.field('cloud', i1);
      const p0 = g.field('pr', i0);
      const p1 = g.field('pr', i1);
      const d = img.data;
      for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
          const k = j * nx + i;
          const o = ((ny - 1 - j) * nx + i) * 4; // south row first -> flip
          const cl = c0[k] + (c1[k] - c0[k]) * ft;
          const pr = p0[k] + (p1[k] - p0[k]) * ft;
          let col: [number, number, number, number] | null = null;
          for (const [lo, rgba] of PR) if (pr >= lo) col = rgba;
          if (col) {
            d[o] = col[0];
            d[o + 1] = col[1];
            d[o + 2] = col[2];
            d[o + 3] = col[3];
          } else {
            // clouds: white, opacity grows with cover; thin cover stays mostly clear
            const a = Math.max(0, (cl - 15) / 85);
            d[o] = 245;
            d[o + 1] = 248;
            d[o + 2] = 255;
            d[o + 3] = Math.round(a * 175);
          }
        }
      }
      sctx.putImageData(img, 0, 0);
      c2d.clearRect(0, 0, size.w, size.h);
      drawGridImage(c2d, small, g, data.base.extent, size.w, size.h);
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
    <h3>{L === 'fi' ? 'Sade' : 'Precipitation'} (mm/h)</h3>
    <ul class="legend">
      {#each PR as [lo, c] (lo)}
        <li><span class="sw" style:background={`rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`}></span>{lo}+</li>
      {/each}
      <li><span class="sw cloud"></span>{L === 'fi' ? 'pilvisyys' : 'cloud cover'}</li>
    </ul>
    <p class="note">{L === 'fi' ? 'Seuraavat 24 tuntia · malli HARMONIE · Ilmatieteen laitos' : 'Next 24 hours · HARMONIE model · Finnish Meteorological Institute'}</p>
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
  }
  .day {
    font-size: 32px;
    color: var(--c-accent);
  }
  .clock {
    font-size: 84px;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    height: 10px;
    background: var(--progress-track);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 12px;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--c-accent);
  }
  h3 {
    margin: 0;
    font-size: 26px;
    color: var(--c-accent);
  }
  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px 16px;
    font-size: 23px;
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .sw {
    width: 40px;
    height: 20px;
    border: 2px solid rgba(0, 0, 0, 0.5);
  }
  .sw.cloud {
    background: rgba(245, 248, 255, 0.75);
  }
  .note {
    margin-top: auto;
    font-size: 20px;
    color: var(--c-label);
  }
</style>
