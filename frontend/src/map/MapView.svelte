<script lang="ts" module>
  export interface MapLabel {
    lat: number;
    lon: number;
    text: string;
    /** optional value badge (e.g. temperature) */
    badge?: string;
    badgeColor?: string;
    /** label placement relative to the dot */
    side?: 'left' | 'right';
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Basemap } from './basemap';
  import { pixel, type Extent } from './proj';

  let {
    base,
    w,
    h,
    labels = [],
    night = false,
    view,
    children,
  }: {
    base: Basemap;
    w: number;
    h: number;
    labels?: MapLabel[];
    night?: boolean;
    /** visible window in map metres (default: the whole basemap) */
    view?: Extent;
    children?: Snippet;
  } = $props();

  const v = $derived(view ?? base.extent);
  const px = $derived(pixel(v, w, h));
  const viewBox = $derived(
    `${(v[0] - base.extent[0]) / 1000} ${(base.extent[3] - v[3]) / 1000} ${(v[2] - v[0]) / 1000} ${(v[3] - v[1]) / 1000}`,
  );
  const placed = $derived(
    labels
      .map((l) => ({ ...l, xy: px.fromLatLon(l.lat, l.lon) }))
      .filter((l) => l.xy[0] >= 0 && l.xy[0] <= w && l.xy[1] >= 0 && l.xy[1] <= h),
  );
</script>

<div class="map" class:night style:width={`${w}px`} style:height={`${h}px`}>
  <svg class="base" {viewBox} width={w} height={h} preserveAspectRatio="none">
    <rect class="water" x="-1000" y="-1000" width={base.width + 2000} height={base.height + 2000} />
    <path class="land" d={base.land} fill-rule="evenodd" />
    <path class="lake" d={base.lakes} fill-rule="evenodd" />
    <path class="border" d={base.borders} />
  </svg>
  <div class="overlay">
    {@render children?.()}
  </div>
  <svg class="labels" width={w} height={h}>
    {#each placed as l (l.text)}
      {@const [x, y] = l.xy}
      {#if l.badge}
        <g transform={`translate(${x} ${y})`}>
          <rect class="badge" x="-27" y="-15" width="54" height="30" rx="4" style:fill={l.badgeColor ?? null} />
          <text class="badge-t" y="8" text-anchor="middle">{l.badge}</text>
          <text class="name small" y="31" text-anchor="middle">{l.text}</text>
        </g>
      {:else}
        <circle class="dot" cx={x} cy={y} r="4" />
        <text class="name" x={l.side === 'left' ? x - 8 : x + 8} y={y + 6} text-anchor={l.side === 'left' ? 'end' : 'start'}>{l.text}</text>
      {/if}
    {/each}
  </svg>
</div>

<style>
  .map {
    position: relative;
    overflow: hidden;
    border: var(--map-frame, 3px solid #000);
    box-shadow: var(--panel-shadow);
    flex: none;
  }
  .base,
  .overlay,
  .labels {
    position: absolute;
    inset: 0;
  }
  .overlay > :global(canvas),
  .overlay > :global(img) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .night {
    --map-water: #050c2e;
    --map-land: #142a22;
    --map-lake: #050c2e;
    --map-coast: #4d6b8f;
    --map-border: #8b8f6a;
  }
  .water {
    fill: var(--map-water, #1d4fb8);
  }
  .land {
    fill: var(--map-land, #3d8a3a);
    stroke: var(--map-coast, #0f2d12);
    stroke-width: var(--map-coast-w, 1.6);
    vector-effect: non-scaling-stroke;
  }
  .lake {
    fill: var(--map-lake, var(--map-water, #1d4fb8));
    stroke: var(--map-coast, #0f2d12);
    stroke-width: 0.6;
    vector-effect: non-scaling-stroke;
  }
  .border {
    fill: none;
    stroke: var(--map-border, #f2e6a0);
    stroke-width: 1.4;
    stroke-dasharray: 5 3;
    vector-effect: non-scaling-stroke;
  }
  .dot {
    fill: var(--map-dot, #fff);
    stroke: #000;
    stroke-width: 1.5;
  }
  .name {
    font-size: 21px;
    fill: var(--map-label, #fff);
    paint-order: stroke;
    stroke: var(--map-label-halo, rgba(0, 0, 0, 0.85));
    stroke-width: 4px;
    font-family: inherit;
  }
  .name.small {
    font-size: 17px;
  }
  .badge {
    fill: var(--c-accent);
    stroke: #000;
    stroke-width: 2;
  }
  .badge-t {
    font-size: 23px;
    font-weight: 700;
    fill: #000;
    font-family: inherit;
  }
</style>
