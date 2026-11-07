<script lang="ts" module>
  import type { SpaceFile, SpaceRegion } from '../lib/space';
  export interface SunData {
    file: SpaceFile;
    /** image URLs (cache-busted) in display order: visible light, then extreme UV */
    images: { kind: 'hmi' | 'aia193'; url: string; time: string }[];
    /** labelled regions, biggest first */
    regions: SpaceRegion[];
  }
</script>

<script lang="ts">
  // The Sun now: SDO image with NOAA active regions, sunspot number, F10.7, flare chances,
  // and the solar cycle. The picture changes from visible light to extreme UV half-way.
  import { num, time } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<SunData> = $props();
  const L = $derived(ctx.lang);
  const tz = 'Europe/Helsinki';

  let shown = $state(0);
  $effect(() => {
    if (data.images.length < 2) return;
    const id = setTimeout(() => (shown = 1), (ctx.duration * 1000) / 2);
    return () => clearTimeout(id);
  });
  const img = $derived(data.images[shown]);
  const IMG_TEXT = {
    hmi: { fi: 'Näkyvä valo: auringonpilkut', en: 'Visible light: sunspots' },
    aia193: { fi: 'Äärimmäinen UV: korona, aukot tummina', en: 'Extreme UV: corona, holes dark' },
  };

  const R = $derived(data.file.sun?.diskR ?? 0.4);
  const GREEK: Record<string, string> = { A: 'α', B: 'β', G: 'γ', D: 'δ' };
  const greek = (m: string | null) => (m ? m.split('').map((c) => GREEK[c] ?? c).join('') : '–');
  const riskColor = (m: number | null) => ((m ?? 0) >= 50 ? '#e8413a' : (m ?? 0) >= 20 ? '#e8902a' : (m ?? 0) >= 5 ? '#e8d640' : '#ffffff');

  const table = $derived(data.regions.filter((r) => r.spots > 0).slice(0, 4));
  const p = $derived(data.file.probabilities);

  // solar cycle: monthly numbers since 2008, smoothed, SWPC prediction
  const W = 600;
  const H = 130;
  const cyc = $derived.by(() => {
    const c = data.file.cycle;
    if (!c || !c.observed.length) return null;
    const m0 = (s: string) => +s.slice(0, 4) * 12 + +s.slice(5, 7) - 1;
    const start = m0(c.observed[0][0]);
    const lastObs = c.observed[c.observed.length - 1][0];
    const pred = c.predicted.filter((r) => r[0] > lastObs);
    const end = Math.max(m0(lastObs), ...pred.map((r) => m0(r[0])));
    const top = Math.max(200, ...c.observed.map((r) => r[1]));
    const x = (s: string) => ((m0(s) - start) / (end - start)) * W;
    const y = (v: number) => H - (v / top) * H;
    const smooth = c.observed.filter((r) => r[2] != null).map((r) => `${x(r[0]).toFixed(1)},${y(r[2]!).toFixed(1)}`);
    const predLine = pred.map((r) => `${x(r[0]).toFixed(1)},${y(r[1]).toFixed(1)}`);
    const band = [...pred.map((r) => `${x(r[0]).toFixed(1)},${y(r[3]).toFixed(1)}`), ...[...pred].reverse().map((r) => `${x(r[0]).toFixed(1)},${y(r[2]).toFixed(1)}`)];
    const years = [];
    for (let yr = Math.ceil(start / 12 / 5) * 5; yr * 12 <= end; yr += 5) years.push({ yr, x: ((yr * 12 - start) / (end - start)) * W });
    return {
      bars: c.observed.map((r) => ({ x: x(r[0]), h: H - y(r[1]) })),
      bw: Math.max(1, W / (end - start) - 0.4),
      smooth: smooth.join(' '),
      pred: predLine.join(' '),
      band: band.join(' '),
      years,
      nowX: x(lastObs),
      grid: [50, 100, 150, 200].filter((v) => v <= top).map((v) => ({ v, y: y(v) })),
    };
  });
</script>

<div class="sun">
  <div class="panel pic">
    <div class="disk">
      {#each data.images as im, i (im.kind)}
        <img src={im.url} alt="" class:on={i === shown} />
      {/each}
      {#each data.regions as r (r.num)}
        {@const left = 50 + r.dx * R * 100}
        {@const top = 50 - r.dy * R * 100}
        <span class="reg" class:faint={!r.spots} style:left={`${left}%`} style:top={`${top}%`} style:color={riskColor(r.m)}>{r.num}</span>
      {/each}
      <div class="cap">{IMG_TEXT[img.kind][L]} · {time(L, img.time, tz)}</div>
    </div>
  </div>
  <div class="panel side">
    <div class="stats">
      <div>
        <div class="lbl">{L === 'fi' ? 'Auringonpilkkuluku' : 'Sunspot number'}</div>
        <div class="big">{data.file.ssn ? num(L, data.file.ssn.ssn) : '–'}</div>
      </div>
      <div>
        <div class="lbl">{L === 'fi' ? 'Radiovuo F10,7' : 'Radio flux F10.7'}</div>
        <div class="big">{data.file.f107 ? num(L, data.file.f107.flux) : '–'}</div>
      </div>
      {#if p}
        <div>
          <div class="lbl">{L === 'fi' ? 'Purkaus 24 h' : 'Flare in 24 h'}</div>
          <div class="probs">
            <span><b style:color="#e8902a">M</b> {num(L, p.m[0])}{L === 'fi' ? ' %' : '%'}</span>
            <span><b style:color="#e8413a">X</b> {num(L, p.x[0])}{L === 'fi' ? ' %' : '%'}</span>
          </div>
        </div>
      {/if}
    </div>

    {#if table.length}
      <table>
        <thead>
          <tr>
            <th>{L === 'fi' ? 'Pilkkuryhmä' : 'Region'}</th>
            <th class="n">{L === 'fi' ? 'Pilkkuja' : 'Spots'}</th>
            <th class="n">{L === 'fi' ? 'Ala' : 'Area'}</th>
            <th>{L === 'fi' ? 'Magneettikenttä' : 'Magnetic'}</th>
            <th class="n">{L === 'fi' ? 'M / X' : 'M / X'}</th>
          </tr>
        </thead>
        <tbody>
          {#each table as r (r.num)}
            <tr>
              <td><span class="dot" style:background={riskColor(r.m)}></span>{r.num}</td>
              <td class="n">{num(L, r.spots)}</td>
              <td class="n">{num(L, r.area)}</td>
              <td class="greek">{greek(r.mag)}</td>
              <td class="n">{r.m ?? '–'} / {r.x ?? '–'}{L === 'fi' ? ' %' : '%'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="plain">{L === 'fi' ? 'Auringossa ei ole nyt pilkkuja.' : 'The Sun is spotless today.'}</p>
    {/if}

    {#if cyc}
      <div class="lbl">{L === 'fi' ? 'Auringon aktiivisuussykli (kuukausittain)' : 'Solar cycle (monthly)'}</div>
      <svg class="cycle" viewBox={`0 -6 ${W} ${H + 30}`}>
        {#each cyc.grid as g (g.v)}
          <line x1="0" x2={W} y1={g.y} y2={g.y} class="grid" />
          <text x="2" y={g.y - 3} class="gl">{g.v}</text>
        {/each}
        {#each cyc.bars as b, i (i)}
          <rect x={b.x} y={H - b.h} width={cyc.bw} height={b.h} class="mbar" />
        {/each}
        {#if cyc.band}<polygon points={cyc.band} class="band" />{/if}
        {#if cyc.pred}<polyline points={cyc.pred} class="pred" />{/if}
        <polyline points={cyc.smooth} class="smooth" />
        <line x1={cyc.nowX} x2={cyc.nowX} y1="0" y2={H} class="now" />
        {#each cyc.years as y (y.yr)}
          <text x={y.x} y={H + 22} text-anchor="middle" class="gl">{y.yr}</text>
        {/each}
      </svg>
    {/if}
    <p class="note">
      {L === 'fi'
        ? 'Värit: M-purkauksen todennäköisyys · NASA/SDO, NOAA SWPC'
        : 'Colours: chance of an M-class flare · NASA/SDO, NOAA SWPC'}
    </p>
  </div>
</div>

<style>
  .sun {
    display: flex;
    gap: 22px;
    height: 100%;
  }
  .pic {
    flex: none;
    aspect-ratio: 1;
    height: 100%;
    padding: 0;
    overflow: hidden;
    background: #000;
  }
  .disk {
    position: relative;
    width: 100%;
    height: 100%;
  }
  .disk img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    transition: opacity 1.4s ease-in-out;
  }
  .disk img.on {
    opacity: 1;
  }
  .reg {
    position: absolute;
    transform: translate(8px, -105%);
    font-size: 16px;
    font-weight: 700;
    line-height: 1;
    padding: 2px 5px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.62);
    text-shadow: none;
    white-space: nowrap;
  }
  .reg.faint {
    opacity: 0.6;
    font-weight: 400;
  }
  .cap {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 8px;
    font-size: 17px;
    color: #ddd;
    text-shadow: 0 0 4px #000;
  }
  .side {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .stats {
    display: flex;
    justify-content: space-between;
    gap: 14px;
  }
  .lbl {
    font-size: 19px;
    color: var(--c-label);
  }
  .big {
    font-size: 48px;
    font-weight: 700;
    line-height: 1.05;
    color: var(--c-value);
  }
  .probs {
    display: flex;
    gap: 14px;
    font-size: 30px;
    line-height: 1.55;
    color: var(--c-value);
    font-variant-numeric: tabular-nums;
  }
  table {
    border-collapse: collapse;
    font-size: 21px;
    margin-top: 2px;
  }
  th {
    font-size: 17px;
    font-weight: 600;
    color: var(--c-accent);
    text-align: left;
    padding: 0 6px 2px;
  }
  td {
    padding: 1px 6px;
    color: var(--c-value);
    font-variant-numeric: tabular-nums;
  }
  .n {
    text-align: right;
  }
  .greek {
    font-size: 22px;
  }
  .dot {
    display: inline-block;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    margin-right: 8px;
  }
  .plain {
    margin: 0;
    font-size: 21px;
    color: var(--c-label);
  }
  .cycle {
    width: 100%;
    flex: 1;
    min-height: 0;
  }
  .grid {
    stroke: rgba(255, 255, 255, 0.15);
    stroke-width: 1;
  }
  .gl {
    font-size: 15px;
    fill: var(--c-label);
  }
  .mbar {
    fill: rgba(255, 255, 255, 0.28);
  }
  .smooth {
    fill: none;
    stroke: #ffb02e;
    stroke-width: 3;
  }
  .pred {
    fill: none;
    stroke: #ffb02e;
    stroke-width: 2;
    stroke-dasharray: 6 5;
  }
  .band {
    fill: rgba(255, 176, 46, 0.18);
  }
  .now {
    stroke: var(--c-accent);
    stroke-width: 2;
  }
  .note {
    margin: 0;
    font-size: 15px;
    color: var(--c-label);
  }
</style>
