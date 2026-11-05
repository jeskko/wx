// Forecasts for places outside the curated list (added with the place search). These are the
// only data the browser fetches from an upstream directly: MET Norway locationforecast
// (global, CORS-enabled), converted to the same shape the baker writes to fc/<place>.json.
// Ports of backend/wx/sources/metno.py, wx/symbols.py (from_metno) and wx/daily.py.

import type { Day, ForecastFile, Place, Step, Sym } from './types';

const URL = 'https://api.met.no/weatherapi/locationforecast/2.0/compact';
const MAX_AGE = 45 * 60_000;

export function symFromMetno(code: string | undefined | null): Sym | null {
  if (!code) return null;
  const c = code.split('_')[0];
  if (c === 'clearsky') return 'clear';
  if (c === 'fair' || c === 'partlycloudy') return 'partly';
  if (c === 'cloudy') return 'cloudy';
  if (c === 'fog') return 'fog';
  const m = /^(light|heavy)?(rain|sleet|snow)(showers)?(andthunder)?$/.exec(c);
  if (!m) return 'cloudy';
  const [, level, kind, showers, thunder] = m;
  const inten = level === 'light' ? 1 : level === 'heavy' ? 3 : 2;
  if (thunder) return `thunder-${inten < 3 ? 1 : 2}`;
  if (kind === 'rain') return `${showers ? 'showers' : 'rain'}-${inten}`;
  if (kind === 'snow') return `${showers ? 'snowshowers' : 'snow'}-${inten}`;
  return `sleet-${inten}`;
}

interface MetnoStep {
  time: string;
  data: {
    instant: { details: Record<string, number | undefined> };
    next_1_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
    next_6_hours?: { summary?: { symbol_code?: string }; details?: { precipitation_amount?: number } };
  };
}

const int = (v: number | undefined) => (v == null ? null : Math.round(v));

export function parseMetno(doc: { properties: { timeseries: MetnoStep[] } }): Step[] {
  const out: Step[] = [];
  for (const s of doc.properties.timeseries) {
    const d = s.data.instant.details;
    const nxt = s.data.next_1_hours ?? s.data.next_6_hours;
    if (!nxt) continue;
    out.push({
      time: s.time,
      h: s.data.next_1_hours ? 1 : 6,
      t: d.air_temperature ?? null,
      feels: null,
      ws: d.wind_speed ?? null,
      wg: d.wind_speed_of_gust ?? null,
      wd: int(d.wind_from_direction),
      rh: int(d.relative_humidity),
      pr: nxt.details?.precipitation_amount ?? null,
      pop: null,
      cloud: int(d.cloud_area_fraction),
      p: d.air_pressure_at_sea_level ?? null,
      sym: symFromMetno(nxt.summary?.symbol_code),
    });
  }
  return out;
}

const SEVERITY = ['clear', 'partly', 'cloudy', 'fog', 'showers', 'snowshowers', 'rain', 'sleet', 'snow', 'thunder'];
function sev(sym: Sym | null): number {
  if (!sym) return -1;
  const [kind, inten] = sym.split('-');
  return Math.max(0, SEVERITY.indexOf(kind)) * 10 + Number(inten ?? 0);
}

/** Local calendar date (YYYY-MM-DD) and hour of an instant in a time zone. */
function local(iso: string, tz: string): { date: string; hour: number } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)!.value;
  return { date: `${g('year')}-${g('month')}-${g('day')}`, hour: Number(g('hour')) };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Steps into local-calendar days (same rules as backend/wx/daily.py). */
export function daily(steps: Step[], tz: string): Day[] {
  const days = new Map<string, { hour: number; s: Step }[]>();
  for (const s of steps) {
    const l = local(s.time, tz);
    if (!days.has(l.date)) days.set(l.date, []);
    days.get(l.date)!.push({ hour: l.hour, s });
  }
  const out: Day[] = [];
  for (const [date, items] of days) {
    const temps = items.map((x) => x.s.t).filter((v): v is number => v != null);
    if (!temps.length) continue;
    const covered = items.reduce((a, x) => a + (x.s.h ?? 1), 0);
    const pr = items.reduce((a, x) => a + (x.s.pr ?? 0), 0);
    const winds = items.map((x) => x.s.ws).filter((v): v is number => v != null);
    const gusts = items.map((x) => x.s.wg).filter((v): v is number => v != null);
    const daySyms = items.filter((x) => x.hour >= 7 && x.hour <= 20 && x.s.sym).map((x) => x.s.sym!);
    const syms = daySyms.length ? daySyms : items.filter((x) => x.s.sym).map((x) => x.s.sym!);
    let sym: Sym | null = null;
    if (pr >= 0.3) {
      sym = syms.reduce<Sym | null>((a, b) => (sev(b) > sev(a) ? b : a), null);
    } else {
      const dryAll = syms.filter((x) => ['clear', 'partly', 'cloudy', 'fog'].includes(x));
      const dry = dryAll.length ? dryAll : syms;
      const counts = new Map<Sym, number>();
      for (const x of dry) counts.set(x, (counts.get(x) ?? 0) + 1);
      let best = 0;
      for (const [k, n] of counts) if (n > best) [sym, best] = [k, n];
    }
    const windiest = winds.length ? items.reduce((a, b) => ((b.s.ws ?? -1) > (a.s.ws ?? -1) ? b : a)) : null;
    out.push({
      date,
      partial: covered < 18,
      tmin: r1(Math.min(...temps)),
      tmax: r1(Math.max(...temps)),
      pr: r1(pr),
      wsmax: winds.length ? r1(Math.max(...winds)) : null,
      wgmax: gusts.length ? r1(Math.max(...gusts)) : null,
      wd: windiest?.s.wd ?? null,
      pop: null,
      sym,
    });
  }
  return out;
}

export function toForecastFile(place: Place, steps: Step[], tz: string): ForecastFile {
  return { place: place.id, source: 'metno', updated: new Date().toISOString(), tz, hourly: steps, daily: daily(steps, tz) } as ForecastFile;
}

const mem = new Map<string, { at: number; fc: ForecastFile }>();

/** Forecast for a custom place: memory, then localStorage (< 45 min), then MET Norway. */
export async function customForecast(place: Place, tz: string): Promise<ForecastFile> {
  const key = `wx.fc.${place.lat.toFixed(3)},${place.lon.toFixed(3)}`;
  const now = Date.now();
  const m = mem.get(key);
  if (m && now - m.at < MAX_AGE) return m.fc;
  try {
    const s = JSON.parse(localStorage.getItem(key) ?? 'null') as { at: number; fc: ForecastFile } | null;
    if (s && now - s.at < MAX_AGE) {
      mem.set(key, s);
      return s.fc;
    }
  } catch {
    /* storage unavailable */
  }
  const r = await fetch(`${URL}?lat=${place.lat.toFixed(4)}&lon=${place.lon.toFixed(4)}`);
  if (!r.ok) {
    if (m) return m.fc; // keep the last good copy
    throw new Error(`${r.status} metno`);
  }
  const fc = toForecastFile(place, parseMetno(await r.json()), tz);
  const entry = { at: now, fc };
  mem.set(key, entry);
  try {
    localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    /* quota / private mode */
  }
  return fc;
}
