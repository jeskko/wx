<script lang="ts" module>
  import type { Basemap } from '../map/basemap';
  import type { MapLabel } from '../map/MapView.svelte';
  import type { Grid } from '../map/grid';
  export interface TempMapData {
    base: Basemap;
    grid: Grid | null;
    labels: MapLabel[]; // with temperature badges
    warmest: { name: string; t: number };
    coldest: { name: string; t: number };
    obsTime: string;
  }
</script>

<script lang="ts">
  import MapView from '../map/MapView.svelte';
  import { mapSize } from '../map/basemap';
  import { drawGridImage, tempRgb, T_LEGEND } from '../map/render';
  import { temp, time } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<TempMapData> = $props();
  const L = $derived(ctx.lang);
  const size = $derived(mapSize(data.base));

  let canvas: HTMLCanvasElement | undefined = $state();
  $effect(() => {
    const g = data.grid;
    if (!canvas || !g) return;
    const ti = Math.round(g.timeIndex(ctx.now.getTime()));
    const t = g.field('t', ti);
    const small = document.createElement('canvas');
    small.width = g.nx;
    small.height = g.ny;
    const sctx = small.getContext('2d')!;
    const img = sctx.createImageData(g.nx, g.ny);
    for (let j = 0; j < g.ny; j++)
      for (let i = 0; i < g.nx; i++) {
        const v = t[j * g.nx + i];
        if (Number.isNaN(v)) continue;
        const [r, gg, b] = tempRgb(v);
        const o = ((g.ny - 1 - j) * g.nx + i) * 4;
        img.data.set([r, gg, b, 120], o);
      }
    sctx.putImageData(img, 0, 0);
    canvas.width = size.w;
    canvas.height = size.h;
    drawGridImage(canvas.getContext('2d')!, small, g, data.base.extent, size.w, size.h);
  });
</script>

<div class="mapslide">
  <MapView base={data.base} w={size.w} h={size.h} labels={data.labels}>
    <canvas bind:this={canvas}></canvas>
  </MapView>
  <div class="panel side">
    <div class="lbl">{L === 'fi' ? 'Havainnot klo' : 'Observed at'} {time(L, data.obsTime, 'Europe/Helsinki')}</div>
    <dl>
      <dt>{L === 'fi' ? 'Lämpimintä' : 'Warmest'}</dt>
      <dd><b class="warm">{temp(data.warmest.t)}</b> {data.warmest.name}</dd>
      <dt>{L === 'fi' ? 'Kylmintä' : 'Coldest'}</dt>
      <dd><b class="cold">{temp(data.coldest.t)}</b> {data.coldest.name}</dd>
    </dl>
    <div class="scale">
      {#each T_LEGEND as tt (tt)}
        {@const c = tempRgb(tt)}
        <span style:background={`rgb(${c[0]},${c[1]},${c[2]})`}>{tt > 0 ? '+' : ''}{tt}</span>
      {/each}
    </div>
    <p class="note">{L === 'fi' ? 'Asemat: Ilmatieteen laitos · taustaväri: malli HARMONIE' : 'Stations: Finnish Meteorological Institute · shading: HARMONIE model'}</p>
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
    gap: 14px;
  }
  .lbl {
    font-size: 30px;
  }
  dl {
    margin: 0;
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 6px 18px;
    font-size: 30px;
    align-items: baseline;
  }
  dt {
    color: var(--c-label);
  }
  dd {
    margin: 0;
  }
  b {
    font-size: 44px;
    margin-right: 8px;
  }
  .warm {
    color: var(--c-warm);
  }
  .cold {
    color: var(--c-cold);
  }
  .scale {
    display: flex;
    margin-top: 10px;
  }
  .scale span {
    flex: 1;
    text-align: center;
    font-size: 18px;
    color: #000;
    text-shadow: none;
    padding: 4px 0;
  }
  .note {
    margin-top: auto;
    font-size: 20px;
    color: var(--c-label);
  }
</style>
