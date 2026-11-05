<script lang="ts" module>
  import type { Basemap } from '../map/basemap';
  import type { Grid } from '../map/grid';
  import type { FieldCity } from '../components/FieldMap.svelte';
  export interface WorldMapData {
    base: Basemap;
    grid: Grid;
    cities: FieldCity[];
    name: string;
  }
</script>

<script lang="ts">
  // A continent/region: ECMWF temperature + precipitation for the next 48 h, animated.
  import FieldMap from '../components/FieldMap.svelte';
  import { mapSize } from '../map/basemap';
  import { T_LEGEND, tempRgb } from '../map/render';
  import { capitalize, time, weekday } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<WorldMapData> = $props();
  const L = $derived(ctx.lang);
  // wide regions get a narrower side panel
  const size = $derived.by(() => {
    const s = mapSize(data.base, 520);
    return s.w > 760 ? { w: 760, h: Math.round((760 * data.base.height) / data.base.width) } : s;
  });
  let t = $state(0);
  let progress = $state(0);
  const tz = 'Europe/Helsinki';
  const PR = [
    [0.1, 'rgba(120,210,255,0.67)'],
    [1, 'rgb(40,220,60)'],
    [2, 'rgb(255,232,40)'],
    [4, 'rgb(255,150,20)'],
    [8, 'rgb(235,35,35)'],
  ] as const;
</script>

<div class="wm">
  <div class="mapbox">
    <FieldMap base={data.base} grid={data.grid} w={size.w} h={size.h} cities={data.cities} startMs={ctx.now.getTime()} slideSeconds={ctx.duration} wind bind:time={t} bind:progress />
  </div>
  <div class="panel side">
    <div class="region">{data.name}</div>
    <div class="day">{t ? capitalize(weekday(L, new Date(t), tz, 'long')) : ''}</div>
    <div class="clock">{t ? time(L, new Date(t), tz) : ''}</div>
    <div class="tzn">{L === 'fi' ? 'Suomen aikaa' : 'Finnish time'}</div>
    <div class="bar"><span style:width={`${progress * 100}%`}></span></div>
    <div class="scale">
      {#each T_LEGEND as v (v)}
        {@const [r, g, b] = tempRgb(v)}
        <span style:background={`rgb(${r},${g},${b})`}>{v}</span>
      {/each}
    </div>
    <ul class="legend">
      {#each PR as [lo, c] (lo)}
        <li><i style:background={c}></i>{lo}+</li>
      {/each}
      <li class="unit">mm/h</li>
    </ul>
    <p class="windnote"><i></i>{L === 'fi' ? 'tuuli (10 m)' : 'wind (10 m)'}</p>
    <p class="note">{L === 'fi' ? 'Seuraavat 48 tuntia · ECMWF · Ilmatieteen laitoksen avoin data' : 'Next 48 hours · ECMWF · Finnish Meteorological Institute open data'}</p>
  </div>
</div>

<style>
  .wm {
    display: flex;
    gap: 20px;
    height: 100%;
    align-items: flex-start;
  }
  .mapbox {
    flex: none;
  }
  .side {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-self: stretch;
  }
  .region {
    font-size: 30px;
    color: var(--c-accent);
  }
  .day {
    font-size: 26px;
    color: var(--c-label);
  }
  .clock {
    font-size: 72px;
    font-weight: 700;
    line-height: 1;
    color: var(--c-value);
    font-variant-numeric: tabular-nums;
  }
  .tzn {
    font-size: 18px;
    color: var(--c-label);
  }
  .bar {
    height: 10px;
    background: var(--progress-track);
    border-radius: 2px;
    margin: 6px 0 10px;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--c-accent);
  }
  .scale {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 2px;
  }
  .scale span {
    text-align: center;
    font-size: 16px;
    color: #000;
    text-shadow: none;
    padding: 2px 0;
  }
  .legend {
    list-style: none;
    margin: 8px 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    font-size: 18px;
  }
  .legend i {
    display: inline-block;
    width: 22px;
    height: 14px;
    margin-right: 5px;
    border: 1px solid #000;
  }
  .unit {
    color: var(--c-label);
  }
  .windnote {
    margin: 4px 0 0;
    font-size: 18px;
    color: var(--c-label);
  }
  .windnote i {
    display: inline-block;
    width: 26px;
    height: 0;
    border-top: 2px solid rgba(255, 255, 255, 0.85);
    vertical-align: middle;
    margin-right: 8px;
  }
  .note {
    margin-top: auto;
    font-size: 16px;
    color: var(--c-label);
  }
</style>
