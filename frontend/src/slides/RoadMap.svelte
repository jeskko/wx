<script lang="ts" module>
  import type { Basemap } from '../map/basemap';
  import type { MapLabel } from '../map/MapView.svelte';
  export interface RoadsFile {
    updated: string;
    extent: [number, number, number, number];
    steps: string[];
    times: string[];
    sections: { id: string; name: string; road: number; path: string; cond: string; rt: number | null; t: number | null }[];
    stations: { id: number; name: string; lat: number; lon: number; t?: number; rt?: number; cond?: number | null; warn?: number }[];
  }
  export interface RoadData {
    base: Basemap;
    roads: RoadsFile;
    labels: MapLabel[];
    cities: { name: string; rt: number | null; cond: number | null }[];
  }
</script>

<script lang="ts">
  // Driving conditions: Digitraffic road condition forecast per road section, stepping now -> +12 h.
  import MapView from '../map/MapView.svelte';
  import { mapSize } from '../map/basemap';
  import { temp } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<RoadData> = $props();
  const L = $derived(ctx.lang);
  const size = $derived(mapSize(data.base));

  const COLOR: Record<string, string> = { N: '#3fdc5a', P: '#ffd800', X: '#ff3030', '?': '#9aa3b5' };
  const COND_TEXT: Record<'fi' | 'en', Record<number, string>> = {
    fi: { 1: 'kuiva', 2: 'kostea', 3: 'märkä', 4: 'märkä, suolattu', 5: 'kuuraa', 6: 'lunta', 7: 'jäätä', 8: 'kostea, suolattu' },
    en: { 1: 'dry', 2: 'moist', 3: 'wet', 4: 'wet, salted', 5: 'frost', 6: 'snow', 7: 'ice', 8: 'moist, salted' },
  };
  const STEP_LABEL: Record<'fi' | 'en', string[]> = {
    fi: ['nyt', '+2 h', '+4 h', '+6 h', '+12 h'],
    en: ['now', '+2 h', '+4 h', '+6 h', '+12 h'],
  };

  let step = $state(0);
  $effect(() => {
    step = 0;
    const id = setInterval(() => (step = (step + 1) % data.roads.steps.length), 2200);
    return () => clearInterval(id);
  });

  const counts = $derived.by(() => {
    const c = { N: 0, P: 0, X: 0 };
    for (const s of data.roads.sections) {
      const k = s.cond[step] as 'N' | 'P' | 'X';
      if (k in c) c[k]++;
    }
    return c;
  });
  // draw good roads first so poor ones end up on top
  const ordered = $derived([...data.roads.sections].sort((a, b) => 'NPX?'.indexOf(a.cond[step]) - 'NPX?'.indexOf(b.cond[step])));
</script>

<div class="mapslide">
  <MapView base={data.base} w={size.w} h={size.h} labels={data.labels}>
    <svg class="roads" viewBox={`0 0 ${data.base.width} ${data.base.height}`} preserveAspectRatio="none">
      {#each ordered as s (s.id)}
        <path d={s.path} class="halo" />
        <path d={s.path} style:stroke={COLOR[s.cond[step]] ?? COLOR['?']} class="road" />
      {/each}
    </svg>
  </MapView>
  <div class="panel side">
    <div class="steps">
      {#each STEP_LABEL[L] as lbl, i (lbl)}<span class:on={i === step}>{lbl}</span>{/each}
    </div>
    <ul class="legend">
      <li><i style:background={COLOR.N}></i>{L === 'fi' ? 'normaali ajokeli' : 'normal'} <b>{counts.N}</b></li>
      <li><i style:background={COLOR.P}></i>{L === 'fi' ? 'huono ajokeli' : 'poor'} <b>{counts.P}</b></li>
      <li><i style:background={COLOR.X}></i>{L === 'fi' ? 'erittäin huono' : 'very poor'} <b>{counts.X}</b></li>
    </ul>
    {#if data.cities.length}
      <h3>{L === 'fi' ? 'Tienpinta nyt' : 'Road surface now'}</h3>
      <table>
        <tbody>
          {#each data.cities as c (c.name)}
            <tr>
              <td>{c.name}</td>
              <td class="n">{temp(c.rt)}</td>
              <td class="cond">{c.cond != null ? (COND_TEXT[L][c.cond] ?? '') : ''}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
    <p class="note">{L === 'fi' ? 'Ajokeliennuste tieosuuksittain · Fintraffic / Digitraffic' : 'Road condition forecast by section · Fintraffic / Digitraffic'}</p>
  </div>
</div>

<style>
  .mapslide {
    display: flex;
    gap: 22px;
    height: 100%;
  }
  .roads {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .road,
  .halo {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }
  .halo {
    stroke: rgba(0, 0, 0, 0.75);
    stroke-width: 6;
  }
  .road {
    stroke-width: 3.5;
  }
  .side {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .steps {
    display: flex;
    gap: 6px;
  }
  .steps span {
    flex: 1;
    text-align: center;
    font-size: 24px;
    padding: 4px 0;
    border-radius: 4px;
    background: var(--progress-track);
    color: var(--c-label);
  }
  .steps span.on {
    background: var(--c-accent);
    color: #000;
    text-shadow: none;
    font-weight: 700;
  }
  .legend {
    list-style: none;
    margin: 0;
    padding: 0;
    font-size: 26px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .legend li {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .legend i {
    width: 40px;
    height: 8px;
    border-radius: 4px;
    border: 1px solid #000;
  }
  .legend b {
    margin-left: auto;
  }
  h3 {
    margin: 6px 0 0;
    font-size: 26px;
    color: var(--c-accent);
  }
  table {
    font-size: 24px;
    border-collapse: collapse;
  }
  td {
    padding: 1px 8px 1px 0;
  }
  .n {
    text-align: right;
    font-weight: 700;
  }
  .cond {
    color: var(--c-label);
  }
  .note {
    margin-top: auto;
    font-size: 20px;
    color: var(--c-label);
  }
</style>
