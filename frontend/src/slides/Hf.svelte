<script lang="ts" module>
  export interface HfRegion {
    id: string;
    name: { fi: string; en: string };
    km: number;
    muf: (number | null)[];
    /** per hour: one digit per band, 3 SSB · 2 CW · 1 FT8 · 0 closed */
    levels: string[];
  }
  export interface HfFile {
    updated: string;
    ssn: number;
    tx: { lat: number; lon: number; power_w: number };
    bands: { id: string; mhz: number }[];
    times: string[];
    regions: HfRegion[];
    drap: { valid: string | null; xray: string; proton: string; event: boolean; mhz: number | null } | null;
  }
  export interface HfData {
    hf: HfFile;
    /** index into hf.times of the current hour */
    start: number;
    kp: number | null;
  }
</script>

<script lang="ts">
  // HF band conditions (VOACAP) for the next 24 hours, stepping hour by hour.
  import { frameLoop } from '../lib/loop';
  import { capitalize, num, time, weekday } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<HfData> = $props();
  const L = $derived(ctx.lang);
  const tz = 'Europe/Helsinki';

  const LEVEL = {
    fi: ['ei yhteyttä', 'digi (FT8)', 'sähkötys (CW)', 'puhe (SSB)'],
    en: ['closed', 'digital (FT8)', 'CW', 'voice (SSB)'],
  };
  const COLORS = ['rgba(255,255,255,0.08)', '#e8902a', '#e8d640', '#3fbf5a'];

  const hours = $derived(data.hf.times.length - data.start);
  let k = $state(0); // hours from now

  // 24 h stepped through hour by hour (~0.4 s each), the last hour held, fitted to the slide length
  $effect(() => frameLoop(hours, ctx.duration, 400, 1800, (n) => (k = n)));

  const i = $derived(data.start + k);
  const at = $derived(new Date(data.hf.times[i]));
  const drapNote = $derived.by(() => {
    const d = data.hf.drap;
    if (!d?.event) return null;
    const mhz = d.mhz && d.mhz >= 1 ? ` ${num(L, d.mhz, 0)} MHz` : '';
    return L === 'fi'
      ? `Radiopimennys: auringonpurkaus vaimentaa taajuuksia${mhz ? ` alle${mhz}` : ''} päiväpuolella`
      : `Radio blackout: a solar event is absorbing frequencies${mhz ? ` below${mhz}` : ''} on the dayside`;
  });
</script>

<div class="hf">
  <div class="panel main">
    <table>
      <thead>
        <tr>
          <th class="rg">{L === 'fi' ? 'Suomesta' : 'From Finland to'}</th>
          {#each data.hf.bands as b (b.id)}<th>{b.id.replace('m', ' m')}</th>{/each}
          <th class="muf">MUF</th>
        </tr>
      </thead>
      <tbody>
        {#each data.hf.regions as r (r.id)}
          <tr>
            <td class="rg">{r.name[L]}<small>{num(L, Math.round(r.km / 100) * 100)} km</small></td>
            {#each r.levels[i].split('') as c, bi (bi)}
              <td class="cell"><span style:background={COLORS[+c]} class:closed={c === '0'}></span></td>
            {/each}
            <td class="muf">{r.muf[i] == null ? '–' : num(L, r.muf[i]!, 0)}<small> MHz</small></td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
  <div class="panel side">
    <div class="day">{capitalize(weekday(L, at, tz, 'long'))}</div>
    <div class="clock">{time(L, at, tz)}</div>
    <div class="bar"><span style:width={`${((k + 1) / hours) * 100}%`}></span></div>
    <ul class="legend">
      {#each [3, 2, 1, 0] as lv (lv)}
        <li><span class="sw" style:background={COLORS[lv]}></span>{capitalize(LEVEL[L][lv])}</li>
      {/each}
    </ul>
    <dl>
      <dt>{L === 'fi' ? 'Auringonpilkkuluku' : 'Sunspot number'}</dt>
      <dd>{num(L, data.hf.ssn, 0)}</dd>
      {#if data.kp != null}
        <dt>{L === 'fi' ? 'Magneettinen aktiivisuus' : 'Geomagnetic activity'}</dt>
        <dd>Kp {num(L, data.kp, 0)}</dd>
      {/if}
    </dl>
    {#if drapNote}
      <p class="alert">⚠ {drapNote}</p>
    {:else if data.kp != null && data.kp >= 5}
      <p class="alert">
        ⚠ {L === 'fi'
          ? 'Magneettimyrsky heikentää yhteyksiä erityisesti napa-alueen yli (Japani, Pohjois-Amerikka).'
          : 'A geomagnetic storm degrades paths, especially over the polar region (Japan, North America).'}
      </p>
    {/if}
    <p class="note">
      {L === 'fi'
        ? `VOACAP-ennuste Keski-Suomesta · ${data.hf.tx.power_w}\u00a0W, yksinkertaiset antennit · tehokkaammalla asemalla yhteydet aukeavat useammin`
        : `VOACAP prediction from central Finland · ${data.hf.tx.power_w}\u00a0W, simple antennas · bigger stations will do better`}
    </p>
  </div>
</div>

<style>
  .hf {
    display: flex;
    gap: 22px;
    height: 100%;
  }
  .main {
    flex: 2.2;
    display: flex;
    align-items: center;
  }
  table {
    width: 100%;
    border-collapse: separate;
    border-spacing: 5px 6px;
  }
  th {
    font-size: 21px;
    font-weight: 600;
    color: var(--c-accent);
    white-space: nowrap;
  }
  th.rg {
    text-align: left;
  }
  td.rg {
    font-size: 23px;
    color: var(--c-value);
    white-space: nowrap;
    line-height: 1.1;
  }
  td.rg small {
    display: block;
    font-size: 16px;
    color: var(--c-label);
  }
  .cell span {
    display: block;
    height: 34px;
    min-width: 42px;
    border-radius: 4px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
    transition: background-color 0.25s;
  }
  td.muf,
  th.muf {
    text-align: right;
    white-space: nowrap;
  }
  td.muf {
    font-size: 23px;
    color: var(--c-value);
    font-variant-numeric: tabular-nums;
  }
  td.muf small {
    font-size: 15px;
    color: var(--c-label);
  }
  .side {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .day {
    font-size: 30px;
    color: var(--c-accent);
  }
  .clock {
    font-size: 64px;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    height: 10px;
    background: var(--progress-track);
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 6px;
  }
  .bar span {
    display: block;
    height: 100%;
    background: var(--c-accent);
  }
  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 21px;
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .sw {
    width: 34px;
    height: 18px;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.3);
    flex: none;
  }
  dl {
    margin: 6px 0 0;
    display: grid;
    grid-template-columns: auto auto;
    gap: 2px 12px;
    font-size: 20px;
  }
  dt {
    color: var(--c-label);
  }
  dd {
    margin: 0;
    color: var(--c-value);
    text-align: right;
  }
  .alert {
    margin: 4px 0 0;
    font-size: 19px;
    color: #ffd35a;
  }
  .note {
    margin: auto 0 0;
    font-size: 16px;
    color: var(--c-label);
  }
</style>
