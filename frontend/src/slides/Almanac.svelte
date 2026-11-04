<script lang="ts" module>
  export interface SunRow {
    id: string;
    name: string;
    tz: string;
    sunrise: Date | null;
    sunset: Date | null;
    dayMin: number;
    changeMin: number;
    polar: 'night' | 'day' | null;
  }
  export interface AlmanacData {
    rows: SunRow[];
    moonPhase: number; // 0 new .. 0.5 full .. 1
    moonFraction: number;
    nextFull: Date;
    nextNew: Date;
    moonPlace: { name: string; tz: string; rise: Date | null; set: Date | null };
  }
</script>

<script lang="ts">
  // Almanac, once per loop: moon (same everywhere) + sun times for selected cities.
  import { t } from '../i18n';
  import { duration, time } from '../lib/format';
  import { LOCALE } from '../i18n';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<AlmanacData> = $props();
  const L = $derived(ctx.lang);

  const PHASES = {
    fi: ['Uusikuu', 'Kasvava sirppi', 'Ensimmäinen neljännes', 'Kasvava kuu', 'Täysikuu', 'Vähenevä kuu', 'Viimeinen neljännes', 'Vähenevä sirppi'],
    en: ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'],
  };
  const phaseName = $derived(PHASES[L][Math.round(data.moonPhase * 8) % 8]);

  // moon drawing: lit part = half disc + terminator ellipse
  const R = 62;
  const moonPath = $derived.by(() => {
    const p = data.moonPhase;
    const waxing = p < 0.5;
    const k = Math.cos(2 * Math.PI * p); // 1 new, -1 full
    const rx = Math.abs(k) * R;
    const sweepOuter = waxing ? 1 : 0;
    const sweepTerm = (waxing ? k > 0 : k < 0) ? 0 : 1;
    return `M0 ${-R} A${R} ${R} 0 0 ${sweepOuter} 0 ${R} A${rx} ${R} 0 0 ${sweepTerm} 0 ${-R}Z`;
  });
  const sign = (m: number) => (m >= 0 ? '+' : '−') + `${Math.abs(Math.round(m))} min`;
  const day = (d: Date) => d.toLocaleDateString(LOCALE[L], { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'Europe/Helsinki' });
</script>

<div class="alm">
  <div class="panel moon">
    <svg viewBox="-72 -72 144 144" width="150" height="150">
      <circle r={R} class="dark" />
      <path d={moonPath} class="lit" />
    </svg>
    <div class="phase">{phaseName}</div>
    <div class="sub">{Math.round(data.moonFraction * 100)} % {t(L, 'illumination')}</div>
    <dl>
      <dt>{L === 'fi' ? 'Täysikuu' : 'Full moon'}</dt>
      <dd>{day(data.nextFull)}</dd>
      <dt>{L === 'fi' ? 'Uusikuu' : 'New moon'}</dt>
      <dd>{day(data.nextNew)}</dd>
      <dt>{t(L, 'moonrise')} <small>({data.moonPlace.name})</small></dt>
      <dd>{time(L, data.moonPlace.rise, data.moonPlace.tz)}</dd>
      <dt>{t(L, 'moonset')}</dt>
      <dd>{time(L, data.moonPlace.set, data.moonPlace.tz)}</dd>
    </dl>
  </div>
  <div class="panel sun">
    <table>
      <thead>
        <tr>
          <th></th>
          <th>{L === 'fi' ? 'Nousee' : 'Rises'}</th>
          <th>{L === 'fi' ? 'Laskee' : 'Sets'}</th>
          <th>{t(L, 'dayLength')}</th>
          <th>{L === 'fi' ? 'Muutos' : 'Change'}</th>
        </tr>
      </thead>
      <tbody>
        {#each data.rows as r (r.id)}
          <tr>
            <td class="name">{r.name}</td>
            {#if r.polar}
              <td class="polar" colspan="3">{r.polar === 'night' ? (L === 'fi' ? 'kaamos' : 'polar night') : L === 'fi' ? 'yötön yö' : 'midnight sun'}</td>
            {:else}
              <td class="n">{time(L, r.sunrise, r.tz)}</td>
              <td class="n">{time(L, r.sunset, r.tz)}</td>
              <td class="n">{duration(r.dayMin)}</td>
            {/if}
            <td class="n chg" class:neg={r.changeMin < 0}>{r.polar ? '' : sign(r.changeMin)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
</div>

<style>
  .alm {
    display: grid;
    grid-template-columns: 4fr 7fr;
    gap: 22px;
    height: 100%;
  }
  .moon {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .sun {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }
  .dark {
    fill: #1d2440;
    stroke: #5d6890;
    stroke-width: 2;
  }
  .lit {
    fill: #f3efc8;
  }
  .phase {
    font-size: 34px;
    color: var(--c-accent);
    text-align: center;
  }
  .sub {
    font-size: 22px;
    color: var(--c-label);
    margin-top: -6px;
  }
  dl {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 2px 14px;
    margin: 8px 0 0;
    font-size: 23px;
    width: 100%;
  }
  dt {
    color: var(--c-label);
  }
  dt small {
    font-size: 0.8em;
  }
  dd {
    margin: 0;
    text-align: right;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 29px;
  }
  th {
    font-size: 20px;
    font-weight: 400;
    color: var(--c-label);
    text-align: right;
    padding: 0 8px 6px;
  }
  td {
    padding: 4px 8px;
  }
  .name {
    color: var(--c-value);
  }
  .n {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .chg {
    color: #8fff9a;
    font-size: 24px;
  }
  .chg.neg {
    color: var(--c-cold);
  }
  .polar {
    text-align: center;
    color: var(--c-accent);
  }
</style>
