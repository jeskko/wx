<script lang="ts" module>
  import type { Basemap } from '../map/basemap';
  import type { MapLabel } from '../map/MapView.svelte';
  import type { TrafficMessage } from '../lib/traffic';
  export interface TrafficData {
    base: Basemap;
    labels: MapLabel[];
    messages: TrafficMessage[];
    updated: string;
  }
</script>

<script lang="ts">
  // Traffic announcements (Digitraffic): numbered markers on the map + list, accidents first.
  import MapView from '../map/MapView.svelte';
  import { mapSize, projector } from '../map/basemap';
  import { pixel } from '../map/proj';
  import { autoscroll } from '../lib/autoscroll';
  import { time } from '../lib/format';
  import { featureText, KIND_COLOR, titleText } from '../lib/traffic';
  import { LOCALE } from '../i18n';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<TrafficData> = $props();
  const L = $derived(ctx.lang);
  const size = $derived(mapSize(data.base));
  const tz = 'Europe/Helsinki';

  const markers = $derived.by(() => {
    const px = pixel(data.base.extent, size.w, size.h, projector(data.base));
    return data.messages
      .map((m, i) => ({ m, n: i + 1, p: m.lat != null && m.lon != null ? px.fromLatLon(m.lat, m.lon) : null }))
      .filter((x): x is { m: TrafficMessage; n: number; p: [number, number] } => !!x.p && x.p[0] >= 0 && x.p[0] <= size.w && x.p[1] >= 0 && x.p[1] <= size.h)
      .reverse(); // first (most important) drawn on top
  });

  const dayMonth = (d: Date) => d.toLocaleDateString(LOCALE[L], { day: 'numeric', month: L === 'fi' ? 'numeric' : 'short', timeZone: tz });
  /** "klo 11.06" today, else "5.11. klo 11.06"; long-running ones only the date. */
  function since(iso: string | null): string {
    if (!iso) return '';
    const d = new Date(iso);
    const now = ctx.now;
    const ymd = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: tz });
    const dm = dayMonth(d);
    if (ymd(d) === ymd(now)) return `${L === 'fi' ? 'klo' : 'at'} ${time(L, d, tz)}`;
    if (now.getTime() - d.getTime() < 7 * 86400_000) return `${dm} ${L === 'fi' ? 'klo' : 'at'} ${time(L, d, tz)}`;
    return `${L === 'fi' ? 'alkaen' : 'since'} ${dm}`;
  }
  const KIND: Record<TrafficMessage['kind'], { fi: string; en: string }> = {
    accident: { fi: 'onnettomuus', en: 'accident' },
    closed: { fi: 'tie suljettu', en: 'road closed' },
    lane: { fi: 'kaista suljettu / ruuhka', en: 'lane closed / congestion' },
    other: { fi: 'muu tiedote', en: 'other' },
  };
  const counts = $derived(
    (['accident', 'closed', 'lane', 'other'] as const).map((k) => ({ k, n: data.messages.filter((m) => m.kind === k).length })).filter((x) => x.n),
  );
</script>

<div class="traffic">
  <MapView base={data.base} w={size.w} h={size.h} labels={data.labels}>
    <svg class="marks" width={size.w} height={size.h}>
      {#each markers as { m, n, p } (m.id)}
        <g transform={`translate(${p[0]} ${p[1]})`}>
          <circle r="12" fill={KIND_COLOR[m.kind]} stroke="#000" stroke-width="2" />
          <text y="5" text-anchor="middle">{n}</text>
        </g>
      {/each}
    </svg>
  </MapView>
  <div class="panel side">
    <div class="counts">
      {#each counts as c (c.k)}
        <span><i style:background={KIND_COLOR[c.k]}></i>{KIND[c.k][L]} <b>{c.n}</b></span>
      {/each}
    </div>
    <ol class="list" use:autoscroll={{ total: ctx.duration * 1000 }}>
      {#each data.messages as m, i (m.id)}
        <li>
          <span class="num" style:background={KIND_COLOR[m.kind]}>{i + 1}</span>
          <div>
            <div class="mtitle">{titleText(L, m.title)}</div>
            <div class="feat">{m.features.map((f) => featureText(L, f)).join(' · ')}</div>
            <div class="when">{since(m.start)}{#if m.end}&nbsp;– {dayMonth(new Date(m.end))}{/if}</div>
          </div>
        </li>
      {/each}
    </ol>
    <p class="note">
      {L === 'fi' ? 'Voimassa olevat liikennetiedotteet' : 'Active traffic announcements'} · Fintraffic / Digitraffic{L === 'en' ? ' (in Finnish where no translation)' : ''}
    </p>
  </div>
</div>

<style>
  .traffic {
    display: flex;
    gap: 22px;
    height: 100%;
  }
  .marks {
    position: absolute;
    inset: 0;
  }
  .marks text {
    font-size: 14px;
    font-weight: 700;
    fill: #000;
  }
  .side {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .counts {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 16px;
    font-size: 19px;
    color: var(--c-label);
  }
  .counts i {
    display: inline-block;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1.5px solid #000;
    margin-right: 6px;
    vertical-align: -1px;
  }
  .counts b {
    color: var(--c-value);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .list li {
    display: flex;
    gap: 10px;
    align-items: flex-start;
  }
  .num {
    flex: none;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1.5px solid #000;
    color: #000;
    font-size: 15px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 2px;
  }
  .mtitle {
    font-size: 22px;
    line-height: 1.2;
    color: var(--c-value);
  }
  .feat {
    font-size: 18px;
    color: var(--c-accent);
  }
  .when {
    font-size: 16px;
    color: var(--c-label);
  }
  .note {
    margin: 0;
    font-size: 15px;
    color: var(--c-label);
  }
</style>
