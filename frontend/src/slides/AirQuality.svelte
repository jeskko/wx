<script lang="ts" module>
  import type { Basemap } from '../map/basemap';
  import type { MapLabel } from '../map/MapView.svelte';
  import type { AirQualityStation } from '../lib/types';
  export interface AqRow {
    id: string;
    name: string;
    station: AirQualityStation;
    count: number;
  }
  export interface AirQualityData {
    base: Basemap;
    stations: AirQualityStation[];
    rows: AqRow[];
    labels: MapLabel[];
  }
  /** FMI air quality index 1..5 */
  export const AQ_COLOR = ['#3fbf5a', '#c8e03a', '#ffb000', '#e8202a', '#a23bd6'];
</script>

<script lang="ts">
  // Air quality: FMI hourly air quality index at every station + the worst station near each city.
  import MapView from '../map/MapView.svelte';
  import { mapSize } from '../map/basemap';
  import { pixel } from '../map/proj';
  import { num, time } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<AirQualityData> = $props();
  const L = $derived(ctx.lang);
  const size = $derived(mapSize(data.base));
  const px = $derived(pixel(data.base.extent, size.w, size.h));

  const NAMES = {
    fi: ['hyvä', 'tyydyttävä', 'välttävä', 'huono', 'erittäin huono'],
    en: ['good', 'satisfactory', 'fair', 'poor', 'very poor'],
  };
  const color = (aqi: number) => AQ_COLOR[Math.min(5, Math.max(1, aqi)) - 1];
  // worst on top
  const dots = $derived([...data.stations].sort((a, b) => a.aqi - b.aqi).map((s) => ({ ...s, xy: px.fromLatLon(s.lat, s.lon) })));
  const newest = $derived(data.stations.map((s) => s.time).sort().pop() ?? null);
</script>

<div class="aq">
  <MapView base={data.base} w={size.w} h={size.h} labels={data.labels}>
    <svg class="dots" width={size.w} height={size.h}>
      {#each dots as d (d.name)}
        <circle cx={d.xy[0]} cy={d.xy[1]} r="7" style:fill={color(d.aqi)} />
      {/each}
    </svg>
  </MapView>
  <div class="panel side">
    <table>
      <thead>
        <tr>
          <th></th>
          <th class="l">{L === 'fi' ? 'Ilmanlaatu' : 'Air quality'}</th>
          <th>PM2.5</th>
          <th>PM10</th>
          <th>NO₂</th>
        </tr>
      </thead>
      <tbody>
        {#each data.rows as r (r.id)}
          {@const s = r.station}
          <tr>
            <td class="name">{r.name}</td>
            <td class="idx"><i style:background={color(s.aqi)}></i>{NAMES[L][s.aqi - 1]}</td>
            <td class="n">{num(s.pm25)}</td>
            <td class="n">{num(s.pm10)}</td>
            <td class="n">{num(s.no2)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <ul class="legend">
      {#each NAMES[L] as nm, i (nm)}
        <li><i style:background={AQ_COLOR[i]}></i>{nm}</li>
      {/each}
    </ul>
    <p class="note">
      {L === 'fi'
        ? 'Ilmanlaatuindeksi, heikoin mittausasema kaupungin alueella · µg/m³'
        : 'Air quality index, worst station in each city · µg/m³'} ·
      {time(L, newest, 'Europe/Helsinki')} · {L === 'fi' ? 'Ilmatieteen laitos, kunnat' : 'FMI, municipalities'}
    </p>
  </div>
</div>

<style>
  .aq {
    display: flex;
    gap: 22px;
    height: 100%;
  }
  .dots {
    position: absolute;
    inset: 0;
  }
  circle {
    stroke: #000;
    stroke-width: 1.5;
  }
  .side {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 27px;
  }
  th {
    font-size: 19px;
    font-weight: 400;
    color: var(--c-label);
    text-align: right;
    padding: 0 6px 4px;
  }
  th.l {
    text-align: left;
  }
  td {
    padding: 4px 6px;
    white-space: nowrap;
  }
  .name {
    color: var(--c-value);
  }
  .idx i,
  .legend i {
    display: inline-block;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1.5px solid #000;
    margin-right: 8px;
    vertical-align: -1px;
  }
  .n {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .legend {
    list-style: none;
    margin: auto 0 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 4px 18px;
    font-size: 20px;
    color: var(--c-label);
  }
  .note {
    margin: 0;
    font-size: 17px;
    color: var(--c-label);
  }
</style>
