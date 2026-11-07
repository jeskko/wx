<script lang="ts" module>
  import type { SpaceFile } from '../lib/space';
  export interface SpaceWxData {
    file: SpaceFile;
  }
</script>

<script lang="ts">
  // NOAA space weather scales (radio blackouts, radiation storms, geomagnetic storms) now and
  // for three days, GOES X-ray flux for the last 24 h with flares, and the proton flux.
  import { FLARE_COLOR, SCALE_COLOR, SCALE_NAME, SCALE_WORD, biggestFlare, flareClass, flareRank, protonLevel, seriesLast, xrayLevel } from '../lib/space';
  import { capitalize, num, time, weekday } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<SpaceWxData> = $props();
  const L = $derived(ctx.lang);
  const tz = 'Europe/Helsinki';
  const pct = (v: number | null) => (v == null ? '–' : `${num(L, v)}${L === 'fi' ? ' %' : '%'}`);

  const sc = $derived(data.file.scales);
  const xr = $derived(seriesLast(data.file.xray));
  const pr = $derived(seriesLast(data.file.protons));
  // current level: NOAA's own value, else from the GOES data
  const level = $derived({
    r: sc?.now.r ?? xrayLevel(xr?.v ?? null),
    s: sc?.now.s ?? protonLevel(pr?.v ?? null),
    g: sc?.now.g ?? 0,
  });
  const fc = $derived(sc?.forecast ?? []);
  const day = (d: string | null, i: number) =>
    i === 0 ? (L === 'fi' ? 'tänään' : 'today') : d ? weekday(L, new Date(`${d}T12:00:00Z`), tz) : '';

  // X-ray chart: log10 flux −8 (A) … −3 (X10)
  const W = 760;
  const H = 230;
  const LO = -8.2;
  const HI = -3.3;
  const t1 = $derived(ctx.now.getTime());
  const t0 = $derived(t1 - 24 * 3600_000);
  const xOf = (t: number) => ((t - t0) / (t1 - t0)) * W;
  const yOf = (v: number) => H - ((Math.max(LO, Math.min(HI, v)) - LO) / (HI - LO)) * H;
  const path = $derived.by(() => {
    const s = data.file.xray;
    if (!s) return '';
    const start = Date.parse(s.start);
    let d = '';
    let pen = false;
    s.log.forEach((v, i) => {
      const t = start + i * s.step * 60_000;
      if (v == null || t < t0) return void (pen = false);
      d += `${pen ? 'L' : 'M'}${xOf(t).toFixed(1)},${yOf(v).toFixed(1)}`;
      pen = true;
    });
    return d;
  });
  const BANDS = [
    { k: 'A', lo: -8 },
    { k: 'B', lo: -7 },
    { k: 'C', lo: -6 },
    { k: 'M', lo: -5 },
    { k: 'X', lo: -4 },
  ];
  // flares of the last 24 h worth marking: everything from M up, else the three biggest C's
  const marks = $derived.by(() => {
    const fl = (data.file.flares ?? []).filter((f) => Date.parse(f.max) >= t0);
    const big = fl.filter((f) => f.cls[0] !== 'C');
    const picked = big.length ? big : [...fl].sort((a, b) => flareRank(b.cls) - flareRank(a.cls)).slice(0, 3);
    return picked.slice(0, 6).map((f) => ({ ...f, x: xOf(Date.parse(f.max)), y: yOf(flareRank(f.cls)) }));
  });
  const week = $derived(biggestFlare(data.file.flares ?? [], t1 - 7 * 86400_000, t1));
  const count24 = $derived.by(() => {
    const fl = (data.file.flares ?? []).filter((f) => Date.parse(f.max) >= t0);
    return { c: fl.filter((f) => f.cls[0] === 'C').length, m: fl.filter((f) => f.cls[0] === 'M').length, x: fl.filter((f) => f.cls[0] === 'X').length };
  });
  const latest = $derived((data.file.flares ?? []).slice(0, 4));
  const pfu = $derived(pr ? Math.pow(10, pr.v) : null);
</script>

<div class="sw">
  <div class="tiles">
    {#each ['r', 's', 'g'] as const as k (k)}
      {@const lv = level[k]}
      <div class="panel tile">
        <div class="head">
          <span class="badge" style:background={SCALE_COLOR[lv]} class:dark={lv > 0 && lv < 4}>{k.toUpperCase()}{lv}</span>
          <div>
            <div class="name">{SCALE_NAME[k][L]}</div>
            <div class="word">{capitalize(SCALE_WORD[L][lv])}</div>
          </div>
        </div>
        <div class="fc">
          {#if k === 'r'}
            {#each fc as d, i (i)}
              <span><i>{day(d.date, i)}</i> <b class="m">M</b> {pct(d.rMinor)} <b class="x">X</b> {pct(d.rMajor)}</span>
            {/each}
            <small>{L === 'fi' ? 'Ennuste: M- ja X-purkauksen todennäköisyys' : 'Forecast: chance of an M or X flare'}</small>
          {:else if k === 's'}
            {#each fc as d, i (i)}
              <span><i>{day(d.date, i)}</i> {pct(d.sProb)}</span>
            {/each}
            <small>{L === 'fi' ? 'Ennuste: S1+ · protonivuo nyt' : 'Forecast: S1+ · proton flux now'} {pfu == null ? '–' : num(L, pfu, pfu < 10 ? 1 : 0)} pfu</small>
          {:else}
            {#each fc as d, i (i)}
              <span><i>{day(d.date, i)}</i> <b style:color={d.g ? SCALE_COLOR[d.g] : undefined}>{d.g ? `G${d.g}` : L === 'fi' ? 'ei myrskyä' : 'no storm'}</b></span>
            {/each}
            <small>{L === 'fi' ? 'Ennuste: suurin myrskytaso' : 'Forecast: highest storm level'}</small>
          {/if}
        </div>
        {#if sc && (sc.yesterday[k] ?? 0) > 0}
          <div class="yday">{L === 'fi' ? 'Eilen' : 'Yesterday'} {k.toUpperCase()}{sc.yesterday[k]}</div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="lower">
    <div class="panel chart">
      <div class="ctitle">
        <span>{L === 'fi' ? 'Auringon röntgensäteily, 24 h' : 'Solar X-rays, 24 h'}</span>
        {#if xr}<span class="nowcls" style:color={FLARE_COLOR[flareClass(xr.v)[0]]}>{L === 'fi' ? 'nyt' : 'now'} {flareClass(xr.v)}</span>{/if}
      </div>
      <svg viewBox={`0 0 ${W + 34} ${H + 24}`}>
        {#each BANDS as b (b.k)}
          {@const ya = yOf(b.lo)}
          {@const yb = yOf(b.lo + 1)}
          <line x1="0" x2={W} y1={ya} y2={ya} class="grid" />
          <text x={W + 8} y={(ya + yb) / 2 + 6} class="cl" style:fill={FLARE_COLOR[b.k]}>{b.k}</text>
        {/each}
        {#each [0, 6, 12, 18] as h (h)}
          {@const t = t0 + h * 3600_000}
          <line x1={xOf(t)} x2={xOf(t)} y1="0" y2={H} class="grid v" />
          <text x={xOf(t) + 3} y={H + 19} class="gl">{time(L, new Date(t), tz)}</text>
        {/each}
        <path d={path} class="flux" />
        {#each marks as m (m.max)}
          <circle cx={m.x} cy={m.y} r="5" fill={FLARE_COLOR[m.cls[0]]} />
          <text x={Math.min(W - 40, m.x + 7)} y={Math.max(16, m.y - 8)} class="fl" style:fill={FLARE_COLOR[m.cls[0]]}>{m.cls}</text>
        {/each}
      </svg>
    </div>
    <div class="panel flares">
      <div class="lbl">{L === 'fi' ? 'Purkauksia 24 h' : 'Flares in 24 h'}</div>
      <div class="counts">
        <span style:color={FLARE_COLOR.C}>C <b>{count24.c}</b></span>
        <span style:color={FLARE_COLOR.M}>M <b>{count24.m}</b></span>
        <span style:color={FLARE_COLOR.X}>X <b>{count24.x}</b></span>
      </div>
      {#if week}
        <div class="lbl">{L === 'fi' ? 'Suurin 7 vuorokauteen' : 'Biggest in 7 days'}</div>
        <div class="wk"><b style:color={FLARE_COLOR[week.cls[0]]}>{week.cls}</b> {weekday(L, new Date(week.max), tz)} {time(L, week.max, tz)}</div>
      {/if}
      {#if latest.length}
        <div class="lbl">{L === 'fi' ? 'Viimeisimmät' : 'Latest'}</div>
        <ul class="list">
          {#each latest as f (f.max)}
            <li><b style:color={FLARE_COLOR[f.cls[0]]}>{f.cls}</b> <span>{time(L, f.max, tz)}</span></li>
          {/each}
        </ul>
      {/if}
      <p class="note">
        {L === 'fi'
          ? 'M- ja X-purkaukset voivat katkaista HF-yhteydet päiväpuolella. NOAA SWPC, GOES.'
          : 'M and X flares can black out HF on the dayside. NOAA SWPC, GOES.'}
      </p>
    </div>
  </div>
</div>

<style>
  .sw {
    display: flex;
    flex-direction: column;
    gap: 18px;
    height: 100%;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 18px;
    position: relative;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .badge {
    font-size: 34px;
    font-weight: 800;
    padding: 2px 12px;
    border-radius: 8px;
    color: #fff;
    text-shadow: none;
    flex: none;
  }
  .badge.dark {
    color: #1a1a1a;
  }
  .name {
    font-size: 23px;
    color: var(--c-accent);
    line-height: 1.1;
  }
  .word {
    font-size: 21px;
    color: var(--c-value);
  }
  .fc {
    display: flex;
    flex-direction: column;
    font-size: 19px;
    color: var(--c-value);
    font-variant-numeric: tabular-nums;
  }
  .fc i {
    font-style: normal;
    color: var(--c-label);
    display: inline-block;
    min-width: 68px;
  }
  .fc small {
    font-size: 15px;
    color: var(--c-label);
    margin-top: 2px;
  }
  .yday {
    position: absolute;
    top: 12px;
    right: 14px;
    font-size: 15px;
    color: var(--c-label);
  }
  .lower {
    flex: 1;
    min-height: 0;
    display: flex;
    gap: 18px;
  }
  .chart {
    flex: 2.6;
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 12px 18px;
  }
  .ctitle {
    display: flex;
    justify-content: space-between;
    font-size: 20px;
    color: var(--c-label);
  }
  .nowcls {
    font-weight: 700;
    font-size: 22px;
  }
  .chart svg {
    flex: 1;
    min-height: 0;
    width: 100%;
  }
  .grid {
    stroke: rgba(255, 255, 255, 0.16);
    stroke-width: 1;
  }
  .grid.v {
    stroke-dasharray: 3 4;
  }
  .gl {
    font-size: 15px;
    fill: var(--c-label);
  }
  .cl {
    font-size: 18px;
    font-weight: 700;
  }
  .flux {
    fill: none;
    stroke: #ffd35a;
    stroke-width: 2.2;
  }
  .fl {
    font-size: 16px;
    font-weight: 700;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, 0.7);
    stroke-width: 3px;
  }
  .flares {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  .lbl {
    font-size: 19px;
    color: var(--c-label);
  }
  .counts {
    display: flex;
    gap: 18px;
    font-size: 26px;
  }
  .counts b {
    color: var(--c-value);
  }
  .wk {
    font-size: 24px;
    color: var(--c-value);
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px 14px;
    font-size: 20px;
  }
  .list span {
    color: var(--c-value);
  }
  .fc .m {
    color: #e8902a;
  }
  .fc .x {
    color: #e8413a;
    margin-left: 8px;
  }
  .note {
    margin: auto 0 0;
    font-size: 15px;
    color: var(--c-label);
  }
</style>
