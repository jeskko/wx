<script lang="ts" module>
  import type { Basemap } from '../map/basemap';
  import type { MapLabel } from '../map/MapView.svelte';
  import type { MagStation, Ovation } from '../lib/types';
  export interface AuroraMapData {
    base: Basemap;
    ovation: Ovation;
    labels: MapLabel[];
    kpNow: number | null;
    placeProb: number | null;
    mags: MagStation[];
  }
</script>

<script lang="ts">
  // NOAA OVATION aurora probability over Fennoscandia, drawn as a glow.
  import MapView from '../map/MapView.svelte';
  import { mapSize } from '../map/basemap';
  import { inverse, pixel } from '../map/proj';
  import { activity, ACTIVITY_COLOR, kpColor, type Activity } from '../lib/aurora';
  import { t } from '../i18n';
  import { num, time } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<AuroraMapData> = $props();
  const L = $derived(ctx.lang);
  const size = $derived(mapSize(data.base));

  function prob(lat: number, lon: number): number {
    const ov = data.ovation;
    const gy = lat - ov.lat0;
    const gx = lon - ov.lon0;
    const ny = ov.grid.length;
    const nx = ov.grid[0].length;
    if (gx < 0 || gy < 0 || gx > nx - 1 || gy > ny - 1) return 0;
    const i = Math.min(nx - 2, Math.floor(gx));
    const j = Math.min(ny - 2, Math.floor(gy));
    const fx = gx - i;
    const fy = gy - j;
    const g = ov.grid;
    return g[j][i] * (1 - fx) * (1 - fy) + g[j][i + 1] * fx * (1 - fy) + g[j + 1][i] * (1 - fx) * fy + g[j + 1][i + 1] * fx * fy;
  }

  const magDots = $derived.by(() => {
    const px = pixel(data.base.extent, size.w, size.h);
    return data.mags.map((m) => ({ m, act: activity(m.range), xy: px.fromLatLon(m.lat, m.lon) }));
  });
  const ACTS: Activity[] = ['quiet', 'low', 'moderate', 'high'];

  let canvas: HTMLCanvasElement | undefined = $state();
  $effect(() => {
    if (!canvas) return;
    const S = 4; // compute every 4th pixel, scale up smoothly
    const w = Math.ceil(size.w / S);
    const h = Math.ceil(size.h / S);
    const small = document.createElement('canvas');
    small.width = w;
    small.height = h;
    const sctx = small.getContext('2d')!;
    const img = sctx.createImageData(w, h);
    const px = pixel(data.base.extent, size.w, size.h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const [e, n] = px.toMap(x * S + S / 2, y * S + S / 2);
        const [lat, lon] = inverse(e, n);
        const p = prob(lat, lon);
        if (p < 2) continue;
        const a = Math.min(1, (p - 2) / 35);
        const o = (y * w + x) * 4;
        // green glow, purple core for strong activity
        img.data.set(p > 50 ? [200, 90, 255, 235] : [70, 255, 150, Math.round(a * 235)], o);
      }
    sctx.putImageData(img, 0, 0);
    canvas.width = size.w;
    canvas.height = size.h;
    const c2d = canvas.getContext('2d')!;
    c2d.imageSmoothingEnabled = true;
    c2d.filter = 'blur(6px)';
    c2d.drawImage(small, 0, 0, size.w, size.h);
  });
</script>

<div class="mapslide">
  <MapView base={data.base} w={size.w} h={size.h} labels={data.labels} night>
    <canvas bind:this={canvas}></canvas>
    <svg class="mags" width={size.w} height={size.h}>
      {#each magDots as d (d.m.name)}
        <circle cx={d.xy[0]} cy={d.xy[1]} r="9" fill={ACTIVITY_COLOR[d.act]} class="mdot" />
      {/each}
    </svg>
  </MapView>
  <div class="panel side">
    <div class="lbl">Kp {L === 'fi' ? 'nyt' : 'now'}</div>
    <div class="kp" style:color={kpColor(data.kpNow ?? 0)}>{num(L, data.kpNow, 1)}</div>
    {#if data.placeProb != null}
      <div class="lbl">{ctx.place.name[L]}: <b>{Math.round(data.placeProb)} %</b></div>
    {/if}
    <div class="mlegend">
      <div class="mtitle">{t(L, 'localActivity')}</div>
      {#each ACTS as a (a)}
        <span><i style:background={ACTIVITY_COLOR[a]}></i>{t(L, `activity.${a}` as 'activity.quiet')}</span>
      {/each}
    </div>
    <p class="expl">
      {L === 'fi'
        ? 'Vihreä alue näyttää, missä revontulia todennäköisesti näkyy taivaalla juuri nyt (NOAA OVATION -malli).'
        : 'Green shows where aurora is likely overhead right now (NOAA OVATION model).'}
    </p>
    <p class="note">
      {L === 'fi' ? 'Ennuste klo' : 'Forecast for'} {time(L, data.ovation.forecast, 'Europe/Helsinki')} · NOAA SWPC
    </p>
  </div>
</div>

<style>
  .mapslide {
    display: flex;
    gap: 22px;
    height: 100%;
  }
  canvas {
    mix-blend-mode: screen;
  }
  .side {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .lbl {
    font-size: 28px;
    color: var(--c-label);
  }
  .lbl b {
    color: var(--c-value);
    font-size: 36px;
  }
  .kp {
    font-size: 110px;
    font-weight: 700;
    line-height: 1;
  }
  .mags {
    position: absolute;
    inset: 0;
  }
  .mdot {
    stroke: #000;
    stroke-width: 2.5;
    filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.6));
  }
  .mlegend {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    font-size: 22px;
    margin-top: 6px;
  }
  .mtitle {
    width: 100%;
    color: var(--c-label);
    font-size: 22px;
  }
  .mlegend span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .mlegend i {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid #000;
  }
  .expl {
    font-size: 25px;
    line-height: 1.3;
  }
  .note {
    margin-top: auto;
    font-size: 20px;
    color: var(--c-label);
  }
</style>
