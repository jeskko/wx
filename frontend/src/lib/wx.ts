// Weather helpers: geography, nearest station, feels-like, symbols from observations.

import { getPosition } from 'suncalc';
import type { Metar, Place, Station, Step, Sym } from './types';

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = 6371;
  const toRad = Math.PI / 180;
  const dp = (lat2 - lat1) * toRad;
  const dl = (lon2 - lon1) * toRad;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export function pointInPolygon(lat: number, lon: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Nearest station with a fresh temperature, within maxKm. */
export function nearestStation(stations: Station[], lat: number, lon: number, maxKm = 40, maxAgeMin = 90): (Station & { km: number }) | null {
  const now = Date.now();
  let best: (Station & { km: number }) | null = null;
  for (const s of stations) {
    if (s.t == null) continue;
    if (now - Date.parse(s.time) > maxAgeMin * 60_000) continue;
    const km = haversineKm(lat, lon, s.lat, s.lon);
    if (km <= maxKm && (!best || km < best.km)) best = { ...s, km };
  }
  return best;
}

/** Current conditions in a common shape, from an FMI station or a METAR. */
export interface Current {
  source: 'fmi' | 'metar';
  stationName: string;
  km: number;
  time: string;
  t: number | null;
  feels: number | null;
  ws: number | null; // m/s
  wg: number | null;
  wd: number | null;
  rh: number | null;
  td: number | null;
  p: number | null;
  ptend: number | null;
  vis: number | null; // m
  n: number | null; // octas
  snow: number | null; // cm
  r1h: number | null;
  sym: Sym | null;
}

const KT = 0.514444;

export function currentFor(place: Pick<Place, 'lat' | 'lon'>, stations: Station[] | null, metars: Metar[] | null): Current | null {
  let st = stations ? nearestStation(stations, place.lat, place.lon) : null;
  if (st && stations) st = fillFromNeighbours(st, stations, place.lat, place.lon);
  if (st) {
    return {
      source: 'fmi',
      stationName: st.name ?? '',
      km: st.km,
      time: st.time,
      t: st.t,
      feels: feelsLike(st.t, st.ws, st.rh),
      ws: st.ws,
      wg: st.wg,
      wd: st.wd,
      rh: st.rh,
      td: st.td,
      p: st.p,
      ptend: st.ptend,
      vis: st.vis,
      n: st.n,
      snow: st.snow,
      r1h: st.r1h,
      sym: obsSymbol(st.wawa, st.n),
    };
  }
  if (metars) {
    let best: (Metar & { km: number }) | null = null;
    for (const m of metars) {
      if (!m.time || Date.now() - Date.parse(m.time) > 3 * 3600_000) continue;
      const km = haversineKm(place.lat, place.lon, m.lat, m.lon);
      if (km <= 60 && (!best || km < best.km)) best = { ...m, km };
    }
    if (best) {
      const ws = best.wskt == null ? null : Math.round(best.wskt * KT * 10) / 10;
      const rh = best.t != null && best.td != null ? relHumidity(best.t, best.td) : null;
      return {
        source: 'metar',
        stationName: `${best.name} (${best.icao})`,
        km: best.km,
        time: best.time!,
        t: best.t,
        feels: feelsLike(best.t, ws, rh),
        ws,
        wg: best.wgkt == null ? null : Math.round(best.wgkt * KT * 10) / 10,
        wd: best.wd,
        rh,
        td: best.td,
        p: best.qnh,
        ptend: null,
        vis: best.vis,
        n: metarOctas(best.clouds),
        snow: null,
        r1h: null,
        sym: metarSymbol(best),
      };
    }
  }
  return null;
}

const FILLABLE: (keyof Station)[] = ['ws', 'wg', 'wd', 'p', 'ptend', 'vis', 'n', 'wawa', 'rh', 'td', 'snow', 'r1h'];

/** Many stations measure only some quantities: fill the gaps from the nearest other stations
 *  (within maxKm) that do report them. Wind gust is only taken together with wind speed. */
export function fillFromNeighbours<S extends Station>(st: S, stations: Station[], lat: number, lon: number, maxKm = 50): S {
  const missing = FILLABLE.filter((k) => st[k] == null);
  if (!missing.length) return st;
  const now = Date.now();
  const near = stations
    .filter((s) => s !== st && now - Date.parse(s.time) < 90 * 60_000)
    .map((s) => ({ s, km: haversineKm(lat, lon, s.lat, s.lon) }))
    .filter((x) => x.km <= maxKm)
    .sort((a, b) => a.km - b.km);
  const out = { ...st } as Record<string, unknown>;
  for (const k of missing) {
    if (k === 'wg' || k === 'wd') continue; // follow the station chosen for ws
    const hit = near.find(({ s }) => s[k] != null);
    if (!hit) continue;
    out[k] = hit.s[k];
    if (k === 'ws') {
      out.wd = hit.s.wd;
      out.wg = hit.s.wg;
    }
    if (k === 'p' && out.ptend == null) out.ptend = hit.s.ptend;
  }
  return out as S;
}

export function relHumidity(t: number, td: number): number {
  const es = (x: number) => Math.exp((17.625 * x) / (243.04 + x));
  return Math.round((100 * es(td)) / es(t));
}

/** FMI-style "feels like": wind chill when cold & windy, else air temperature (rounded). */
export function feelsLike(t: number | null, ws: number | null, rh: number | null): number | null {
  if (t == null) return null;
  const v = ws ?? 0;
  if (t <= 10 && v > 1.3) {
    const kmh = v * 3.6;
    const wc = 13.12 + 0.6215 * t - 11.37 * kmh ** 0.16 + 0.3965 * t * kmh ** 0.16;
    return Math.round(Math.min(t, wc));
  }
  if (t >= 26 && rh != null) {
    // simple heat index (Steadman/Rothfusz in °C via °F)
    const f = t * 1.8 + 32;
    const hi = -42.379 + 2.04901523 * f + 10.14333127 * rh - 0.22475541 * f * rh - 0.00683783 * f * f - 0.05481717 * rh * rh + 0.00122874 * f * f * rh + 0.00085282 * f * rh * rh - 0.00000199 * f * f * rh * rh;
    return Math.round((hi - 32) / 1.8);
  }
  return Math.round(t);
}

// WMO code table 4680 (automatic station present weather). Codes 20-26 (weather in the
// past hour) and 0-5 are left out on purpose: they say nothing about the sky right now.
const WAWA: Record<number, Sym> = {
  10: 'fog', 30: 'fog', 31: 'fog', 32: 'fog', 33: 'fog', 34: 'fog', 35: 'fog',
  40: 'rain-2', 41: 'rain-1', 42: 'rain-3',
  50: 'rain-1', 51: 'rain-1', 52: 'rain-1', 53: 'rain-2', 54: 'rain-1', 55: 'rain-1', 56: 'rain-2', 57: 'rain-1', 58: 'rain-2',
  60: 'rain-2', 61: 'rain-1', 62: 'rain-2', 63: 'rain-3', 64: 'rain-1', 65: 'rain-2', 66: 'rain-3',
  67: 'sleet-1', 68: 'sleet-2',
  70: 'snow-2', 71: 'snow-1', 72: 'snow-2', 73: 'snow-3', 74: 'sleet-1', 75: 'sleet-2', 76: 'sleet-3', 77: 'snow-1', 78: 'snow-1',
  80: 'showers-2', 81: 'showers-1', 82: 'showers-2', 83: 'showers-3', 84: 'showers-3',
  85: 'snowshowers-1', 86: 'snowshowers-2', 87: 'snowshowers-3', 89: 'showers-3',
  90: 'thunder-1', 91: 'thunder-1', 92: 'thunder-1', 93: 'thunder-2', 94: 'thunder-2', 95: 'thunder-2', 96: 'thunder-2',
};

/** Symbol from WMO 4680 (wawa) present weather + cloud octas. null if unknown. */
export function obsSymbol(wawa: number | null, n: number | null): Sym | null {
  if (wawa != null && WAWA[wawa]) return WAWA[wawa];
  if (n == null) return null;
  if (n <= 1) return 'clear';
  if (n <= 5) return 'partly';
  if (n <= 8) return 'cloudy';
  return null; // 9 = sky obscured
}

function metarOctas(clouds: Metar['clouds']): number | null {
  if (!clouds.length) return 0;
  const map: Record<string, number> = { SKC: 0, CLR: 0, NSC: 0, CAVOK: 0, FEW: 2, SCT: 4, BKN: 6, OVC: 8, OVX: 8 };
  return Math.max(...clouds.map((c) => map[c.cover] ?? 0));
}

function metarSymbol(m: Metar): Sym | null {
  const wx = m.wx ?? '';
  const inten = wx.includes('+') ? 3 : wx.includes('-') ? 1 : 2;
  if (/TS/.test(wx)) return inten === 3 ? 'thunder-2' : 'thunder-1';
  if (/SHSN|SHGS/.test(wx)) return `snowshowers-${inten}`;
  if (/SH/.test(wx)) return `showers-${inten}`;
  if (/RASN|SNRA|FZRA|PL/.test(wx)) return `sleet-${inten}`;
  if (/SN|SG/.test(wx)) return `snow-${inten}`;
  if (/RA|DZ/.test(wx)) return `rain-${inten}`;
  if (/FG|BR/.test(wx)) return 'fog';
  const o = metarOctas(m.clouds);
  return o == null ? null : o <= 1 ? 'clear' : o <= 5 ? 'partly' : 'cloudy';
}

// suncalc 2.x returns altitude/azimuth in degrees (azimuth from north), not radians.

/** True if the sun is below the horizon (-0.833°) at time & place. */
export function isNight(date: Date, lat: number, lon: number): boolean {
  return getPosition(date, lat, lon).altitude < -0.833;
}

export function sunAltitudeDeg(date: Date, lat: number, lon: number): number {
  return getPosition(date, lat, lon).altitude;
}

/** Forecast step closest to (at or before) the given time. */
export function stepAt(hourly: Step[], date: Date): Step | null {
  let best: Step | null = null;
  for (const s of hourly) {
    if (Date.parse(s.time) <= date.getTime()) best = s;
    else break;
  }
  return best ?? hourly[0] ?? null;
}

export function symKind(sym: Sym | null): string {
  return (sym ?? '').split('-')[0];
}

export function symIntensity(sym: Sym | null): number {
  return Number((sym ?? '').split('-')[1] ?? 0) || 0;
}

const TZ_BY_COUNTRY: Record<string, string> = {
  FI: 'Europe/Helsinki',
  SE: 'Europe/Stockholm',
  NO: 'Europe/Oslo',
  DK: 'Europe/Copenhagen',
  IS: 'Atlantic/Reykjavik',
  EE: 'Europe/Tallinn',
  LV: 'Europe/Riga',
};

export function tzFor(country: string): string {
  return TZ_BY_COUNTRY[country] ?? 'Europe/Helsinki';
}
