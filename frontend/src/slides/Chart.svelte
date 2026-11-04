<script lang="ts">
  // Next 24 h: temperature line, precipitation bars, icons and wind every 3 h.
  import WxIcon from '../components/WxIcon.svelte';
  import { num, temp, time, windShort } from '../lib/format';
  import type { Step } from '../lib/types';
  import { isNight } from '../lib/wx';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<{ steps: Step[]; tz: string }> = $props();
  const L = $derived(ctx.lang);

  const W = 1180;
  const H = 500;
  const PADX = 40;
  const TOP = 130; // icons above the plot
  const PLOT_H = 240;
  const BASE = TOP + PLOT_H;

  const steps = $derived(data.steps);
  const temps = $derived(steps.map((s) => s.t ?? 0));
  const tmin = $derived(Math.floor(Math.min(...temps)) - 1);
  const tmax = $derived(Math.ceil(Math.max(...temps)) + 1);
  const x = (i: number) => PADX + (i * (W - 2 * PADX)) / Math.max(1, steps.length - 1);
  const y = (v: number) => TOP + PLOT_H - ((v - tmin) / Math.max(1, tmax - tmin)) * PLOT_H;
  const prMax = $derived(Math.max(2, ...steps.map((s) => s.pr ?? 0)));
  const line = $derived(steps.map((s, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(s.t ?? 0).toFixed(1)}`).join(''));
  const area = $derived(`${line}L${x(steps.length - 1)} ${BASE}L${x(0)} ${BASE}Z`);
  const zeroY = $derived(tmin < 0 && tmax > 0 ? y(0) : null);
  const marks = $derived(steps.map((s, i) => ({ s, i })).filter(({ i }) => i % 3 === 0));
</script>

<div class="panel chart">
  <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%">
    <defs>
      <linearGradient id="tfill" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stop-color="var(--c-warm)" stop-opacity="0.45" />
        <stop offset="1" stop-color="var(--c-warm)" stop-opacity="0.02" />
      </linearGradient>
    </defs>
    {#each steps as s, i (s.time)}
      {#if (s.pr ?? 0) > 0.05}
        {@const h = ((s.pr ?? 0) / prMax) * (PLOT_H * 0.6)}
        <rect class="bar" x={x(i) - 14} y={BASE - h} width="28" height={h} />
      {/if}
    {/each}
    {#if zeroY != null}
      <line class="zero" x1={PADX} x2={W - PADX} y1={zeroY} y2={zeroY} />
    {/if}
    <path d={area} fill="url(#tfill)" />
    <path class="tline" d={line} />
    {#each marks as { s, i } (s.time)}
      <g transform={`translate(${x(i)} 0)`}>
        <foreignObject x="-40" y="10" width="80" height="80">
          <WxIcon sym={s.sym} night={isNight(new Date(s.time), ctx.place.lat, ctx.place.lon)} size={76} />
        </foreignObject>
        <text class="tval" y={y(s.t ?? 0) - 14} text-anchor="middle">{temp(s.t)}</text>
        <circle class="dot" cy={y(s.t ?? 0)} r="6" />
        <text class="hour" y={BASE + 36} text-anchor="middle">{time(L, s.time, data.tz)}</text>
        {#if L === 'fi' && s.wd != null}
          <path class="warrow" d="M0 -9 L6 -1 L2 -1 L2 9 L-2 9 L-2 -1 L-6 -1 Z" transform={`translate(-14 ${BASE + 60}) rotate(${(s.wd + 180) % 360})`} />
          <text class="sub" x="2" y={BASE + 68} text-anchor="start">{num(s.ws)}</text>
        {:else}
          <text class="sub" y={BASE + 68} text-anchor="middle">{windShort(L, s.wd)} {num(s.ws)}</text>
        {/if}
        {#if (s.pr ?? 0) >= 0.1}
          <text class="sub pr" y={BASE + 98} text-anchor="middle">{num(s.pr, 1)} mm</text>
        {/if}
      </g>
    {/each}
  </svg>
</div>

<style>
  .chart {
    height: 100%;
    padding: 10px 14px;
  }
  .tline {
    fill: none;
    stroke: var(--c-warm);
    stroke-width: 5;
    stroke-linejoin: round;
  }
  .dot {
    fill: var(--c-value);
    stroke: var(--c-warm);
    stroke-width: 3;
  }
  .bar {
    fill: var(--icon-rain, #4fb3ff);
    opacity: 0.85;
  }
  .zero {
    stroke: var(--c-cold);
    stroke-dasharray: 8 6;
    stroke-width: 2;
  }
  text {
    fill: var(--c-value);
    font-family: inherit;
  }
  .tval {
    font-size: 32px;
    font-weight: 700;
    paint-order: stroke;
    stroke: var(--c-text-stroke, rgba(0, 0, 0, 0.6));
    stroke-width: 4px;
  }
  .hour {
    font-size: 26px;
    fill: var(--c-accent);
  }
  .sub {
    font-size: 22px;
    fill: var(--c-label);
  }
  .pr {
    fill: var(--icon-rain, #4fb3ff);
  }
  .warrow {
    fill: var(--c-label);
  }
</style>
