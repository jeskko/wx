<script lang="ts" module>
  import type { Visible } from '../lib/sky';
  export interface SkyStar {
    name: string;
    alt: number;
    az: number;
    mag: number;
  }
  export interface SkyData {
    at: Date;
    dark: boolean;
    minSun: number;
    objects: Visible[];
    stars: SkyStar[];
    lines: { name: string; segs: [SkyStar, SkyStar][] }[];
    moonPhase: number;
    moonFraction: number;
    showers: { name: string; peak: Date; atPeak: boolean }[];
  }
</script>

<script lang="ts">
  // Tonight's naked-eye sky over central Finland: planets, the Moon, bright stars and
  // constellations on an all-sky chart (north up, east left: as seen lying on your back).
  import { COMPASS, compassIndex } from '../lib/sky';
  import { num, time } from '../lib/format';
  import { LOCALE } from '../i18n';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<SkyData> = $props();
  const L = $derived(ctx.lang);
  const tz = 'Europe/Helsinki';

  const S = 500;
  const R = 218;
  const C = S / 2;
  const xy = (alt: number, az: number): [number, number] => {
    const r = (R * (90 - alt)) / 90;
    const a = (az * Math.PI) / 180;
    return [C - r * Math.sin(a), C - r * Math.cos(a)];
  };

  const NAMES: Record<string, { fi: string; en: string; color: string }> = {
    moon: { fi: 'Kuu', en: 'Moon', color: '#f3efc8' },
    mercury: { fi: 'Merkurius', en: 'Mercury', color: '#d9c7ad' },
    venus: { fi: 'Venus', en: 'Venus', color: '#fffbe0' },
    mars: { fi: 'Mars', en: 'Mars', color: '#ff7a4d' },
    jupiter: { fi: 'Jupiter', en: 'Jupiter', color: '#ffe3ad' },
    saturn: { fi: 'Saturnus', en: 'Saturn', color: '#f2d27a' },
  };
  const DIRS = { fi: ['P', 'I', 'E', 'L'], en: ['N', 'E', 'S', 'W'] };

  // objects above the horizon, with labels nudged down when they would overlap
  const up = $derived.by(() => {
    const placed: { x: number; y: number }[] = [];
    return data.objects
      .filter((o) => o.alt > 0)
      .map((o) => {
        const [x, y] = xy(o.alt, o.az);
        let ly = y + 6;
        while (placed.some((p) => Math.abs(p.x - x) < 90 && Math.abs(p.y - ly) < 18)) ly += 18;
        placed.push({ x, y: ly });
        return { ...o, x, y, ly };
      });
  });
  const starR = (m: number) => Math.max(0.9, 3.4 - m * 0.75);

  // moon disc: lit half + terminator ellipse (same construction as the almanac)
  const moonPath = (r: number) => {
    const p = data.moonPhase;
    const waxing = p < 0.5;
    const k = Math.cos(2 * Math.PI * p);
    const rx = Math.abs(k) * r;
    const sweepTerm = (waxing ? k > 0 : k < 0) ? 0 : 1;
    return `M0 ${-r} A${r} ${r} 0 0 ${waxing ? 1 : 0} 0 ${r} A${rx} ${r} 0 0 ${sweepTerm} 0 ${-r}Z`;
  };

  const where = (alt: number, az: number) => `${COMPASS[L][compassIndex(az)]} ${Math.round(alt)}°`;
  const magText = (m: number) => (m < -6 ? '' : `${L === 'fi' ? 'kirkkaus' : 'mag'} ${num(m, 1).replace('.', L === 'fi' ? ',' : '.')}`);
  const day = (d: Date) => d.toLocaleDateString(LOCALE[L], { day: 'numeric', month: 'numeric', timeZone: tz });
</script>

<div class="sky">
  <div class="chartbox">
    <svg viewBox={`0 0 ${S} ${S}`} width={S} height={S}>
      <defs>
        <radialGradient id="skybg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color={data.dark ? '#0b1640' : '#2a3f7a'} />
          <stop offset="100%" stop-color={data.dark ? '#050a22' : '#4a5f96'} />
        </radialGradient>
      </defs>
      <circle cx={C} cy={C} r={R} fill="url(#skybg)" stroke="#8fa3d8" stroke-width="2" />
      {#each [30, 60] as a (a)}
        <circle cx={C} cy={C} r={(R * (90 - a)) / 90} class="ring" />
      {/each}
      {#each DIRS[L] as d, i (d)}
        {@const a = (i * Math.PI) / 2}
        <text class="dir" x={C - (R + 17) * Math.sin(a)} y={C - (R + 17) * Math.cos(a) + 7} text-anchor="middle">{d}</text>
      {/each}
      {#each data.lines as ln (ln.name)}
        {#each ln.segs as [a, b], k (k)}
          {@const [x1, y1] = xy(a.alt, a.az)}
          {@const [x2, y2] = xy(b.alt, b.az)}
          <line {x1} {y1} {x2} {y2} class="cline" />
        {/each}
        {@const [lx, ly] = xy(ln.segs[0][0].alt, ln.segs[0][0].az)}
        <text class="cname" x={lx + 6} y={ly - 6}>{ln.name}</text>
      {/each}
      {#each data.stars as s (s.name)}
        {@const [x, y] = xy(s.alt, s.az)}
        <circle cx={x} cy={y} r={starR(s.mag)} class="star" />
        {#if s.mag < 0.6}<text class="sname" x={x + 5} y={y + 13}>{s.name}</text>{/if}
      {/each}
      {#each up as o (o.id)}
        {@const x = o.x}
        {@const y = o.y}
        {#if o.id === 'moon'}
          <g transform={`translate(${x} ${y})`}>
            <circle r="11" fill="#2a3150" stroke="#8a93b8" stroke-width="1" />
            <path d={moonPath(11)} fill={NAMES.moon.color} />
          </g>
        {:else}
          <circle cx={x} cy={y} r="6" fill={NAMES[o.id].color} stroke="#000" stroke-width="1.5" />
        {/if}
        <text class="pname" x={x + 14} y={o.ly}>{NAMES[o.id][L]}</text>
      {/each}
    </svg>
  </div>

  <div class="panel side">
    <div class="when">
      {L === 'fi' ? 'Taivas klo' : 'Sky at'} <b>{time(L, data.at, tz)}</b>
      <small>· {L === 'fi' ? 'Keski-Suomi' : 'central Finland'}</small>
    </div>
    {#if !data.dark}
      <p class="light">
        {L === 'fi'
          ? `Valoisa yö: aurinko käy vain ${Math.round(-data.minSun)}° horisontin alla. Vain kirkkaimmat kohteet näkyvät.`
          : `Light night: the sun only dips ${Math.round(-data.minSun)}° below the horizon. Only the brightest objects show.`}
      </p>
    {/if}
    {#if data.objects.length}
      <ul class="objs">
        {#each data.objects as o (o.id)}
          <li>
            <i style:background={NAMES[o.id].color}></i>
            <div>
              <div class="oname">{NAMES[o.id][L]} <small>{o.id === 'moon' ? `${Math.round(data.moonFraction * 100)} %` : magText(o.mag)}</small></div>
              <div class="odet">
                {#if o.alt > 0}{L === 'fi' ? 'nyt' : 'now'} {where(o.alt, o.az)}{:else}{L === 'fi' ? 'nyt horisontin alla' : 'now below the horizon'}{/if}
                {#if o.best && Math.abs(o.best.getTime() - data.at.getTime()) > 45 * 60_000}
                  · {L === 'fi' ? 'parhaiten klo' : 'best at'} {time(L, o.best, tz)} {where(o.bestAlt, o.bestAz)}
                {/if}
              </div>
            </div>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="none">{L === 'fi' ? 'Tänä yönä ei näy kirkkaita planeettoja.' : 'No bright planets on view tonight.'}</p>
    {/if}
    {#each data.showers as sh (sh.name)}
      <p class="shower">
        ☄ {sh.name}
        {sh.atPeak ? (L === 'fi' ? '– huippu nyt!' : '– peaking now!') : `(${L === 'fi' ? 'huippu' : 'peak'} ${day(sh.peak)})`}
      </p>
    {/each}
    <p class="note">{L === 'fi' ? 'Paljain silmin näkyvät kohteet · laskettu Keski-Suomeen (63,5° P, 26° I)' : 'Naked-eye objects · computed for central Finland (63.5° N, 26° E)'}</p>
  </div>
</div>

<style>
  .sky {
    display: flex;
    gap: 22px;
    height: 100%;
    align-items: center;
  }
  .chartbox {
    flex: none;
  }
  .ring {
    fill: none;
    stroke: rgba(160, 180, 230, 0.18);
    stroke-dasharray: 3 5;
  }
  .dir {
    font-size: 20px;
    font-weight: 700;
    fill: #c9d6ff;
  }
  .cline {
    stroke: rgba(150, 175, 240, 0.35);
    stroke-width: 1.2;
  }
  .cname {
    font-size: 12px;
    font-style: italic;
    fill: rgba(170, 190, 245, 0.65);
  }
  .star {
    fill: #f4f6ff;
  }
  .sname {
    font-size: 11px;
    fill: rgba(220, 228, 255, 0.7);
  }
  .pname {
    font-size: 17px;
    font-weight: 700;
    fill: #fff;
    paint-order: stroke;
    stroke: #000;
    stroke-width: 3px;
  }
  .side {
    flex: 1;
    min-width: 0;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .when {
    font-size: 28px;
    color: var(--c-label);
  }
  .when b {
    color: var(--c-value);
    font-size: 34px;
  }
  .when small {
    font-size: 0.7em;
  }
  .light {
    margin: 0;
    font-size: 19px;
    color: var(--c-accent);
  }
  .objs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .objs li {
    display: flex;
    gap: 12px;
    align-items: flex-start;
  }
  .objs i {
    flex: none;
    width: 16px;
    height: 16px;
    margin-top: 8px;
    border-radius: 50%;
    border: 1.5px solid #000;
  }
  .oname {
    font-size: 27px;
    color: var(--c-value);
  }
  .oname small {
    font-size: 0.65em;
    color: var(--c-label);
  }
  .odet {
    font-size: 19px;
    color: var(--c-label);
  }
  .none {
    font-size: 22px;
  }
  .shower {
    margin: 0;
    font-size: 21px;
    color: var(--c-accent);
  }
  .note {
    margin-top: auto;
    font-size: 15px;
    color: var(--c-label);
  }
</style>
