// All slide definitions: what data each needs and when to skip it.

import { getMoonIllumination, getMoonTimes, getTimes } from 'suncalc';
import { api } from '../lib/data';
import { outlook } from '../lib/aurora';
import { next36Periods, summarize, type PeriodSummary } from '../lib/textfc';
import type { Day, Metar, Station, Taf } from '../lib/types';
import { isCustom } from '../lib/geo';
import { currentFor, currentFromStep, fillFromNeighbours, haversineKm, isNight, nearestStation, obsSymbol, pointInPolygon, placeTz, stepAt } from '../lib/wx';
import { loadPlaylist } from './audio';
import { upcoming } from '../lib/nowcast';
import type { SlideDef } from './types';
import type { Key } from '../i18n';

import Almanac, { type AlmanacData } from '../slides/Almanac.svelte';
import Sky, { type SkyData, type SkyStar } from '../slides/Sky.svelte';
import { activeShowers, horizontal, LINES, STARS, starEq, tonight, visibleTonight } from '../lib/sky';
import Aurora, { type AuroraData } from '../slides/Aurora.svelte';
import Aviation from '../slides/Aviation.svelte';
import Chart from '../slides/Chart.svelte';
import Credits from '../slides/Credits.svelte';
import Current, { type CurrentData, type LocalRadar } from '../slides/Current.svelte';
import { forward, type Extent } from '../map/proj';
import Extended from '../slides/Extended.svelte';
import Next36 from '../slides/Next36.svelte';
import Regional, { type RegionalRow } from '../slides/Regional.svelte';
import Taf_ from '../slides/Taf.svelte';
import Warnings, { type WarningsData } from '../slides/Warnings.svelte';
import AuroraMap, { type AuroraMapData } from '../slides/AuroraMap.svelte';
import AuroraGlobe, { type AuroraGlobeData } from '../slides/AuroraGlobe.svelte';
import CloudMap, { type CloudData } from '../slides/CloudMap.svelte';
import RadarMap, { type RadarData } from '../slides/RadarMap.svelte';
import TempMap, { type TempMapData } from '../slides/TempMap.svelte';
import WindMap, { type WindData } from '../slides/WindMap.svelte';
import RoadMap, { type RoadData } from '../slides/RoadMap.svelte';
import Sea, { type SeaData, type SeaWind } from '../slides/Sea.svelte';
import WorldMap, { type WorldMapData } from '../slides/WorldMap.svelte';
import Capital, { type CapitalData } from '../slides/Capital.svelte';
import { allWorldCities, capitalById, REGIONS, regionCities, type WorldRegion } from '../lib/world';
import { loadWorldGrid } from '../map/raster';
import { laea } from '../map/laea';
import AirQuality, { type AirQualityData, type AqRow } from '../slides/AirQuality.svelte';
import { loadBasemap, loadWorldBasemap } from '../map/basemap';
import { Grid, type GridFile } from '../map/grid';
import { loadFields } from '../map/raster';
import type { MapLabel } from '../map/MapView.svelte';
import { tempRgb } from '../map/render';
import { temp as fmtTemp } from '../lib/format';
import { DATA_BASE } from '../lib/data';
import type { Lang, Place } from '../lib/types';

/** Await a promise but give up (→ null) after ms, so one slow file can't stall the loop. */
async function soft<T>(p: Promise<T>, ms = 8000): Promise<T | null> {
  let timer: number | undefined;
  try {
    return await Promise.race([p, new Promise<null>((res) => (timer = window.setTimeout(() => res(null), ms)))]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Observation stations for a place: FMI in Finland, plus the neighbouring services
 *  (SMHI, DMI, Estonia, Iceland, MET Norway when enabled) elsewhere and near borders. */
async function stationsFor(place: Pick<Place, 'country'>): Promise<Station[] | null> {
  const [fi, nordic] = await Promise.all([soft(api.obs()), place.country === 'FI' ? null : soft(api.nordicObs(), 5000)]);
  if (!fi && !nordic) return null;
  return [...(fi?.stations ?? []), ...(nordic?.stations ?? [])];
}

const current: SlideDef<CurrentData> = {
  id: 'current',
  title: 'slide.current',
  scope: 'place',
  component: Current,
  async prepare({ place, now, lang }) {
    const [obs, av, fc] = await Promise.all([stationsFor(place), soft(api.aviation()), soft(api.forecast(place.id))]);
    const step = fc ? stepAt(fc.hourly, now) : null;
    const cur = currentFor(place, obs, av ? Object.values(av.metar) : null) ?? (step && fc ? currentFromStep(step, fc.source === 'fmi' ? 'FMI' : 'MET Norway') : null);
    if (!cur && !step) return null;
    const [radar, cam] = await Promise.all([soft(localRadar(place, lang, now), 6000), soft(randomCam(place, now), 5000)]);
    return { cur, sym: cur?.sym ?? step?.sym ?? null, night: isNight(now, place.lat, place.lon), fcT: step?.t ?? null, radar, cam };
  },
};

/** A random recent road weather camera image near the place (Finland only), preloaded. */
async function randomCam(place: Place, now: Date): Promise<CurrentData['cam']> {
  if (place.country !== 'FI') return null;
  const f = await soft(api.cams(), 4000);
  const fresh = (f?.places[place.id] ?? []).filter((c) => now.getTime() - Date.parse(c.time) < 2 * 3600_000);
  if (!fresh.length) return null;
  const c = fresh[Math.floor(Math.random() * fresh.length)];
  const url = `${DATA_BASE}cams/fi/${c.file}?v=${encodeURIComponent(c.time)}`;
  await preload(url);
  return { url, name: c.name, road: c.road, time: c.time };
}

/** ~250 km radar window around a Finnish place, or null (outside radar coverage / stale). */
async function localRadar(place: Place, lang: Lang, now: Date): Promise<LocalRadar | null> {
  if (place.country !== 'FI') return null;
  const [base, index, pf, ltg, nc] = await Promise.all([
    loadBasemap('fi'),
    soft(api.radar()),
    soft(api.places()),
    soft(api.lightning(), 4000),
    isCustom(place.id) ? null : soft(api.nowcast(place.id), 4000),
  ]);
  if (!index?.frames.length) return null;
  if (now.getTime() - Date.parse(index.frames[index.frames.length - 1].time) > 30 * 60_000) return null;
  // curated places have baked 500 m windows; others crop the 2 km national frames
  const local = index.local?.[place.id];
  let view: Extent;
  let extent: Extent = index.extent;
  let frames = index.frames;
  let urls: string[];
  if (local?.frames.length) {
    view = local.view;
    extent = local.view;
    const have = new Set(local.frames);
    frames = index.frames.filter((f) => have.has(f.file));
    urls = frames.map((f) => `${DATA_BASE}radar/local/${place.id}/${f.file}`);
  } else {
    const [e, n] = forward(place.lat, place.lon);
    const half = 125_000;
    const [x0, y0, x1, y1] = index.extent;
    const cx = Math.min(x1 - half, Math.max(x0 + half, e));
    const cy = Math.min(y1 - half, Math.max(y0 + half, n));
    view = [cx - half, cy - half, cx + half, cy + half];
    urls = frames.map((f) => `${DATA_BASE}radar/fi/${f.file}`);
  }
  const inView = (p: Place) => {
    const [pe, pn] = forward(p.lat, p.lon);
    return pe > view[0] + 15_000 && pe < view[2] - 15_000 && pn > view[1] + 10_000 && pn < view[3] - 10_000;
  };
  const labels: MapLabel[] = (pf?.places ?? [place])
    .filter((p) => p.id === place.id || inView(p))
    .map((p) => ({ lat: p.lat, lon: p.lon, text: p.name[lang], side: p.lon < place.lon - 0.5 ? 'left' : 'right' }));
  await soft(Promise.all(urls.map(preload)), 6000);
  const nowcast = nc?.coverage === 'ok' ? upcoming(nc, now) : null;
  return {
    base,
    extent,
    view,
    urls,
    times: frames.map((f) => f.time),
    labels,
    strikes: ltg?.strikes ?? [],
    nowcast: nowcast?.length ? nowcast : null,
  };
}

const next36: SlideDef<PeriodSummary[]> = {
  id: 'next36',
  title: 'slide.next36',
  scope: 'place',
  component: Next36,
  async prepare({ place, now, lang }) {
    const fc = await soft(api.forecast(place.id));
    if (!fc) return null;
    const out = next36Periods(now, fc.tz).map((p) => summarize(fc.hourly, p, lang));
    return out.every(Boolean) ? (out as PeriodSummary[]) : null;
  },
};

const chart: SlideDef<{ steps: import('../lib/types').Step[]; tz: string }> = {
  id: 'chart',
  title: 'slide.chart',
  scope: 'place',
  component: Chart,
  async prepare({ place, now }) {
    const fc = await soft(api.forecast(place.id));
    if (!fc) return null;
    const from = now.getTime() - 3600_000;
    const steps = fc.hourly.filter((s) => s.h === 1 && Date.parse(s.time) >= from).slice(0, 25);
    return steps.length >= 12 ? { steps, tz: fc.tz } : null;
  },
};

const extended: SlideDef<{ days: Day[]; tz: string }> = {
  id: 'extended',
  title: 'slide.extended',
  scope: 'place',
  component: Extended,
  async prepare({ place }) {
    const fc = await soft(api.forecast(place.id));
    if (!fc) return null;
    const days = fc.daily.filter((d) => !d.partial).slice(0, 5);
    return days.length >= 3 ? { days, tz: fc.tz } : null;
  },
};

const REGIONAL_IDS = ['helsinki', 'turku', 'tampere', 'lahti', 'lappeenranta', 'pori', 'jyvaskyla', 'vaasa', 'kuopio', 'joensuu', 'kajaani', 'oulu', 'kuusamo', 'rovaniemi', 'sodankyla', 'ivalo'];

const regional: SlideDef<RegionalRow[]> = {
  id: 'regional',
  title: 'slide.regional',
  scope: 'global',
  component: Regional,
  async prepare({ lang, now }) {
    const [pf, obs] = await Promise.all([soft(api.places()), soft(api.obs())]);
    if (!pf || !obs) return null;
    const ps = REGIONAL_IDS.map((id) => pf.places.find((p) => p.id === id)).filter((p) => !!p);
    // forecasts provide icons where the station reports no present weather / clouds
    const fcs = await Promise.all(ps.map((p) => soft(api.forecast(p.id), 4000)));
    return ps.map((p, i) => {
      // missing wind / present weather etc. come from the nearest station that reports them (as on Current)
      const near = nearestStation(obs.stations, p.lat, p.lon, 30);
      const st = near ? fillFromNeighbours(near, obs.stations, p.lat, p.lon) : null;
      const fcSym = fcs[i] ? stepAt(fcs[i]!.hourly, now)?.sym ?? null : null;
      return {
        id: p.id,
        name: p.name[lang],
        t: st?.t ?? null,
        sym: (st ? obsSymbol(st.wawa, st.n) : null) ?? fcSym,
        night: isNight(now, p.lat, p.lon),
        ws: st?.ws ?? null,
        wd: st?.wd ?? null,
      };
    });
  },
};

// Warnings are national: one slide per loop. Warnings covering any configured place come
// first, tagged with those places; the rest of Finland follows.
const warnings: SlideDef<WarningsData> = {
  id: 'warnings',
  title: 'slide.warnings',
  scope: 'global',
  component: Warnings,
  async prepare({ places, lang, now }) {
    const w = await soft(api.warnings());
    if (!w) return null;
    const active = w.warnings.filter((x) => !x.expires || Date.parse(x.expires) > now.getTime());
    if (!active.length) return null;
    const here: WarningsData['here'] = [];
    const elsewhere: WarningsData['elsewhere'] = [];
    for (const x of active) {
      const hit = places.filter((p) => x.areas.some((a) => a.polygons.some((poly) => pointInPolygon(p.lat, p.lon, poly))));
      if (hit.length) here.push({ warning: x, places: hit.map((p) => p.name[lang]) });
      else elsewhere.push(x);
    }
    return { here, elsewhere };
  },
};

// Aurora summary: once per loop, a row per selected city (config.auroraPlaces, else own places).
const aurora: SlideDef<AuroraData> = {
  id: 'aurora',
  title: 'slide.aurora',
  scope: 'global',
  component: Aurora,
  async prepare({ config, places, lang, now }) {
    const [a, pf] = await Promise.all([soft(api.aurora()), soft(api.places())]);
    if (!a || !a.kp || !pf) return null;
    // north to south reads naturally for aurora
    const chosen = [...pickPlaces(config.auroraPlaces, places, [...pf.places, ...config.custom])].sort((x, y) => y.lat - x.lat);
    if (!chosen.length) return null;
    const fcs = await Promise.all(chosen.map((p) => soft(api.forecast(p.id), 4000)));
    const rows = chosen.map((p, i) => ({ id: p.id, name: p.name[lang], out: outlook(a, p.lat, p.lon, fcs[i]?.hourly ?? null, now) }));
    return { file: a, rows, kpNow: rows[0].out.kpNow };
  },
};

const aviation: SlideDef<Metar[]> = {
  id: 'aviation',
  title: 'slide.aviation',
  scope: 'global',
  component: Aviation,
  async prepare({ config }) {
    const av = await soft(api.aviation());
    if (!av) return null;
    const ms = config.airports.map((id) => av.metar[id]).filter((m): m is Metar => !!m);
    return ms.length ? ms : null;
  },
};

const taf: SlideDef<Taf[]> = {
  id: 'taf',
  title: 'slide.taf',
  scope: 'global',
  component: Taf_,
  async prepare({ config }) {
    const av = await soft(api.aviation());
    if (!av) return null;
    const ts = config.airports.map((id) => av.taf[id]).filter((m): m is Taf => !!m);
    return ts.length ? ts : null;
  },
};

/** Selected cities for a summary slide: explicit list, else the configured places. */
function pickPlaces(ids: string[], places: Place[], all: Place[], max = 7): Place[] {
  const chosen = ids.length ? ids.map((id) => all.find((p) => p.id === id)).filter((p): p is Place => !!p) : places;
  return chosen.slice(0, max);
}

/** Next time (after `from`) the moon phase crosses `target` (0 = new, 0.5 = full). */
function nextPhase(from: Date, target: 0 | 0.5): Date {
  let prev = getMoonIllumination(from).phase;
  for (let h = 1; h <= 31 * 24; h++) {
    const d = new Date(from.getTime() + h * 3600_000);
    const ph = getMoonIllumination(d).phase;
    if (target === 0.5 ? prev < 0.5 && ph >= 0.5 : ph < prev) return d;
    prev = ph;
  }
  return from;
}

// Almanac, once per loop: moon + sun table for config.almanacPlaces (else own places).
const validDate = (d: Date | undefined | null): d is Date => !!d && !Number.isNaN(d.getTime());

/** Minutes from sunrise to sunset, or null when the sun doesn't rise or doesn't set that day. */
function dayLength(t: { sunrise?: Date | null; sunset?: Date | null }): number | null {
  return validDate(t.sunrise) && validDate(t.sunset) ? (t.sunset.getTime() - t.sunrise.getTime()) / 60000 : null;
}

const almanac: SlideDef<AlmanacData> = {
  id: 'almanac',
  title: 'slide.almanac',
  scope: 'global',
  component: Almanac,
  async prepare({ config, places, lang, now }) {
    const pf = await soft(api.places());
    const chosen = pickPlaces(config.almanacPlaces, places, [...(pf?.places ?? places), ...config.custom]);
    if (!chosen.length) return null;
    const rows = chosen.map((p) => {
      const tz = placeTz(p);
      // local calendar day; noon UTC of that date is within the day everywhere in Europe
      const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
      const noon = new Date(`${ymd}T12:00:00Z`);
      const st = getTimes(noon, p.lat, p.lon);
      const sy = getTimes(new Date(noon.getTime() - 86400_000), p.lat, p.lon);
      const today = dayLength(st);
      const prev = dayLength(sy);
      const polar: AlmanacData['rows'][number]['polar'] = today == null ? (isNight(noon, p.lat, p.lon) ? 'night' : 'day') : null;
      // first day the sun rises again (polar night) or sets again (midnight sun)
      let polarEnds: Date | null = null;
      for (let d = 1; polar && d <= 90; d++) {
        const t = getTimes(new Date(noon.getTime() + d * 86400_000), p.lat, p.lon);
        if (dayLength(t) != null) {
          polarEnds = polar === 'night' ? t.sunrise : t.sunset;
          break;
        }
      }
      return {
        id: p.id,
        name: p.name[lang],
        tz,
        sunrise: polar ? null : st.sunrise,
        sunset: polar ? null : st.sunset,
        dayMin: today ?? (polar === 'day' ? 1440 : 0),
        // no comparison on the first day after a polar period
        changeMin: today != null && prev != null ? today - prev : null,
        polar,
        polarEnds,
      };
    });
    // north to south
    rows.sort((a, b) => chosen.find((p) => p.id === b.id)!.lat - chosen.find((p) => p.id === a.id)!.lat);
    const mi = getMoonIllumination(now);
    const first = chosen[0];
    const ftz = placeTz(first);
    const fymd = new Intl.DateTimeFormat('en-CA', { timeZone: ftz }).format(now);
    const mt = getMoonTimes(new Date(`${fymd}T12:00:00Z`), first.lat, first.lon);
    return {
      rows,
      moonPhase: mi.phase,
      moonFraction: mi.fraction,
      nextFull: nextPhase(now, 0.5),
      nextNew: nextPhase(now, 0),
      moonPlace: {
        name: first.name[lang],
        tz: ftz,
        rise: validDate(mt.rise) ? mt.rise : null,
        set: validDate(mt.set) ? mt.set : null,
        always: mt.alwaysUp ? 'up' : mt.alwaysDown ? 'down' : null,
      },
    };
  },
};

/** Space station passes for the first configured Finnish place (latitude matters a lot:
 *  the ISS hardly rises above 10° north of Oulu), else for central Finland. */
async function satPasses(places: Place[], lang: Lang, now: Date): Promise<SkyData['sats']> {
  const f = await soft(api.passes(), 4000);
  if (!f) return null;
  const p = places.find((x) => x.country === 'FI' && f.sites[x.id]);
  const list = f.sites[p?.id ?? 'central'] ?? [];
  const t = now.getTime();
  const upcoming = list.filter((x) => Date.parse(x.end) >= t);
  const tonight = upcoming.filter((x) => Date.parse(x.start) <= t + 20 * 3600_000);
  return {
    place: p ? p.name[lang] : lang === 'fi' ? 'Keski-Suomi' : 'central Finland',
    tonight,
    next: tonight.length ? null : (upcoming[0] ?? null),
  };
}

const sky: SlideDef<SkyData> = {
  id: 'sky',
  title: 'slide.sky',
  scope: 'global',
  component: Sky,
  async prepare({ lang, now, places }) {
    const win = tonight(now);
    const objects = visibleTonight(win);
    const sats = await satPasses(places, lang, now);
    const all: (SkyStar & { en: string })[] = STARS.map((st) => {
      const h = horizontal(starEq(st), win.at);
      return { name: lang === 'fi' ? st[0] : st[1], en: st[1], alt: h.alt, az: h.az, mag: st[4] };
    });
    // in a light (summer) night only the brightest stars show through the twilight
    const stars = all.filter((st) => st.alt > 0 && (win.dark || st.mag < 1));
    const byEn = new Map(all.map((st) => [st.en, st]));
    const lines = LINES.map((c) => ({
      name: c[lang],
      segs: c.path
        .flatMap((path) => path.slice(1).map((b, i) => [byEn.get(path[i])!, byEn.get(b)!] as [SkyStar, SkyStar]))
        .filter(([a, b]) => a && b && a.alt > 0 && b.alt > 0),
    })).filter((c) => c.segs.length && win.dark);
    const mi = getMoonIllumination(win.at);
    return {
      at: win.at,
      dark: win.dark,
      minSun: win.minSun,
      objects,
      stars,
      lines,
      moonPhase: mi.phase,
      moonFraction: mi.fraction,
      showers: activeShowers(win.at).map((x) => ({ name: x[lang], peak: x.peak, atPeak: x.atPeak })),
      sats,
    };
  },
};

const credits: SlideDef<{ tracks: import('./audio').Track[] }> = {
  id: 'credits',
  title: 'slide.credits',
  scope: 'global',
  component: Credits,
  async prepare({ config }) {
    return { tracks: (await soft(loadPlaylist(config.music.playlists), 3000)) ?? [] };
  },
};

// ------------------------------------------------------------------ map slides

// city labels: [place id, label side]
const FI_LABELS: [string, 'left' | 'right'][] = [
  ['helsinki', 'right'], ['turku', 'left'], ['tampere', 'right'], ['vaasa', 'left'], ['jyvaskyla', 'right'],
  ['kuopio', 'right'], ['joensuu', 'right'], ['oulu', 'left'], ['kajaani', 'right'], ['rovaniemi', 'right'],
  ['ivalo', 'right'], ['stockholm', 'left'], ['tallinn', 'right'],
];
const NORDIC_LABELS: [string, 'left' | 'right'][] = [
  ['tromso', 'left'], ['kiruna', 'left'], ['ivalo', 'right'], ['rovaniemi', 'right'], ['oulu', 'right'],
  ['trondheim', 'left'], ['helsinki', 'right'], ['stockholm', 'left'], ['oslo', 'left'],
];

async function labelsFor(ids: [string, 'left' | 'right'][], lang: Lang): Promise<MapLabel[]> {
  const pf = await soft(api.places());
  if (!pf) return [];
  const out: MapLabel[] = [];
  for (const [id, side] of ids) {
    const p = pf.places.find((x) => x.id === id);
    if (p) out.push({ lat: p.lat, lon: p.lon, text: p.name[lang], side });
  }
  return out;
}

let gridCache: { updated: string; grid: Grid } | null = null;
async function loadGrid(): Promise<Grid | null> {
  const f = await soft<GridFile>(api.grid());
  if (!f) return null;
  if (gridCache?.updated !== f.updated) gridCache = { updated: f.updated, grid: Grid.fromFile(f) };
  return gridCache.grid;
}

/** 5 km HARMONIE rasters for cloud/precip/temperature maps; falls back to the 50 km grid. */
async function loadFineGrid(now: Date): Promise<Grid | null> {
  const idx = await soft(api.fields());
  if (idx && now.getTime() - Date.parse(idx.updated) < 8 * 3600_000) {
    const g = await soft(loadFields(idx, now.getTime()), 12000);
    if (g) return g;
  }
  return loadGrid();
}

function preload(url: string): Promise<void> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res();
    img.onerror = () => rej(new Error(url));
    img.src = url;
  });
}

const radarMap: SlideDef<RadarData> = {
  id: 'radar',
  title: 'slide.radar',
  scope: 'global',
  component: RadarMap,
  async prepare({ lang, now }) {
    const [base, index, labels, ltg] = await Promise.all([
      loadBasemap('fi'),
      soft(api.radar()),
      labelsFor(FI_LABELS, lang),
      soft(api.lightning(), 4000),
    ]);
    if (!index?.frames.length) return null;
    // frames older than 30 min mean the baker is stuck: don't show a stale loop
    if (now.getTime() - Date.parse(index.frames[index.frames.length - 1].time) > 30 * 60_000) return null;
    const urls = index.frames.map((f) => `${DATA_BASE}radar/fi/${f.file}`);
    await soft(Promise.all(urls.map(preload)), 10000);
    return { base, index, urls, labels, strikes: ltg?.strikes ?? [] };
  },
};

const windMap: SlideDef<WindData> = {
  id: 'windmap',
  title: 'slide.windmap',
  scope: 'global',
  component: WindMap,
  async prepare({ lang }) {
    const [base, grid, labels, obs] = await Promise.all([loadBasemap('fi'), loadGrid(), labelsFor(FI_LABELS, lang), soft(api.obs())]);
    if (!grid) return null;
    const strongest = (obs?.stations ?? [])
      .filter((s) => s.ws != null && Date.now() - Date.parse(s.time) < 90 * 60_000)
      .sort((a, b) => (b.ws ?? 0) - (a.ws ?? 0))
      .slice(0, 5)
      .map((s) => ({ name: s.name ?? '', ws: s.ws!, wg: s.wg }));
    return { base, grid, labels, strongest };
  },
};

const cloudMap: SlideDef<CloudData> = {
  id: 'cloudmap',
  title: 'slide.cloudmap',
  scope: 'global',
  component: CloudMap,
  async prepare({ lang, now }) {
    const [base, grid, labels] = await Promise.all([loadBasemap('fi'), loadFineGrid(now), labelsFor(FI_LABELS, lang)]);
    return grid && grid.times.length > 6 ? { base, grid, labels } : null;
  },
};

// spaced so the badges don't overlap at map scale
const TEMP_CITIES = ['helsinki', 'turku', 'maarianhamina', 'tampere', 'vaasa', 'lappeenranta', 'kuopio', 'kajaani', 'oulu', 'kuusamo', 'rovaniemi', 'ivalo', 'enontekio'];

const tempMap: SlideDef<TempMapData> = {
  id: 'tempmap',
  title: 'slide.tempmap',
  scope: 'global',
  component: TempMap,
  async prepare({ lang }) {
    const [base, grid, pf, obs] = await Promise.all([loadBasemap('fi'), loadFineGrid(new Date()), soft(api.places()), soft(api.obs())]);
    if (!pf || !obs) return null;
    const fresh = obs.stations.filter((s) => s.t != null && Date.now() - Date.parse(s.time) < 90 * 60_000);
    if (!fresh.length) return null;
    const labels: MapLabel[] = [];
    for (const id of TEMP_CITIES) {
      const p = pf.places.find((x) => x.id === id) as Place | undefined;
      if (!p) continue;
      const st = nearestStation(fresh, p.lat, p.lon, 30);
      if (!st || st.t == null) continue;
      const [r, g, b] = tempRgb(st.t);
      labels.push({ lat: p.lat, lon: p.lon, text: p.name[lang], badge: fmtTemp(st.t), badgeColor: `rgb(${r},${g},${b})` });
    }
    const byT = [...fresh].sort((a, b) => a.t! - b.t!);
    const nm = (s: (typeof fresh)[number]) => s.name ?? '';
    return {
      base,
      grid,
      labels,
      coldest: { name: nm(byT[0]), t: byT[0].t! },
      warmest: { name: nm(byT[byT.length - 1]), t: byT[byT.length - 1].t! },
      obsTime: fresh.map((s) => s.time).sort().pop()!,
    };
  },
};

const auroraMap: SlideDef<AuroraMapData> = {
  id: 'auroramap',
  title: 'slide.auroramap',
  scope: 'global',
  component: AuroraMap,
  async prepare({ lang, place, now }) {
    const [base, a, labels] = await Promise.all([loadBasemap('nordic'), soft(api.aurora()), labelsFor(NORDIC_LABELS, lang)]);
    if (!a?.ovation) return null;
    const o = outlook(a, place.lat, place.lon, null, now);
    return { base, ovation: a.ovation, labels, kpNow: o.kpNow, placeProb: o.ovation, mags: a.mag ?? [] };
  },
};

// cities on the polar aurora maps (Finnish/English names)
const POLAR_LABELS: { n: [string, string, number, number, 'left' | 'right'][]; s: [string, string, number, number, 'left' | 'right'][] } = {
  n: [
    ['Helsinki', 'Helsinki', 60.17, 24.94, 'right'],
    ['Reykjavík', 'Reykjavík', 64.15, -21.94, 'left'],
    ['Fairbanks', 'Fairbanks', 64.84, -147.72, 'right'],
    ['Yellowknife', 'Yellowknife', 62.45, -114.37, 'left'],
    ['Edinburgh', 'Edinburgh', 55.95, -3.19, 'left'],
    ['Toronto', 'Toronto', 43.65, -79.38, 'right'],
    ['Novosibirsk', 'Novosibirsk', 55.03, 82.92, 'left'],
  ],
  s: [
    ['Hobart', 'Hobart', -42.88, 147.33, 'left'],
    ['Invercargill', 'Invercargill', -46.41, 168.35, 'left'],
    ['Ushuaia', 'Ushuaia', -54.8, -68.3, 'right'],
    ['Stanley', 'Stanley', -51.7, -57.85, 'right'],
  ],
};

async function loadOvationImage(file: string, stamp: string): Promise<Uint8Array> {
  const img = new Image();
  img.src = `${DATA_BASE}${file}?v=${encodeURIComponent(stamp)}`;
  await img.decode();
  const cv = document.createElement('canvas');
  cv.width = img.width;
  cv.height = img.height;
  const c2d = cv.getContext('2d', { willReadFrequently: true })!;
  c2d.drawImage(img, 0, 0);
  const rgba = c2d.getImageData(0, 0, img.width, img.height).data;
  const out = new Uint8Array(img.width * img.height);
  for (let k = 0; k < out.length; k++) out[k] = rgba[k * 4];
  return out;
}

const auroraGlobe: SlideDef<AuroraGlobeData> = {
  id: 'auroraglobe',
  title: 'slide.auroraglobe',
  scope: 'global',
  component: AuroraGlobe,
  async prepare({ lang, place, now }) {
    const [north, south, a] = await Promise.all([loadWorldBasemap('pole-n'), loadWorldBasemap('pole-s'), soft(api.aurora())]);
    const g = a?.ovationGlobal;
    if (!north || !south || !a || !g) return null;
    if (now.getTime() - Date.parse(g.observed) > 3 * 3600_000) return null;
    const ov = await soft(loadOvationImage(g.file, g.forecast), 6000);
    if (!ov) return null;
    const o = outlook(a, place.lat, place.lon, null, now);
    const t = now.getTime();
    const next = (a.kp?.forecast ?? []).filter((r) => Date.parse(r.time) >= t - 3 * 3600_000 && Date.parse(r.time) <= t + 24 * 3600_000);
    const lab = (xs: [string, string, number, number, 'left' | 'right'][]): MapLabel[] => xs.map(([fi, en, lat, lon, side]) => ({ lat, lon, side, text: lang === 'fi' ? fi : en }));
    return {
      north,
      south,
      ov,
      labels: { n: lab(POLAR_LABELS.n), s: lab(POLAR_LABELS.s) },
      kpNow: o.kpNow,
      kpMax24: next.length ? Math.max(...next.map((r) => r.kp)) : null,
      forecast: g.forecast,
    };
  },
};

const roadMap: SlideDef<RoadData> = {
  id: 'roadmap',
  title: 'slide.roadmap',
  scope: 'global',
  component: RoadMap,
  async prepare({ lang, places }) {
    const [base, roads, labels] = await Promise.all([loadBasemap('fi'), soft(api.roads()), labelsFor(FI_LABELS, lang)]);
    if (!roads?.sections.length) return null;
    // road surface at the nearest road weather station to each configured place (within 25 km)
    const cities = places
      .filter((p) => p.country === 'FI')
      .slice(0, 6)
      .map((p) => {
        let best: (typeof roads.stations)[number] | null = null;
        let bd = 25;
        for (const s of roads.stations) {
          if (s.rt == null) continue;
          const d = haversineKm(p.lat, p.lon, s.lat, s.lon);
          if (d < bd) [best, bd] = [s, d];
        }
        return best ? { name: p.name[lang], rt: best.rt ?? null, cond: best.cond ?? null } : null;
      })
      .filter((x): x is { name: string; rt: number | null; cond: number | null } => !!x);
    return { base, roads, labels, cities };
  },
};

// FMI stations on islands, lighthouses and harbours: representative of wind at sea
const MARINE_WIND = [
  'Kemi I majakka',
  'Hailuoto Marjaniemi',
  'Raahe Lapaluoto',
  'Kokkola Tankar',
  'Pietarsaari Kallan',
  'Mustasaari Valassaaret',
  'Kaskinen Sälgrund',
  'Kristiinankaupunki Majakka',
  'Pori Tahkoluoto',
  'Rauma Kylmäpihlaja',
  'Kustavi Isokari',
  'Parainen Utö',
  'Kökar Bogskär',
  'Hammarland Märket',
  'Lemland Nyhamn',
  'Kumlinge',
  'Hanko Russarö',
  'Kemiönsaari Vänö',
  'Kirkkonummi Mäkiluoto',
  'Helsinki Harmaja',
  'Porvoo Kalbådagrund',
  'Loviisa Orrengrund',
  'Kotka Haapasaari',
];
const SEA_LABELS = ['kemi', 'oulu', 'vaasa', 'pori', 'turku', 'maarianhamina', 'helsinki', 'kotka'];

const sea: SlideDef<SeaData> = {
  id: 'sea',
  title: 'slide.sea',
  scope: 'global',
  component: Sea,
  async prepare({ lang, now }) {
    const [base, s, obs, pf] = await Promise.all([loadBasemap('fi'), soft(api.sea()), soft(api.obs()), soft(api.places())]);
    if (!s || (!s.waves.length && !s.levels.length)) return null;
    if (now.getTime() - Date.parse(s.updated) > 6 * 3600_000) return null;
    const winds: SeaWind[] = (obs?.stations ?? [])
      .filter((st) => st.ws != null && st.name && MARINE_WIND.some((m) => st.name!.startsWith(m)))
      .filter((st) => now.getTime() - Date.parse(st.time) < 90 * 60_000)
      .map((st) => ({ name: st.name!, lat: st.lat, lon: st.lon, ws: st.ws!, wg: st.wg, wd: st.wd }));
    const labels: MapLabel[] = SEA_LABELS.map((id) => pf?.places.find((p) => p.id === id))
      .filter((p): p is Place => !!p)
      .map((p) => ({ lat: p.lat, lon: p.lon, text: p.name[lang] }));
    return { base, sea: s, winds, labels };
  },
};

const AQ_DEFAULT = ['helsinki', 'espoo', 'tampere', 'turku', 'lahti', 'jyvaskyla', 'kuopio', 'oulu'];

const airQuality: SlideDef<AirQualityData> = {
  id: 'airquality',
  title: 'slide.airquality',
  scope: 'global',
  component: AirQuality,
  async prepare({ lang, places, now }) {
    const [base, aq, pf] = await Promise.all([loadBasemap('fi'), soft(api.airquality()), soft(api.places())]);
    if (!aq?.stations.length || !pf) return null;
    if (now.getTime() - Date.parse(aq.updated) > 6 * 3600_000) return null;
    const fi = places.filter((p) => p.country === 'FI');
    const extra = AQ_DEFAULT.map((id) => pf.places.find((p) => p.id === id)).filter((p): p is Place => !!p && !fi.some((q) => q.id === p.id));
    const rows: AqRow[] = [];
    for (const p of [...fi, ...extra]) {
      const near = aq.stations.filter((s) => haversineKm(p.lat, p.lon, s.lat, s.lon) < 15);
      if (!near.length) continue;
      const worst = near.reduce((a, b) => (b.aqi > a.aqi ? b : a));
      rows.push({ id: p.id, name: p.name[lang], station: worst, count: near.length });
      if (rows.length >= 9) break;
    }
    if (!rows.length) return null;
    return { base, stations: aq.stations, rows, labels: [] };
  },
};

/** A world region map: ECMWF fields for the next 48 h. Skipped while the data is stale. */
function regionSlide(r: WorldRegion): SlideDef<WorldMapData> {
  return {
    id: `map-${r.id}`,
    title: `slide.map-${r.id}` as Key,
    scope: 'global',
    component: WorldMap,
    async prepare({ lang, now }) {
      const [base, idx] = await Promise.all([loadWorldBasemap(r.id), soft(api.world())]);
      const view = idx?.views[r.id];
      if (!base || !view || !idx) return null;
      if (now.getTime() - Date.parse(view.times[view.times.length - 1]) > 0) return null; // forecast ran out
      const grid = await soft(loadWorldGrid(r.id, view, idx.origin, now.getTime()), 15000);
      if (!grid) return null;
      return { base, grid, cities: regionCities(r).map((c) => ({ name: c[lang], lat: c.lat, lon: c.lon })), name: r[lang] };
    },
  };
}

const capital: SlideDef<CapitalData> = {
  id: 'capital',
  title: 'slide.capital',
  scope: 'capital',
  component: Capital,
  async prepare({ lang, place, now }) {
    const c = capitalById(place.id.replace(/^cap-/, ''));
    if (!c) return null;
    const vid = `cap-${c.id}`;
    const [base, idx, caps] = await Promise.all([loadWorldBasemap(vid), soft(api.world()), soft(api.capitals())]);
    if (!base) return null;
    const row = caps?.capitals[c.id];
    const view = idx?.views[vid];
    const grid = view && idx && now.getTime() < Date.parse(view.times[view.times.length - 1]) ? await soft(loadWorldGrid(vid, view, idx.origin, now.getTime()), 10000) : null;
    if (!row && !grid) return null;
    // other named places inside the 900 km window
    const p = laea({ lat0: c.lat, lon0: c.lon });
    const [x0, y0, x1, y1] = base.extent;
    const cities = allWorldCities()
      .filter((w) => {
        const [x, y] = p.forward(w.lat, w.lon);
        return x > x0 + 40_000 && x < x1 - 40_000 && y > y0 + 30_000 && y < y1 - 30_000;
      })
      .map((w) => ({ name: w[lang], lat: w.lat, lon: w.lon }));
    return {
      name: c[lang],
      tz: c.tz,
      base,
      grid,
      cities,
      metar: row?.metar ?? null,
      now: row?.now ?? null,
      daily: row?.daily ?? [],
      night: isNight(now, c.lat, c.lon),
    };
  },
};

export const SLIDES: Record<string, SlideDef<any>> = Object.fromEntries(
  [current, next36, chart, extended, warnings, radarMap, cloudMap, tempMap, regional, windMap, roadMap, sea, airQuality, aurora, auroraMap, auroraGlobe, aviation, taf, almanac, sky, ...REGIONS.map(regionSlide), capital, credits].map(
    (s) => [s.id, s],
  ),
);

