<script lang="ts" module>
  import type { Basemap } from '../map/basemap';
  import type { MapLabel } from '../map/MapView.svelte';
  import type { SeaFile } from '../lib/types';
  export interface SeaWind {
    name: string;
    lat: number;
    lon: number;
    ws: number;
    wg: number | null;
    wd: number | null;
  }
  export interface SeaData {
    base: Basemap;
    sea: SeaFile;
    winds: SeaWind[];
    labels: MapLabel[];
  }
</script>

<script lang="ts">
  // Sea conditions: wind at coastal/island stations on a coast map, wave buoys and
  // sea level / water temperature from FMI.
  import MapView from '../map/MapView.svelte';
  import WindDir from '../components/WindDir.svelte';
  import { pixel, type Extent } from '../map/proj';
  import { num, temp, time } from '../lib/format';
  import type { SlideProps } from '../engine/types';

  let { ctx, data }: SlideProps<SeaData> = $props();
  const L = $derived(ctx.lang);

  // Gulf of Bothnia + Archipelago Sea + Gulf of Finland (EPSG:3067 metres)
  const VIEW: Extent = [0, 6530000, 600000, 7340000];
  const H = 516;
  const W = Math.round((H * (VIEW[2] - VIEW[0])) / (VIEW[3] - VIEW[1]));
  const px = pixel(VIEW, W, H);

  const AREAS = [
    { fi: 'Perämeri', en: 'Bay of Bothnia', lat: 65.0, lon: 23.3 },
    { fi: 'Merenkurkku', en: 'The Quark', lat: 63.55, lon: 20.6 },
    { fi: 'Selkämeri', en: 'Bothnian Sea', lat: 62.0, lon: 19.9 },
    { fi: 'Pohjois-Itämeri', en: 'Northern Baltic', lat: 59.3, lon: 23.4 },
    { fi: 'Suomenlahti', en: 'Gulf of Finland', lat: 59.72, lon: 25.4 },
  ];

  // FMI marine wind warning classes (m/s)
  const windColor = (ws: number) => (ws >= 21 ? '#ff3030' : ws >= 14 ? '#ff9a1e' : ws >= 11 ? '#ffe14a' : '#ffffff');

  /** grid-north correction: ETRS-TM35FIN central meridian 27°E */
  const gamma = (lat: number, lon: number) =>
    (Math.atan(Math.tan(((lon - 27) * Math.PI) / 180) * Math.sin((lat * Math.PI) / 180)) * 180) / Math.PI;

  // strongest first; skip stations that would overlap one already drawn
  const winds = $derived.by(() => {
    const out: (SeaWind & { xy: [number, number] })[] = [];
    for (const w of [...data.winds].sort((a, b) => b.ws - a.ws)) {
      const xy = px.fromLatLon(w.lat, w.lon) as [number, number];
      if (xy[0] < 8 || xy[0] > W - 8 || xy[1] < 8 || xy[1] > H - 8) continue;
      if (out.some((o) => Math.hypot(o.xy[0] - xy[0], o.xy[1] - xy[1]) < 30)) continue;
      out.push({ ...w, xy });
    }
    return out;
  });
  // wave badges, except where they would cover a city label
  const buoys = $derived.by(() => {
    const cities = data.labels.map((l) => px.fromLatLon(l.lat, l.lon));
    return data.sea.waves
      .filter((b) => b.hs != null)
      .map((b) => ({ ...b, xy: px.fromLatLon(b.lat, b.lon) }))
      .filter((b) => !cities.some(([x, y]) => Math.abs(x - b.xy[0]) < 50 && Math.abs(y - b.xy[1]) < 20));
  });

  const BUOY_EN: Record<string, string> = {
    Perämeri: 'Bay of Bothnia',
    Selkämeri: 'Bothnian Sea',
    'Pohjois-Itämeri': 'Northern Baltic',
    Suomenlahti: 'Gulf of Finland',
  };
  function buoyName(n: string): string {
    const s = n.replace(/ aaltopoiju$/, '');
    return L === 'en' ? (BUOY_EN[s] ?? s) : s;
  }
  // "Helsinki Kaivopuisto" -> "Helsinki", "Pori Mäntyluoto Kallo" -> "Pori"
  const levelName = (n: string) => n.split(' ')[0];
  const signed = (v: number) => (v > 0 ? `+${v}` : v < 0 ? `−${-v}` : '±0');
  const trendArrow = (v: number | null) => (v == null ? '' : v >= 3 ? '▲' : v <= -3 ? '▼' : '►');
  const levelColor = (v: number) => (v >= 60 ? '#ff9a1e' : v >= 30 ? '#ffe14a' : v <= -40 ? '#7fc4ff' : 'var(--c-value)');

  const newest = $derived(
    [...data.sea.waves, ...data.sea.levels]
      .map((x) => x.time)
      .filter(Boolean)
      .sort()
      .pop() ?? null,
  );
</script>

<div class="sea">
  <MapView base={data.base} w={W} h={H} view={VIEW} labels={data.labels}>
    <svg class="marks" width={W} height={H}>
      {#each AREAS as a (a.fi)}
        {@const [x, y] = px.fromLatLon(a.lat, a.lon)}
        <text class="area" {x} {y} text-anchor="middle">{a[L]}</text>
      {/each}
      {#each buoys as b (b.name)}
        <g transform={`translate(${b.xy[0]} ${b.xy[1]})`}>
          <rect class="wave" x="-29" y="-12" width="58" height="24" rx="12" />
          <text class="wave-t" y="6" text-anchor="middle">{num(b.hs, 1)} m</text>
        </g>
      {/each}
      {#each winds as w (w.name)}
        <g transform={`translate(${w.xy[0]} ${w.xy[1]})`}>
          {#if w.wd != null && w.ws >= 0.5}
            <path
              class="arrow"
              d="M0 -15 L8 -2 L3 -2 L3 13 L-3 13 L-3 -2 L-8 -2 Z"
              transform={`rotate(${(w.wd + 180 - gamma(w.lat, w.lon) + 360) % 360})`}
              style:fill={windColor(w.ws)}
            />
          {/if}
          <text class="ws" x="14" y="7">{Math.round(w.ws)}</text>
        </g>
      {/each}
    </svg>
  </MapView>

  <div class="panel side">
    <div class="legend">
      <span>{L === 'fi' ? 'Tuuli m/s' : 'Wind m/s'}</span>
      <i style:background={windColor(0)}></i>&lt;11
      <i style:background={windColor(11)}></i>11–13
      <i style:background={windColor(14)}></i>14–20
      <i style:background={windColor(21)}></i>21+
    </div>
    <div class="cols">
      <section>
        <h3>{L === 'fi' ? 'Aallokko' : 'Waves'}</h3>
        <table>
          <thead>
            <tr><th></th><th>{L === 'fi' ? 'korkeus' : 'height'}</th><th></th><th>{L === 'fi' ? 'vesi' : 'water'}</th></tr>
          </thead>
          <tbody>
            {#each data.sea.waves as b (b.name)}
              <tr>
                <td class="name">{buoyName(b.name)}</td>
                <td class="n">{b.hs == null ? '–' : `${num(b.hs, 1)} m`}</td>
                <td class="dir">{#if b.dir != null}<WindDir lang={L} deg={b.dir} />{/if}</td>
                <td class="n">{temp(b.tw)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
        {#if data.winds.length}
          {@const top = [...data.winds].sort((a, b) => b.ws - a.ws)[0]}
          <p class="max">
            {L === 'fi' ? 'Kovin tuuli' : 'Strongest wind'}: <b>{Math.round(top.ws)} m/s</b>
            {#if top.wg != null}<small>({L === 'fi' ? 'puuskat' : 'gusts'} {Math.round(top.wg)})</small>{/if}<br />
            <small>{top.name}</small>
          </p>
        {/if}
      </section>
      <section>
        <h3>{L === 'fi' ? 'Vedenkorkeus' : 'Sea level'} <small>cm</small></h3>
        <table>
          <tbody>
            {#each data.sea.levels as s (s.name)}
              <tr>
                <td class="name">{levelName(s.name)}</td>
                <td class="n" style:color={levelColor(s.level)}>{signed(s.level)}</td>
                <td class="tr">{trendArrow(s.trend)}</td>
                <td class="n">{temp(s.tw)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    </div>
    <p class="note">
      {L === 'fi' ? 'Vedenkorkeus teoreettiseen keskiveteen nähden' : 'Sea level relative to the theoretical mean'} ·
      {time(L, newest, 'Europe/Helsinki')} · {L === 'fi' ? 'Ilmatieteen laitos' : 'Finnish Meteorological Institute'}
    </p>
  </div>
</div>

<style>
  .sea {
    display: flex;
    gap: 20px;
    height: 100%;
  }
  .marks {
    position: absolute;
    inset: 0;
  }
  .area {
    font-size: 17px;
    font-style: italic;
    fill: rgba(220, 240, 255, 0.75);
    letter-spacing: 1px;
  }
  .wave {
    fill: #1a5fd0;
    stroke: #000;
    stroke-width: 1.5;
  }
  .wave-t {
    font-size: 15px;
    font-weight: 700;
    fill: #fff;
  }
  .arrow {
    stroke: #000;
    stroke-width: 1.5;
  }
  .ws {
    font-size: 18px;
    font-weight: 700;
    fill: #fff;
    paint-order: stroke;
    stroke: #000;
    stroke-width: 3.5px;
  }
  .side {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }
  .legend {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 20px;
    color: var(--c-label);
  }
  .legend span {
    margin-right: 6px;
  }
  .legend i {
    width: 18px;
    height: 18px;
    border: 1.5px solid #000;
    margin-left: 6px;
  }
  .cols {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 22px;
    flex: 1;
    min-height: 0;
  }
  h3 {
    margin: 0 0 4px;
    font-size: 26px;
    color: var(--c-accent);
  }
  h3 small {
    font-size: 0.7em;
    color: var(--c-label);
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 20px;
  }
  th {
    font-size: 16px;
    font-weight: 400;
    color: var(--c-label);
    text-align: right;
  }
  td {
    padding: 0 4px;
    white-space: nowrap;
  }
  .name {
    color: var(--c-value);
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 170px;
  }
  .n {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .dir,
  .tr {
    text-align: center;
    color: var(--c-label);
    font-size: 0.85em;
  }
  .max {
    margin: 14px 0 0;
    font-size: 21px;
  }
  .max small {
    color: var(--c-label);
  }
  .note {
    margin: 0;
    font-size: 17px;
    color: var(--c-label);
  }
</style>
