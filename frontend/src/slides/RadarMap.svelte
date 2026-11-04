<script lang="ts" module>
  import type { Basemap } from '../map/basemap';
  import type { MapLabel } from '../map/MapView.svelte';
  export interface RadarIndex {
    updated: string;
    extent: [number, number, number, number];
    width: number;
    height: number;
    frames: { time: string; file: string }[];
    legend: { dbz: number; rgba: [number, number, number, number] }[];
  }
  export interface RadarData {
    base: Basemap;
    index: RadarIndex;
    urls: string[];
    labels: MapLabel[];
  }
</script>

<script lang="ts">
  import MapView from '../map/MapView.svelte';
  import { mapSize } from '../map/basemap';
  import { time } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<RadarData> = $props();
  const L = $derived(ctx.lang);
  const size = $derived(mapSize(data.base));
  const n = $derived(data.urls.length);

  let i = $state(0);
  $effect(() => {
    let timer: number;
    const tick = () => {
      i = (i + 1) % n;
      timer = window.setTimeout(tick, i === n - 1 ? 2200 : 380);
    };
    i = 0;
    timer = window.setTimeout(tick, 600);
    return () => clearTimeout(timer);
  });

  const frameTime = $derived(data.index.frames[i]?.time);
  const agoMin = $derived(frameTime ? Math.round((ctx.now.getTime() - Date.parse(frameTime)) / 60000) : 0);

  const LEGEND: Record<'fi' | 'en', string[]> = {
    fi: ['heikko', '', '', 'kohtalainen', '', 'voimakas', 'rakeita'],
    en: ['light', '', '', 'moderate', '', 'heavy', 'hail'],
  };
</script>

<div class="mapslide">
  <MapView base={data.base} w={size.w} h={size.h} labels={data.labels}>
    {#each data.urls as u, k (u)}
      <img src={u} alt="" class:on={k === i} />
    {/each}
  </MapView>
  <div class="panel side">
    <div class="clock">{time(L, frameTime ?? null, 'Europe/Helsinki')}</div>
    <div class="ago">{agoMin <= 7 ? (L === 'fi' ? 'viimeisin' : 'latest') : `−${agoMin} min`}</div>
    <div class="track">
      {#each data.urls as u, k (u)}<span class:on={k <= i}></span>{/each}
    </div>
    <h3>{L === 'fi' ? 'Sateen voimakkuus' : 'Precipitation intensity'}</h3>
    <ul class="legend">
      {#each data.index.legend as lg, k (lg.dbz)}
        <li>
          <span class="sw" style:background={`rgba(${lg.rgba[0]},${lg.rgba[1]},${lg.rgba[2]},${lg.rgba[3] / 255})`}></span>
          <span class="dbz">{lg.dbz} dBZ</span>
          <span class="lt">{LEGEND[L][k]}</span>
        </li>
      {/each}
    </ul>
    <p class="note">{L === 'fi' ? 'Tutkakuva, viimeinen tunti · Ilmatieteen laitos' : 'Radar, last hour · Finnish Meteorological Institute'}</p>
  </div>
</div>

<style>
  .mapslide {
    display: flex;
    gap: 22px;
    height: 100%;
  }
  img {
    opacity: 0;
    image-rendering: auto;
  }
  img.on {
    opacity: 1;
  }
  .side {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .clock {
    font-size: 84px;
    font-weight: 700;
    line-height: 1;
    color: var(--c-value);
    font-variant-numeric: tabular-nums;
  }
  .ago {
    font-size: 26px;
    color: var(--c-label);
  }
  .track {
    display: flex;
    gap: 4px;
    margin: 6px 0 14px;
  }
  .track span {
    flex: 1;
    height: 10px;
    background: var(--progress-track);
    border-radius: 2px;
  }
  .track span.on {
    background: var(--c-accent);
  }
  h3 {
    margin: 0;
    font-size: 28px;
    color: var(--c-accent);
  }
  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: 24px;
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .sw {
    width: 44px;
    height: 22px;
    border: 2px solid rgba(0, 0, 0, 0.6);
  }
  .dbz {
    width: 90px;
    color: var(--c-label);
  }
  .note {
    margin-top: auto;
    font-size: 20px;
    color: var(--c-label);
  }
</style>
