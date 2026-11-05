<script lang="ts" module>
  import type { Basemap } from '../map/basemap';
  import type { Grid } from '../map/grid';
  import type { FieldCity } from '../components/FieldMap.svelte';
  import type { Day, Metar, Step } from '../lib/types';
  export interface CapitalData {
    name: string;
    tz: string;
    base: Basemap;
    grid: Grid | null;
    cities: FieldCity[];
    metar: Metar | null;
    now: Step | null;
    daily: Day[];
    night: boolean;
  }
</script>

<script lang="ts">
  // One world capital: local time, latest METAR, 3-day forecast and a 900 km model map around it.
  import FieldMap from '../components/FieldMap.svelte';
  import MapView from '../map/MapView.svelte';
  import WxIcon from '../components/WxIcon.svelte';
  import WindDir from '../components/WindDir.svelte';
  import { t } from '../i18n';
  import { capitalize, num, temp, time, weekday } from '../lib/format';
  import { symLabel } from '../lib/textfc';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<CapitalData> = $props();
  const L = $derived(ctx.lang);
  const M = 470;
  let mt = $state(0);
  let progress = $state(0);

  const curT = $derived(data.metar?.t ?? data.now?.t ?? null);
  const sym = $derived(data.now?.sym ?? null);
  const ws = $derived(data.metar?.wskt != null ? data.metar.wskt * 0.5144 : (data.now?.ws ?? null));
  const wd = $derived(data.metar?.wd ?? data.now?.wd ?? null);
  const days = $derived(data.daily.filter((d) => !d.partial).slice(0, 3));
  const local = $derived(
    ctx.now.toLocaleDateString(L === 'fi' ? 'fi-FI' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: data.tz }),
  );
  // whole hours ahead/behind Finland
  const offset = $derived.by(() => {
    const at = (tz: string) => new Date(ctx.now.toLocaleString('en-US', { timeZone: tz })).getTime();
    const h = Math.round((at(data.tz) - at('Europe/Helsinki')) / 3600_000);
    return h === 0 ? '' : `${h > 0 ? '+' : '−'}${Math.abs(h)} h`;
  });
</script>

<div class="cap">
  <div class="mapcol">
    {#if data.grid}
      <FieldMap base={data.base} grid={data.grid} w={M} h={M} cities={data.cities} startMs={ctx.now.getTime()} hours={36} wind bind:time={mt} bind:progress />
      <div class="mtime">
        {L === 'fi' ? 'Malli' : 'Model'}: {mt ? `${weekday(L, new Date(mt), data.tz)} ${time(L, new Date(mt), data.tz)}` : ''}
        <span class="bar"><span style:width={`${progress * 100}%`}></span></span>
      </div>
    {:else}
      <MapView base={data.base} w={M} h={M} labels={data.cities.map((c) => ({ ...c, text: c.name }))} />
    {/if}
  </div>
  <div class="panel info">
    <div class="top">
      <div>
        <div class="clock">{time(L, ctx.now, data.tz)}</div>
        <div class="date">{capitalize(local)} {#if offset}<small>({L === 'fi' ? 'Suomi' : 'Finland'} {offset})</small>{/if}</div>
      </div>
    </div>
    <div class="now">
      <WxIcon {sym} night={data.night} size={110} />
      <div class="tbig">{temp(curT)}</div>
      <div class="facts">
        <div class="cond">{symLabel(L, sym)}</div>
        {#if ws != null}
          <div>{t(L, 'wind')} {#if ws < 0.5}{t(L, 'calm')}{:else}<WindDir lang={L} deg={wd} /> {num(L, ws)} m/s{/if}</div>
        {/if}
        {#if data.metar?.time}
          <div class="src">METAR {data.metar.icao} {time(L, data.metar.time, data.tz)}</div>
        {/if}
      </div>
    </div>
    <div class="days">
      {#each days as d (d.date)}
        <div class="d">
          <div class="wd">{capitalize(weekday(L, d.date, data.tz))}</div>
          <WxIcon sym={d.sym} size={64} />
          <div class="hl"><b>{temp(d.tmax)}</b> <span>{temp(d.tmin)}</span></div>
          <div class="pr">{d.pr >= 0.1 ? `${num(L, d.pr, 1)} mm` : ''}</div>
        </div>
      {/each}
    </div>
    <p class="note">METAR: NOAA AWC · {L === 'fi' ? 'ennuste' : 'forecast'}: MET Norway · {L === 'fi' ? 'kartta' : 'map'}: ECMWF / FMI</p>
  </div>
</div>

<style>
  .cap {
    display: flex;
    gap: 20px;
    height: 100%;
  }
  .mapcol {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .mtime {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 20px;
    color: var(--c-label);
    white-space: nowrap;
  }
  .mtime .bar {
    flex: 1;
    height: 8px;
    background: var(--progress-track);
    border-radius: 2px;
  }
  .mtime .bar span {
    display: block;
    height: 100%;
    background: var(--c-accent);
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .clock {
    font-size: 70px;
    font-weight: 700;
    line-height: 1;
    color: var(--c-value);
    font-variant-numeric: tabular-nums;
  }
  .date {
    font-size: 22px;
    color: var(--c-label);
  }
  .date small {
    font-size: 0.85em;
  }
  .now {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .tbig {
    font-size: 84px;
    font-weight: 700;
    line-height: 1;
    color: var(--c-value);
  }
  .facts {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 22px;
  }
  .cond {
    color: var(--c-accent);
    font-size: 26px;
  }
  .src {
    font-size: 16px;
    color: var(--c-label);
  }
  .days {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .d {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    background: rgba(0, 0, 0, 0.15);
    border-radius: 6px;
    padding: 6px 0;
  }
  .wd {
    font-size: 22px;
    color: var(--c-accent);
  }
  .hl {
    font-size: 26px;
  }
  .hl span {
    color: var(--c-label);
    font-size: 0.85em;
  }
  .pr {
    font-size: 17px;
    color: var(--c-label);
    min-height: 1.2em;
  }
  .note {
    margin-top: auto;
    font-size: 15px;
    color: var(--c-label);
  }
</style>
