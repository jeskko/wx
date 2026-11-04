// All slide definitions: what data each needs and when to skip it.

import { getMoonIllumination, getMoonTimes, getTimes } from 'suncalc';
import { api } from '../lib/data';
import { outlook } from '../lib/aurora';
import { next36Periods, summarize, type PeriodSummary } from '../lib/textfc';
import type { Day, Metar, Taf } from '../lib/types';
import { currentFor, isNight, nearestStation, obsSymbol, pointInPolygon, stepAt, tzFor } from '../lib/wx';
import { loadPlaylist } from './audio';
import type { SlideDef } from './types';

import Almanac, { type AlmanacData } from '../slides/Almanac.svelte';
import Aurora, { type AuroraData } from '../slides/Aurora.svelte';
import Aviation from '../slides/Aviation.svelte';
import Chart from '../slides/Chart.svelte';
import Credits from '../slides/Credits.svelte';
import Current, { type CurrentData } from '../slides/Current.svelte';
import Extended from '../slides/Extended.svelte';
import Next36 from '../slides/Next36.svelte';
import Regional, { type RegionalRow } from '../slides/Regional.svelte';
import Taf_ from '../slides/Taf.svelte';
import Warnings, { type WarningsData } from '../slides/Warnings.svelte';
import AuroraMap, { type AuroraMapData } from '../slides/AuroraMap.svelte';
import CloudMap, { type CloudData } from '../slides/CloudMap.svelte';
import RadarMap, { type RadarData } from '../slides/RadarMap.svelte';
import TempMap, { type TempMapData } from '../slides/TempMap.svelte';
import WindMap, { type WindData } from '../slides/WindMap.svelte';
import { loadBasemap } from '../map/basemap';
import { Grid, type GridFile } from '../map/grid';
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

const current: SlideDef<CurrentData> = {
  id: 'current',
  title: 'slide.current',
  scope: 'place',
  component: Current,
  async prepare({ place, now }) {
    const [obs, av, fc] = await Promise.all([soft(api.obs()), soft(api.aviation()), soft(api.forecast(place.id))]);
    const cur = currentFor(place, obs?.stations ?? null, av ? Object.values(av.metar) : null);
    const step = fc ? stepAt(fc.hourly, now) : null;
    if (!cur && !step) return null;
    return { cur, sym: cur?.sym ?? step?.sym ?? null, night: isNight(now, place.lat, place.lon), fcT: step?.t ?? null };
  },
};

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
      const st = nearestStation(obs.stations, p.lat, p.lon, 30);
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
    const chosen = (config.auroraPlaces.length ? config.auroraPlaces : places.map((p) => p.id))
      .map((id) => pf.places.find((p) => p.id === id))
      .filter((p): p is Place => !!p)
      .slice(0, 7)
      // north to south reads naturally for aurora
      .sort((x, y) => y.lat - x.lat);
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

const almanac: SlideDef<AlmanacData> = {
  id: 'almanac',
  title: 'slide.almanac',
  scope: 'place',
  component: Almanac,
  async prepare({ place, now }) {
    const tz = tzFor(place.country);
    // local noon today, so getTimes picks the right calendar day
    const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
    const noon = new Date(`${ymd}T12:00:00Z`);
    const yesterday = new Date(noon.getTime() - 86400_000);
    const st = getTimes(noon, place.lat, place.lon);
    const sy = getTimes(yesterday, place.lat, place.lon);
    const len = (s: typeof st) => (s.sunrise && s.sunset ? (s.sunset.getTime() - s.sunrise.getTime()) / 60000 : null);
    const today = len(st);
    const prev = len(sy);
    let polar: AlmanacData['polar'] = null;
    if (today == null) {
      const alt = isNight(noon, place.lat, place.lon);
      polar = alt ? 'night' : 'day';
    }
    const mi = getMoonIllumination(now);
    const mt = getMoonTimes(noon, place.lat, place.lon);
    return {
      sunrise: st.sunrise,
      sunset: st.sunset,
      dawn: st.dawn,
      dusk: st.dusk,
      dayMin: today ?? (polar === 'day' ? 1440 : 0),
      changeMin: today != null && prev != null ? today - prev : 0,
      polar,
      moonPhase: mi.phase,
      moonFraction: mi.fraction,
      moonrise: mt.rise ?? null,
      moonset: mt.set ?? null,
    };
  },
};

const credits: SlideDef<{ tracks: import('./audio').Track[] }> = {
  id: 'credits',
  title: 'slide.credits',
  scope: 'global',
  component: Credits,
  async prepare() {
    return { tracks: (await soft(loadPlaylist(), 3000)) ?? [] };
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
  if (gridCache?.updated !== f.updated) gridCache = { updated: f.updated, grid: new Grid(f) };
  return gridCache.grid;
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
    const [base, index, labels] = await Promise.all([loadBasemap('fi'), soft(api.radar()), labelsFor(FI_LABELS, lang)]);
    if (!index?.frames.length) return null;
    // frames older than 30 min mean the baker is stuck: don't show a stale loop
    if (now.getTime() - Date.parse(index.frames[index.frames.length - 1].time) > 30 * 60_000) return null;
    const urls = index.frames.map((f) => `${DATA_BASE}radar/fi/${f.file}`);
    await soft(Promise.all(urls.map(preload)), 10000);
    return { base, index, urls, labels };
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
  async prepare({ lang }) {
    const [base, grid, labels] = await Promise.all([loadBasemap('fi'), loadGrid(), labelsFor(FI_LABELS, lang)]);
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
    const [base, grid, pf, obs] = await Promise.all([loadBasemap('fi'), loadGrid(), soft(api.places()), soft(api.obs())]);
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

export const SLIDES: Record<string, SlideDef<any>> = Object.fromEntries(
  [current, next36, chart, extended, warnings, radarMap, cloudMap, tempMap, regional, windMap, aurora, auroraMap, aviation, taf, almanac, credits].map(
    (s) => [s.id, s],
  ),
);

