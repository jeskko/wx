<script lang="ts" module>
  import type { Basemap } from '../map/basemap';
  import type { MapLabel } from '../map/MapView.svelte';
  export interface AuroraGlobeData {
    north: Basemap;
    south: Basemap;
    /** OVATION probability %, 360 x 92 (see backend swpc.ovation_png) */
    ov: Uint8Array;
    labels: { n: MapLabel[]; s: MapLabel[] };
    kpNow: number | null;
    kpMax24: number | null;
    forecast: string;
  }

  /** Rows of the OVATION image: 0..45 = 90..45 N, 46..91 = 45..90 S. */
  export function ovationAt(ov: Uint8Array, lat: number, lon: number): number {
    const al = Math.abs(lat);
    if (al < 45) return 0;
    const r = 90 - al; // 0 at the pole
    const r0 = Math.min(45, Math.floor(r));
    const r1 = Math.min(45, r0 + 1);
    const fr = r - r0;
    const base = lat >= 0 ? 0 : 46;
    // southern rows run from 45 S (row 46) to 90 S (row 91)
    const row = (k: number) => (lat >= 0 ? base + k : base + (45 - k));
    const x = ((lon % 360) + 360) % 360;
    const c0 = Math.floor(x);
    const c1 = (c0 + 1) % 360;
    const fc = x - c0;
    const v = (rr: number, cc: number) => ov[row(rr) * 360 + cc];
    const a = v(r0, c0) * (1 - fc) + v(r0, c1) * fc;
    const b = v(r1, c0) * (1 - fc) + v(r1, c1) * fc;
    return a * (1 - fr) + b * fr;
  }
</script>

<script lang="ts">
  // Both auroral ovals (NOAA SWPC OVATION) on polar maps, with the night side shaded.
  import MapView from '../map/MapView.svelte';
  import { laea } from '../map/laea';
  import { num, time } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<AuroraGlobeData> = $props();
  const L = $derived(ctx.lang);
  const S = 500;

  /** Subsolar point (lat, lon) — simple almanac formulas, good to a degree. */
  function subsolar(d: Date): [number, number] {
    const n = (d.getTime() - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400_000;
    const g = (2 * Math.PI * (n - 1)) / 365;
    const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g);
    const eot = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
    const utcMin = d.getUTCHours() * 60 + d.getUTCMinutes() + d.getUTCSeconds() / 60;
    return [(decl * 180) / Math.PI, -(utcMin + eot - 720) / 4];
  }

  function paint(canvas: HTMLCanvasElement, base: Basemap) {
    const W = S;
    const H = S;
    canvas.width = W;
    canvas.height = H;
    const c2d = canvas.getContext('2d')!;
    const img = c2d.createImageData(W, H);
    const d = img.data;
    const p = laea(base.proj!);
    const [x0, , x1, y1] = base.extent;
    const sx = (x1 - x0) / W;
    const [slat, slon] = subsolar(ctx.now);
    const D = Math.PI / 180;
    const ss = Math.sin(slat * D);
    const cs = Math.cos(slat * D);
    const B = 2; // compute in 2 px blocks
    for (let j = 0; j < H; j += B) {
      for (let i = 0; i < W; i += B) {
        const [lat, lon] = p.inverse(x0 + (i + B / 2) * sx, y1 - (j + B / 2) * sx);
        const sinAlt = Math.sin(lat * D) * ss + Math.cos(lat * D) * cs * Math.cos((lon - slon) * D);
        const alt = Math.asin(sinAlt) / D;
        // night shade: twilight ramps in between 0 and -12 degrees
        let r = 0,
          g = 0,
          b = 20,
          a = Math.max(0, Math.min(1, -alt / 12)) * 120;
        const v = ovationAt(data.ov, lat, lon);
        if (v >= 2) {
          // green -> yellow -> red with probability, fading in from 2 % (soft edge)
          const f = Math.min(1, Math.max(0, v - 4) / 60);
          const k = Math.min(1, (v - 2) / 8); // 0..1 over 2-10 %
          r = Math.round((f < 0.5 ? 80 + f * 2 * 175 : 255) * k + r * (1 - k));
          g = Math.round((f < 0.5 ? 255 : 255 - (f - 0.5) * 2 * 200) * k + g * (1 - k));
          b = Math.round(60 * k + b * (1 - k));
          a = Math.max(a, k * (110 + Math.min(1, v / 50) * 130));
        }
        for (let dj = 0; dj < B; dj++)
          for (let di = 0; di < B; di++) {
            const o = ((j + dj) * W + i + di) * 4;
            d[o] = r;
            d[o + 1] = g;
            d[o + 2] = b;
            d[o + 3] = a;
          }
      }
    }
    c2d.putImageData(img, 0, 0);
  }

  let cn: HTMLCanvasElement | undefined = $state();
  let cs: HTMLCanvasElement | undefined = $state();
  $effect(() => {
    if (cn) paint(cn, data.north);
    if (cs) paint(cs, data.south);
  });

  const LEG = [5, 20, 40, 60];
  const legColor = (v: number) => {
    const f = Math.min(1, (v - 4) / 60);
    const r = f < 0.5 ? Math.round(80 + f * 2 * 175) : 255;
    const g = f < 0.5 ? 255 : Math.round(255 - (f - 0.5) * 2 * 200);
    return `rgb(${r},${g},60)`;
  };
</script>

<div class="ag">
  <div class="discs">
    <figure>
      <div class="disc"><MapView base={data.north} w={S} h={S} labels={data.labels.n} outline><canvas bind:this={cn}></canvas></MapView></div>
      <figcaption>{L === 'fi' ? 'Pohjoinen pallonpuolisko' : 'Northern hemisphere'}</figcaption>
    </figure>
    <figure>
      <div class="disc"><MapView base={data.south} w={S} h={S} labels={data.labels.s} outline><canvas bind:this={cs}></canvas></MapView></div>
      <figcaption>{L === 'fi' ? 'Eteläinen pallonpuolisko' : 'Southern hemisphere'}</figcaption>
    </figure>
  </div>
  <div class="panel side">
    <div class="kl">Kp</div>
    <div class="kp">{data.kpNow == null ? '–' : num(L, data.kpNow, 1)}</div>
    {#if data.kpMax24 != null}
      <div class="k24">{L === 'fi' ? 'enintään' : 'up to'} {num(L, data.kpMax24, 1)} <small>{L === 'fi' ? 'vrk:n sisällä' : 'within 24 h'}</small></div>
    {/if}
    <ul class="legend">
      {#each LEG as v (v)}
        <li><i style:background={legColor(v)}></i>{v}+ %</li>
      {/each}
      <li><i class="night"></i>{L === 'fi' ? 'yö' : 'night'}</li>
    </ul>
    <p class="note">
      {L === 'fi' ? 'Revontulten todennäköisyys' : 'Aurora probability'}
      {L === 'fi' ? 'klo' : 'at'} <b>{time(L, data.forecast, 'Europe/Helsinki')}</b> · NOAA SWPC OVATION
    </p>
  </div>
</div>

<style>
  .ag {
    display: flex;
    gap: 14px;
    height: 100%;
    align-items: center;
  }
  .discs {
    display: flex;
    gap: 14px;
  }
  figure {
    margin: 0;
    text-align: center;
  }
  .disc {
    width: 500px;
    height: 500px;
    clip-path: circle(50%);
  }
  figcaption {
    font-size: 19px;
    color: var(--c-label);
    margin-top: 2px;
  }
  .side {
    flex: 1;
    min-width: 0;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 14px 12px;
  }
  .kl {
    font-size: 22px;
    color: var(--c-label);
  }
  .kp {
    font-size: 64px;
    font-weight: 700;
    line-height: 1;
    color: var(--c-value);
  }
  .k24 {
    font-size: 18px;
    color: var(--c-label);
  }
  .k24 small {
    display: block;
  }
  .legend {
    list-style: none;
    margin: 14px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 18px;
  }
  .legend i {
    display: inline-block;
    width: 22px;
    height: 14px;
    margin-right: 8px;
    border: 1px solid #000;
    vertical-align: -1px;
  }
  .legend i.night {
    background: rgba(0, 0, 20, 0.6);
  }
  .note {
    margin-top: auto;
    font-size: 15px;
    color: var(--c-label);
  }
</style>
