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

const warnings: SlideDef<WarningsData> = {
  id: 'warnings',
  title: 'slide.warnings',
  scope: 'place',
  component: Warnings,
  async prepare({ place, now }) {
    const w = await soft(api.warnings());
    if (!w) return null;
    const active = w.warnings.filter((x) => !x.expires || Date.parse(x.expires) > now.getTime());
    if (!active.length) return null;
    const hits = (x: (typeof active)[number]) => x.areas.some((a) => a.polygons.some((poly) => pointInPolygon(place.lat, place.lon, poly)));
    return { here: active.filter(hits), elsewhere: active.filter((x) => !hits(x)) };
  },
};

const aurora: SlideDef<AuroraData> = {
  id: 'aurora',
  title: 'slide.aurora',
  scope: 'place',
  component: Aurora,
  async prepare({ place, now }) {
    const [a, fc] = await Promise.all([soft(api.aurora()), soft(api.forecast(place.id))]);
    if (!a || !a.kp) return null;
    return { file: a, out: outlook(a, place.lat, place.lon, fc?.hourly ?? null, now) };
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

export const SLIDES: Record<string, SlideDef<any>> = Object.fromEntries(
  [current, next36, chart, extended, warnings, regional, aurora, aviation, taf, almanac, credits].map((s) => [s.id, s]),
);

