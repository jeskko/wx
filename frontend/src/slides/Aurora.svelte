<script lang="ts" module>
  import type { AuroraFile } from '../lib/types';
  import type { AuroraOutlook } from '../lib/aurora';
  export interface AuroraData {
    file: AuroraFile;
    out: AuroraOutlook;
  }
</script>

<script lang="ts">
  import { t } from '../i18n';
  import { activity, kpColor } from '../lib/aurora';
  import { num, time, weekday } from '../lib/format';
  import { tzFor } from '../lib/wx';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<AuroraData> = $props();
  const L = $derived(ctx.lang);
  const tz = $derived(tzFor(ctx.place.country));
  const o = $derived(data.out);

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
  const mags = $derived((data.file.mag ?? []).slice(0, 5));
</script>

<div class="aurora">
  <div class="panel left">
    <div class="kp">
      <div>
        <div class="lbl">{t(L, 'kpNow')}</div>
        <div class="kpval" style:color={kpColor(o.kpNow ?? 0)}>{num(o.kpNow, 1)}</div>
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
    <svg class="bars" viewBox="0 0 600 190" preserveAspectRatio="none">
      {#each [3, 5, 7] as g (g)}
        <line x1="0" x2="600" y1={180 - g * 19} y2={180 - g * 19} class="grid" />
        <text x="596" y={176 - g * 19} text-anchor="end" class="gl">{g}</text>
      {/each}
      {#each bars as b, i (b.time)}
        {@const w = 600 / Math.max(bars.length, 1)}
        {@const h = Math.max(3, b.kp * 19)}
        <rect x={i * w + 2} y={180 - h} width={w - 4} height={h} fill={kpColor(b.kp)} opacity={b.future ? 0.6 : 1} />
        {#if i % 4 === 0}
          <text x={i * w + 2} y="190" class="gl" text-anchor="start">{weekday(L, new Date(b.time), tz)} {time(L, b.time, tz).slice(0, 2)}</text>
        {/if}
      {/each}
    </svg>
  </div>

  <div class="right">
    <div class="panel chance">
      <div class="lbl">{t(L, 'auroraChance')}</div>
      <div class="level l{o.level}">{t(L, `aurora.${o.level}` as 'aurora.0')}</div>
      <dl>
        <dt>{t(L, 'ovationProb')}</dt>
        <dd>{o.ovation == null ? '–' : `${o.ovation} %`}</dd>
        <dt>Kp {t(L, 'tonight').toLowerCase()} / {L === 'fi' ? 'tarve' : 'needed'}</dt>
        <dd>{num(o.kpTonight, 1)} / {num(o.need, 1)}</dd>
        <dt>{t(L, 'cloudsTonight')}</dt>
        <dd>{o.cloud == null ? '–' : `${Math.round(o.cloud)} %`}</dd>
        <dt>{t(L, 'darkness')}</dt>
        <dd>{o.dark ? '✓' : '✗'}</dd>
      </dl>
    </div>
    <div class="panel mags">
      <div class="lbl">{t(L, 'localActivity')}</div>
      <table>
        <tbody>
          {#each mags as m (m.name)}
            {@const act = activity(m.range)}
            <tr>
              <td>{m.name}</td>
              <td class="nt">{num(m.range)} nT</td>
              <td class="act {act}">{t(L, `activity.${act}`)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  </div>
</div>

<style>
  .aurora {
    display: grid;
    grid-template-columns: 6fr 5fr;
    grid-template-rows: 100%;
    gap: 22px;
    height: 100%;
  }
  .left {
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
    font-size: 25px;
    color: var(--c-label);
  }
  .kpval {
    font-size: 104px;
    font-weight: 700;
    line-height: 1;
  }
  .sw {
    font-size: 30px;
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
    font-size: 13px;
  }
  .right {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
  }
  .right .panel {
    padding: 14px 20px;
  }
  .mags {
    flex: 1;
  }
  .level {
    font-size: 46px;
    font-weight: 700;
    margin: 0 0 4px;
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
    text-shadow: 0 0 18px rgba(61, 255, 180, 0.8);
  }
  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 16px;
    margin: 0;
    font-size: 24px;
  }
  dt {
    color: var(--c-label);
  }
  dd {
    margin: 0;
    text-align: right;
  }
  table {
    width: 100%;
    font-size: 24px;
    border-collapse: collapse;
  }
  td {
    padding: 2px 4px;
  }
  .nt {
    text-align: right;
  }
  .act {
    text-align: right;
  }
  .act.low {
    color: #ffd800;
  }
  .act.moderate {
    color: #6dff8a;
  }
  .act.high {
    color: #3dffb4;
  }
  .act.quiet {
    color: var(--c-label);
  }
</style>
