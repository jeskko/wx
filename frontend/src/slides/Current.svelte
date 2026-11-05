<script lang="ts" module>
  import type { Current } from '../lib/wx';
  import type { Basemap } from '../map/basemap';
  import type { MapLabel } from '../map/MapView.svelte';
  import type { Extent } from '../map/proj';
  import type { LightningFile } from '../lib/types';
  export interface LocalRadar {
    base: Basemap;
    extent: Extent;
    view: Extent;
    urls: string[];
    times: string[];
    labels: MapLabel[];
    strikes: LightningFile['strikes'];
    /** MET Norway nowcast steps from now on: [time, mm/h] */
    nowcast: [string, number][] | null;
  }
  export interface CurrentData {
    cur: Current | null;
    sym: string | null;
    night: boolean;
    fcT: number | null;
    radar: LocalRadar | null;
    /** road weather camera near the place (Digitraffic) */
    cam: { url: string; name: string; road: string | null; time: string } | null;
  }
</script>

<script lang="ts">
  import WindDir from '../components/WindDir.svelte';
  import RadarLoop from '../components/RadarLoop.svelte';
  import Strikes from '../components/Strikes.svelte';
  import { nowcastText, WET } from '../lib/nowcast';
  import MapView from '../map/MapView.svelte';
  import WxIcon from '../components/WxIcon.svelte';
  import { t } from '../i18n';
  import { num, temp, time, visibility } from '../lib/format';
  import { symLabel } from '../lib/textfc';
  import { placeTz } from '../lib/wx';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<CurrentData> = $props();
  const L = $derived(ctx.lang);
  const c = $derived(data.cur);
  const tz = $derived(placeTz(ctx.place));

  const R = 340; // radar map size (px)
  let frame = $state(0);

  // nowcast bar colour by intensity (mm/h), echoing the radar palette
  const ncColor = (r: number) => (r < WET ? 'transparent' : r < 0.5 ? '#78d2ff' : r < 2 ? '#28d73c' : r < 5 ? '#ffe828' : r < 10 ? '#ff9614' : '#eb2323');
  const ncMax = $derived(Math.max(2, ...(data.radar?.nowcast ?? []).map(([, r]) => r)));

  const trend = $derived(
    c?.ptend == null ? '' : c.ptend > 0.7 ? `▲ ${t(L, 'rising')}` : c.ptend < -0.7 ? `▼ ${t(L, 'falling')}` : `► ${t(L, 'steady')}`,
  );
</script>

<div class="current" class:withradar={!!data.radar}>
  <div class="panel hero" class:withcam={!!data.cam}>
    <WxIcon sym={data.sym} night={data.night} size={data.cam ? 96 : data.radar ? 150 : 190} />
    <div class="temp-big">{temp(c?.t ?? data.fcT)}</div>
    <div class="cond">{symLabel(L, data.sym)}</div>
    {#if data.cam}
      <figure class="cam">
        <img src={data.cam.url} alt="" />
        <figcaption>
          {data.cam.name}{#if data.cam.road}<span> · {data.cam.road}</span>{/if}
          <span class="ct">{time(L, data.cam.time, tz)}</span>
        </figcaption>
      </figure>
    {/if}
  </div>

  <div class="panel facts">
    {#if c}
      <dl>
        <dt>{t(L, 'feelsLike')}</dt>
        <dd>{temp(c.feels)}</dd>
        <dt>{t(L, 'wind')}</dt>
        <dd>
          {#if c.ws == null}–{:else if c.ws < 0.5}{t(L, 'calm')}{:else}<WindDir lang={L} deg={c.wd} /> {num(L, c.ws)} m/s{/if}
          {#if c.wg != null && c.wg >= (c.ws ?? 0) + 3}<small> ({t(L, 'gusts')} {num(L, c.wg)})</small>{/if}
        </dd>
        <dt>{t(L, 'humidity')}</dt>
        <dd>{num(L, c.rh)} %</dd>
        <dt>{t(L, 'dewpoint')}</dt>
        <dd>{temp(c.td)}</dd>
        {#if c.p != null}
          <dt>{t(L, 'pressure')}</dt>
          <dd>{num(L, c.p)} hPa <small>{trend}</small></dd>
        {/if}
        {#if c.vis != null}
          <dt>{t(L, 'visibility')}</dt>
          <dd>{visibility(L, c.vis)}</dd>
        {/if}
        {#if c.n != null && c.n <= 8}
          <dt>{t(L, 'cloudiness')}</dt>
          <dd>{c.n}{t(L, 'octas')}</dd>
        {/if}
        {#if c.snow != null && c.snow > 0}
          <dt>{t(L, 'snowDepth')}</dt>
          <dd>{num(L, c.snow)} cm</dd>
        {/if}
      </dl>
      <p class="foot">
        {#if c.source === 'forecast'}
          {L === 'fi' ? 'Ei havaintoasemaa lähellä: mallin ennuste tälle tunnille' : 'No station nearby: model forecast for this hour'} ({c.stationName})
        {:else}
          {t(L, 'station')}: {c.stationName} · {t(L, 'observedAt')} {time(L, c.time, tz)}
        {/if}
      </p>
    {:else}
      <p class="nodata">{t(L, 'noData')}</p>
    {/if}
  </div>

  {#if data.radar}
    {@const rd = data.radar}
    <div class="panel radar">
      <MapView base={rd.base} w={R} h={R} view={rd.view} labels={rd.labels}>
        <RadarLoop urls={rd.urls} extent={rd.extent} view={rd.view} w={R} h={R} bind:frame />
        <Strikes strikes={rd.strikes} view={rd.view} w={R} h={R} now={ctx.now} />
      </MapView>
      <div class="rtime">{L === 'fi' ? 'Sadetutka' : 'Radar'} {time(L, rd.times[frame] ?? null, tz)}</div>
      {#if rd.nowcast}
        <div class="nc">
          <div class="bars">
            {#each rd.nowcast as [tt, r] (tt)}
              <span style:height={`${Math.max(r >= WET ? 12 : 3, (Math.sqrt(r) / Math.sqrt(ncMax)) * 100)}%`} style:background={r >= WET ? ncColor(r) : null}></span>
            {/each}
          </div>
          <div class="nctext">{nowcastText(L, rd.nowcast, tz)}</div>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .current {
    display: grid;
    grid-template-columns: 5fr 6fr;
    gap: 28px;
    height: 100%;
  }
  .current.withradar {
    grid-template-columns: 300px 1fr auto;
    gap: 20px;
  }
  .withradar .temp-big {
    font-size: 120px;
  }
  .withradar .cond {
    font-size: 32px;
  }
  .withradar dl {
    font-size: 29px;
    gap: 8px 18px;
  }
  .withradar .foot {
    font-size: 19px;
  }
  .radar {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 12px 14px;
  }
  .nc {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 34px;
    border-bottom: 2px solid var(--c-label);
  }
  .bars span {
    flex: 1;
    background: var(--progress-track);
    border-radius: 2px 2px 0 0;
  }
  .nctext {
    font-size: 19px;
    color: var(--c-value);
    text-align: center;
  }
  .rtime {
    font-size: 24px;
    color: var(--c-label);
    font-variant-numeric: tabular-nums;
  }
  .hero.withcam {
    gap: 2px;
    padding-bottom: 10px;
  }
  .withcam .temp-big {
    font-size: 96px;
  }
  .withcam .cond {
    font-size: 28px;
  }
  .cam {
    margin: 10px 0 0;
    width: 100%;
  }
  .cam img {
    display: block;
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    border: 2px solid rgba(0, 0, 0, 0.6);
    border-radius: 3px;
  }
  .cam figcaption {
    display: flex;
    gap: 4px;
    font-size: 16px;
    color: var(--c-label);
    margin-top: 3px;
    white-space: nowrap;
    overflow: hidden;
  }
  .cam figcaption span {
    flex: none;
  }
  .cam .ct {
    margin-left: auto;
    padding-left: 6px;
  }
  .hero {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .temp-big {
    font-size: 150px;
    line-height: 1;
    font-weight: 700;
    color: var(--c-value);
  }
  .cond {
    font-size: 40px;
    color: var(--c-accent);
    text-align: center;
  }
  .facts {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 10px 28px;
    margin: 0;
    font-size: 36px;
  }
  dt {
    color: var(--c-label);
  }
  dd {
    margin: 0;
    color: var(--c-value);
    text-align: right;
  }
  small {
    font-size: 0.7em;
    color: var(--c-label);
  }
  .foot {
    margin: 24px 0 0;
    font-size: 22px;
    color: var(--c-label);
  }
  .nodata {
    font-size: 36px;
    text-align: center;
  }
</style>
