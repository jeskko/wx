<script lang="ts">
  // Original weather icon set. Normalized symbol (see backend/wx/symbols.py) + night flag.
  import { symIntensity, symKind } from '../lib/wx';

  let { sym, night = false, size = 64 }: { sym: string | null; night?: boolean; size?: number } = $props();

  const kind = $derived(symKind(sym));
  const inten = $derived(Math.max(1, symIntensity(sym)));
  const showers = $derived(kind === 'showers' || kind === 'snowshowers' || kind === 'thunder');
  const precip = $derived(
    kind === 'rain' || kind === 'showers' ? 'rain'
    : kind === 'snow' || kind === 'snowshowers' ? 'snow'
    : kind === 'sleet' ? 'sleet'
    : kind === 'thunder' ? 'rain'
    : null,
  );
  const hasCloud = $derived(kind !== 'clear' && kind !== '');
  const celestial = $derived(kind === 'clear' || kind === 'partly' || showers);
  const bigCloud = $derived(!(kind === 'partly' || showers));
  // drop / flake x positions by intensity
  const xs = $derived(inten === 1 ? [30] : inten === 2 ? [24, 38] : [19, 31, 43]);
</script>

<svg class="wxicon" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
  {#if !sym}
    <text x="32" y="42" text-anchor="middle" font-size="28" fill="currentColor">?</text>
  {:else}
    {#if celestial}
      <g transform={kind === 'clear' ? 'translate(8 8)' : 'translate(0 0)'}>
        {#if night}
          <path class="moon" d="M30 6a14 14 0 1 0 12 22A11 11 0 0 1 30 6z" transform={kind === 'clear' ? 'translate(-6 4) scale(1.2)' : 'translate(-6 -1)'} />
        {:else}
          <g class="sun" transform={kind === 'clear' ? 'translate(24 24)' : 'translate(22 20)'}>
            {#each [0, 45, 90, 135, 180, 225, 270, 315] as a (a)}
              <rect x="-2" y={kind === 'clear' ? -25 : -19} width="4" height={kind === 'clear' ? 8 : 6} rx="2" transform={`rotate(${a})`} />
            {/each}
            <circle r={kind === 'clear' ? 13 : 10} />
          </g>
        {/if}
      </g>
    {/if}

    {#if hasCloud && kind !== 'fog'}
      {#if bigCloud}
        <path class="cloud back" d="M40 14a10 10 0 0 1 18 6 7 7 0 0 1-1 14H40z" />
      {/if}
      <path
        class="cloud {kind === 'thunder' || inten >= 3 ? 'dark' : precip ? 'grey' : ''}"
        d={bigCloud
          ? 'M14 42a9 9 0 0 1 1-18 13 13 0 0 1 25-3 9 9 0 0 1 10 9 6 6 0 0 1 0 12z'
          : 'M18 46a8 8 0 0 1 1-16 11 11 0 0 1 21-3 8 8 0 0 1 9 8 5.5 5.5 0 0 1 0 11z'}
      />
    {/if}

    {#if kind === 'fog'}
      <path class="cloud grey" d="M14 30a9 9 0 0 1 1-18 13 13 0 0 1 25-3 9 9 0 0 1 10 9 6 6 0 0 1 0 12z" />
      {#each [36, 44, 52] as y, i (y)}
        <rect class="fog" x={8 + i * 3} y={y} width={46 - i * 4} height="4" rx="2" />
      {/each}
    {/if}

    {#if precip === 'rain'}
      {#each xs as x (x)}
        <path class="drop" d={`M${x} 48l-3 9a3 3 0 0 0 6 0z`} />
      {/each}
    {:else if precip === 'snow'}
      {#each xs as x (x)}
        <g class="flake" transform={`translate(${x} 54)`}>
          <rect x="-1" y="-5" width="2" height="10" />
          <rect x="-1" y="-5" width="2" height="10" transform="rotate(60)" />
          <rect x="-1" y="-5" width="2" height="10" transform="rotate(120)" />
        </g>
      {/each}
    {:else if precip === 'sleet'}
      {#each xs as x, i (x)}
        {#if i % 2 === 0}
          <path class="drop" d={`M${x} 48l-3 9a3 3 0 0 0 6 0z`} />
        {:else}
          <g class="flake" transform={`translate(${x} 54)`}>
            <rect x="-1" y="-5" width="2" height="10" />
            <rect x="-1" y="-5" width="2" height="10" transform="rotate(60)" />
            <rect x="-1" y="-5" width="2" height="10" transform="rotate(120)" />
          </g>
        {/if}
      {/each}
    {/if}

    {#if kind === 'thunder'}
      <path class="bolt" d="M36 40l-8 12h6l-4 10 11-14h-6l4-8z" />
    {/if}
  {/if}
</svg>

<style>
  .wxicon {
    overflow: visible;
    filter: drop-shadow(var(--icon-shadow, 2px 2px 0 rgba(0, 0, 0, 0.55)));
  }
  .sun circle,
  .sun rect {
    fill: var(--icon-sun, #ffd23f);
  }
  .sun circle {
    stroke: var(--icon-sun-edge, #f29b05);
    stroke-width: 2;
  }
  .moon {
    fill: var(--icon-moon, #f3efc8);
    stroke: var(--icon-moon-edge, #b9b48a);
    stroke-width: 1.5;
  }
  .cloud {
    fill: var(--icon-cloud, #ffffff);
    stroke: var(--icon-cloud-edge, #9fb0c8);
    stroke-width: 1.5;
  }
  .cloud.back {
    fill: var(--icon-cloud-back, #c9d3e3);
  }
  .cloud.grey {
    fill: var(--icon-cloud-grey, #d3d9e2);
  }
  .cloud.dark {
    fill: var(--icon-cloud-dark, #8f9aab);
    stroke: #5d6878;
  }
  .drop {
    fill: var(--icon-rain, #4fb3ff);
  }
  .flake rect {
    fill: var(--icon-snow, #ffffff);
  }
  .bolt {
    fill: var(--icon-bolt, #ffe14a);
    stroke: #b98a00;
    stroke-width: 1;
  }
  .fog {
    fill: var(--icon-fog, #c3cad6);
  }
</style>
