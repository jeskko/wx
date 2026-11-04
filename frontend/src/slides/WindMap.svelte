<script lang="ts" module>
  import type { Basemap } from '../map/basemap';
  import type { MapLabel } from '../map/MapView.svelte';
  import type { Grid } from '../map/grid';
  export interface WindData {
    base: Basemap;
    grid: Grid;
    labels: MapLabel[];
    strongest: { name: string; ws: number; wg: number | null }[];
  }
</script>

<script lang="ts">
  import MapView from '../map/MapView.svelte';
  import { mapSize } from '../map/basemap';
  import { pixel } from '../map/proj';
  import { num, time } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<WindData> = $props();
  const L = $derived(ctx.lang);
  const size = $derived(mapSize(data.base));

  const BANDS: [number, string][] = [
    [0, 'rgba(225,240,255,0.9)'],
    [4, 'rgba(120,220,255,0.95)'],
    [8, 'rgba(120,255,140,0.95)'],
    [11, 'rgba(255,235,60,1)'],
    [14, 'rgba(255,150,30,1)'],
    [17, 'rgba(255,60,60,1)'],
    [21, 'rgba(255,90,255,1)'],
  ];
  function color(ws: number) {
    let c = BANDS[0][1];
    for (const [lo, col] of BANDS) if (ws >= lo) c = col;
    return c;
  }

  let canvas: HTMLCanvasElement | undefined = $state();

  $effect(() => {
    if (!canvas) return;
    const W = size.w;
    const H = size.h;
    canvas.width = W;
    canvas.height = H;
    const c2d = canvas.getContext('2d')!;
    const grid = data.grid;
    const px = pixel(data.base.extent, W, H);
    const tf = grid.timeIndex(ctx.now.getTime());
    // speed: 10 m/s moves ~1.6 px per frame
    const k = 0.16;
    const N = 1400;
    const parts = Array.from({ length: N }, () => spawn());
    function spawn() {
      return { x: Math.random() * W, y: Math.random() * H, age: Math.floor(Math.random() * 90) };
    }
    let raf = 0;
    const step = () => {
      c2d.globalCompositeOperation = 'destination-out';
      c2d.fillStyle = 'rgba(0,0,0,0.075)';
      c2d.fillRect(0, 0, W, H);
      c2d.globalCompositeOperation = 'source-over';
      c2d.lineWidth = 1.8;
      c2d.lineCap = 'round';
      for (const p of parts) {
        const [e, nm] = px.toMap(p.x, p.y);
        const u = grid.sample('u', tf, e, nm);
        const v = grid.sample('v', tf, e, nm);
        if (Number.isNaN(u) || p.age-- <= 0) {
          Object.assign(p, spawn(), { age: 60 + Math.floor(Math.random() * 60) });
          continue;
        }
        const ws = Math.hypot(u, v);
        const nx = p.x + u * k;
        const ny = p.y - v * k;
        c2d.strokeStyle = color(ws);
        c2d.beginPath();
        c2d.moveTo(p.x, p.y);
        c2d.lineTo(nx, ny);
        c2d.stroke();
        p.x = nx;
        p.y = ny;
        if (p.x < 0 || p.y < 0 || p.x > W || p.y > H) Object.assign(p, spawn());
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  });

  const validAt = $derived(new Date(data.grid.times[Math.round(data.grid.timeIndex(ctx.now.getTime()))]));
</script>

<div class="mapslide">
  <MapView base={data.base} w={size.w} h={size.h} labels={data.labels}>
    <canvas bind:this={canvas}></canvas>
  </MapView>
  <div class="panel side">
    <div class="lbl">{L === 'fi' ? 'Tuuliennuste klo' : 'Wind forecast for'} {time(L, validAt, 'Europe/Helsinki')}</div>
    <h3>{L === 'fi' ? 'Tuulen nopeus' : 'Wind speed'}</h3>
    <ul class="legend">
      {#each BANDS as [lo, col], i (lo)}
        <li><span class="sw" style:background={col}></span>{lo}{i < BANDS.length - 1 ? `–${BANDS[i + 1][0]}` : '+'} m/s</li>
      {/each}
    </ul>
    {#if data.strongest.length}
      <h3>{L === 'fi' ? 'Kovimmat tuulet nyt' : 'Strongest winds now'}</h3>
      <table>
        <tbody>
          {#each data.strongest as s (s.name)}
            <tr>
              <td>{s.name}</td>
              <td class="r">{num(s.ws)} m/s</td>
              <td class="r g">{s.wg != null ? `(${num(s.wg)})` : ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    <p class="note">{L === 'fi' ? 'Malli: HARMONIE · Ilmatieteen laitos' : 'Model: HARMONIE · Finnish Meteorological Institute'}</p>
  </div>
</div>

<style>
  .mapslide {
    display: flex;
    gap: 22px;
    height: 100%;
  }
  canvas {
    mix-blend-mode: normal;
  }
  .side {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lbl {
    font-size: 30px;
    color: var(--c-value);
  }
  h3 {
    margin: 8px 0 0;
    font-size: 26px;
    color: var(--c-accent);
  }
  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 16px;
    font-size: 22px;
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .sw {
    width: 36px;
    height: 8px;
    border-radius: 4px;
  }
  table {
    font-size: 24px;
    border-collapse: collapse;
  }
  td {
    padding: 1px 6px 1px 0;
  }
  .r {
    text-align: right;
  }
  .g {
    color: var(--c-label);
  }
  .note {
    margin-top: auto;
    font-size: 20px;
    color: var(--c-label);
  }
</style>
