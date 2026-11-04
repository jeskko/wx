<script lang="ts" module>
  import type { AuroraFile } from '../lib/types';
  import type { AuroraOutlook } from '../lib/aurora';
  export interface AuroraData {
    file: AuroraFile;
    rows: { id: string; name: string; out: AuroraOutlook }[];
    kpNow: number | null;
  }
</script>

<script lang="ts">
  // Aurora summary: Kp now/forecast + solar wind, chance tonight for selected cities,
  // and "traffic lights" for FMI's magnetometers.
  import { t } from '../i18n';
  import { activity, ACTIVITY_COLOR, kpColor } from '../lib/aurora';
  import { num, time, weekday } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<AuroraData> = $props();
  const L = $derived(ctx.lang);
  const tz = 'Europe/Helsinki';

  // bars: last 24 h observed + upcoming forecast, 3-hourly, max 24 bars
  const bars = $derived.by(() => {
    const now = ctx.now.getTime();
    const obs = (data.file.kp?.observed ?? []).filter((r) => Date.parse(r.time) > now - 24 * 3600_000);
    const fc = (data.file.kp?.forecast ?? []).filter((r) => r.kind !== 'observed' && Date.parse(r.time) > now - 3 * 3600_000);
    const seen = new Set<string>();
    return [...obs, ...fc]
      .filter((r) => (seen.has(r.time) ? false : (seen.add(r.time), true)))
      .slice(0, 24)
      .map((r) => ({ ...r, future: Date.parse(r.time) > now }));
  });
  const mags = $derived(data.file.mag ?? []);
</script>

<div class="aurora">
  <div class="panel left">
    <div class="kp">
      <div>
        <div class="lbl">{t(L, 'kpNow')}</div>
        <div class="kpval" style:color={kpColor(data.kpNow ?? 0)}>{num(data.kpNow, 1)}</div>
      </div>
      {#if data.file.solarwind}
        {@const sw = data.file.solarwind}
        <div class="sw">
          <div class="lbl">{t(L, 'solarWind')}</div>
          <div>{num(sw.speed)} km/s</div>
          <div>Bz <span class:south={(sw.bz ?? 0) < -5}>{num(sw.bz, 1)}</span> nT</div>
        </div>
      {/if}
    </div>
    <div class="lbl">{t(L, 'kpForecast')}</div>
    <svg class="bars" viewBox="0 0 600 150" preserveAspectRatio="none">
      {#each [3, 5, 7] as g (g)}
        <line x1="0" x2="600" y1={140 - g * 15} y2={140 - g * 15} class="grid" />
        <text x="596" y={137 - g * 15} text-anchor="end" class="gl">{g}</text>
      {/each}
      {#each bars as b, i (b.time)}
        {@const w = 600 / Math.max(bars.length, 1)}
        {@const h = Math.max(3, b.kp * 15)}
        <rect x={i * w + 2} y={140 - h} width={w - 4} height={h} fill={kpColor(b.kp)} opacity={b.future ? 0.6 : 1} />
        {#if i % 4 === 0}
          <text x={i * w + 2} y="150" class="gl" text-anchor="start">{weekday(L, new Date(b.time), tz)} {time(L, b.time, tz).slice(0, 2)}</text>
        {/if}
      {/each}
    </svg>
    <div class="lbl">{t(L, 'localActivity')}</div>
    <div class="lights">
      {#each mags as m (m.name)}
        {@const act = activity(m.range)}
        <span class="light" title={`${num(m.range)} nT`}>
          <i style:background={ACTIVITY_COLOR[act]}></i>{m.name}
        </span>
      {/each}
    </div>
  </div>

  <div class="panel right">
    <div class="lbl">{t(L, 'auroraChance')}</div>
    <table>
      <thead>
        <tr>
          <th></th>
          <th></th>
          <th>{L === 'fi' ? 'Ovaali' : 'Oval'}</th>
          <th>{L === 'fi' ? 'Pilvet' : 'Clouds'}</th>
          <th>{L === 'fi' ? 'Kp-tarve' : 'Kp need'}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.rows as r (r.id)}
          <tr>
            <td class="name">{r.name}</td>
            <td class="level l{r.out.level}">{r.out.dark ? t(L, `aurora.${r.out.level}` as 'aurora.0') : L === 'fi' ? 'valoisaa' : 'daylight'}</td>
            <td class="n">{r.out.ovation == null ? '–' : `${r.out.ovation} %`}</td>
            <td class="n">{r.out.cloud == null ? '–' : `${Math.round(r.out.cloud)} %`}</td>
            <td class="n">{num(r.out.need, 0)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="note">
      {L === 'fi' ? 'Kp tänä yönä' : 'Kp tonight'}: {num(data.rows[0]?.out.kpTonight ?? null, 1)} · NOAA SWPC, Ilmatieteen laitos
    </p>
  </div>
</div>

<style>
  .aurora {
    display: grid;
    grid-template-columns: 5fr 6fr;
    grid-template-rows: 100%;
    gap: 22px;
    height: 100%;
  }
  .left,
  .right {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
  }
  .kp {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .lbl {
    font-size: 24px;
    color: var(--c-label);
  }
  .kpval {
    font-size: 96px;
    font-weight: 700;
    line-height: 1;
  }
  .sw {
    font-size: 28px;
    text-align: right;
  }
  .south {
    color: #ff8a00;
  }
  .bars {
    width: 100%;
    flex: 1;
    min-height: 0;
  }
  .grid {
    stroke: var(--c-label);
    stroke-dasharray: 4 6;
    opacity: 0.5;
  }
  .gl {
    fill: var(--c-label);
    font-size: 12px;
  }
  .lights {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 14px;
    font-size: 21px;
  }
  .light {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .light i {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid rgba(0, 0, 0, 0.6);
    box-shadow: 0 0 6px currentColor;
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
  }
  td {
    padding: 4px 6px;
  }
  .name {
    color: var(--c-value);
  }
  .n {
    text-align: right;
  }
  .level {
    font-weight: 700;
  }
  .l0 {
    color: var(--c-label);
  }
  .l1 {
    color: #ffd800;
  }
  .l2 {
    color: #6dff8a;
  }
  .l3 {
    color: #3dffb4;
    text-shadow: 0 0 14px rgba(61, 255, 180, 0.8);
  }
  .note {
    margin-top: auto;
    font-size: 20px;
    color: var(--c-label);
  }
</style>
