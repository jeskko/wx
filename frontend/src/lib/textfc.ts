// Template-based text forecast ("Pilvistä. Heikkoa vesisadetta. Alin lämpötila −2°. Lounaistuulta 4–7 m/s.")
// FMI publishes no open text forecasts, so we generate them from hourly steps.

import type { Lang, Step, Sym } from './types';
import { capitalize, temp, windPhrase } from './format';
import { symIntensity, symKind } from './wx';
import type { Key } from '../i18n';

export interface Period {
  label: Key;
  start: Date;
  end: Date;
  night: boolean;
}

export interface PeriodSummary extends Period {
  tmin: number;
  tmax: number;
  pr: number;
  wsmin: number;
  wsmax: number;
  wgmax: number | null;
  wd: number | null;
  cloud: number | null;
  sym: Sym | null;
  text: string;
}

/** Local hour (0-23) of a Date in a time zone. */
function localHour(d: Date, tz: string): number {
  return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: tz }).format(d));
}

/** Date at the next given local hour (exclusive of now unless exactly on it). */
function nextLocalHour(from: Date, hour: number, tz: string): Date {
  const d = new Date(from);
  d.setUTCMinutes(0, 0, 0);
  for (let i = 0; i < 48; i++) {
    if (localHour(d, tz) === hour && d.getTime() > from.getTime()) return d;
    d.setUTCHours(d.getUTCHours() + 1);
  }
  return d;
}

/** Three periods covering roughly the next 36 hours (day = 06–18, night = 18–06 local). */
export function next36Periods(now: Date, tz: string): Period[] {
  const h = localHour(now, tz);
  const at6 = nextLocalHour(now, 6, tz);
  const at18 = nextLocalHour(now, 18, tz);
  const plus12 = (d: Date) => new Date(d.getTime() + 12 * 3600_000);
  if (h >= 6 && h < 15) {
    // today (rest) / tonight / tomorrow
    return [
      { label: 'today', start: now, end: at18, night: false },
      { label: 'tonight', start: at18, end: plus12(at18), night: true },
      { label: 'tomorrow', start: plus12(at18), end: plus12(plus12(at18)), night: false },
    ];
  }
  if (h >= 15 && h < 18) {
    return [
      { label: 'thisEvening', start: now, end: at18, night: false },
      { label: 'tonight', start: at18, end: plus12(at18), night: true },
      { label: 'tomorrow', start: plus12(at18), end: plus12(plus12(at18)), night: false },
    ];
  }
  // evening or night: tonight (rest, until 06) / tomorrow / tomorrow night
  return [
    { label: 'tonight', start: now, end: at6, night: true },
    { label: 'tomorrow', start: at6, end: plus12(at6), night: false },
    { label: 'tomorrowNight', start: plus12(at6), end: plus12(plus12(at6)), night: true },
  ];
}

const SEVERITY = ['clear', 'partly', 'cloudy', 'fog', 'showers', 'snowshowers', 'rain', 'sleet', 'snow', 'thunder'];
const sev = (s: Sym | null) => (s ? SEVERITY.indexOf(symKind(s)) * 10 + symIntensity(s) : -1);

export function summarize(steps: Step[], p: Period, lang: Lang): PeriodSummary | null {
  const xs = steps.filter((s) => {
    const t = Date.parse(s.time);
    return t >= p.start.getTime() - 30 * 60_000 && t < p.end.getTime();
  });
  const temps = xs.map((s) => s.t).filter((v): v is number => v != null);
  if (temps.length < 2) return null;
  const winds = xs.map((s) => s.ws).filter((v): v is number => v != null);
  const gusts = xs.map((s) => s.wg).filter((v): v is number => v != null);
  const clouds = xs.map((s) => s.cloud).filter((v): v is number => v != null);
  const pr = xs.reduce((a, s) => a + (s.pr ?? 0), 0);
  const maxWindStep = xs.reduce<Step | null>((a, s) => ((s.ws ?? -1) > (a?.ws ?? -1) ? s : a), null);
  // symbol: severest precipitation symbol if wet, else the most common sky symbol
  const syms = xs.map((s) => s.sym).filter((v): v is Sym => !!v);
  let sym: Sym | null = null;
  if (pr >= 0.3) sym = syms.reduce<Sym | null>((a, s) => (sev(s) > sev(a) ? s : a), null);
  if (!sym || ['clear', 'partly', 'cloudy', 'fog'].includes(symKind(sym))) {
    const dry = syms.filter((s) => ['clear', 'partly', 'cloudy', 'fog'].includes(symKind(s)));
    const counts = new Map<Sym, number>();
    for (const s of dry) counts.set(s, (counts.get(s) ?? 0) + 1);
    sym = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? sym;
  }
  const sum: Omit<PeriodSummary, 'text'> = {
    ...p,
    tmin: Math.min(...temps),
    tmax: Math.max(...temps),
    pr,
    wsmin: winds.length ? Math.min(...winds) : 0,
    wsmax: winds.length ? Math.max(...winds) : 0,
    wgmax: gusts.length ? Math.max(...gusts) : null,
    wd: maxWindStep?.wd ?? null,
    cloud: clouds.length ? clouds.reduce((a, b) => a + b, 0) / clouds.length : null,
    sym,
  };
  return { ...sum, text: describe(sum, lang) };
}

const SKY: Record<Lang, Record<string, string>> = {
  fi: { clear: 'Selkeää', partly: 'Puolipilvistä', cloudy: 'Pilvistä', fog: 'Sumuista' },
  en: { clear: 'Clear', partly: 'Partly cloudy', cloudy: 'Cloudy', fog: 'Foggy' },
};

const PRECIP: Record<Lang, Record<string, [string, string, string]>> = {
  fi: {
    rain: ['heikkoa vesisadetta', 'vesisadetta', 'runsasta vesisadetta'],
    showers: ['heikkoja sadekuuroja', 'sadekuuroja', 'voimakkaita sadekuuroja'],
    snow: ['heikkoa lumisadetta', 'lumisadetta', 'runsasta lumisadetta'],
    snowshowers: ['heikkoja lumikuuroja', 'lumikuuroja', 'voimakkaita lumikuuroja'],
    sleet: ['heikkoa räntäsadetta', 'räntäsadetta', 'runsasta räntäsadetta'],
    thunder: ['ukkoskuuroja', 'voimakkaita ukkoskuuroja', 'voimakkaita ukkoskuuroja'],
  },
  en: {
    rain: ['light rain', 'rain', 'heavy rain'],
    showers: ['light showers', 'showers', 'heavy showers'],
    snow: ['light snow', 'snow', 'heavy snow'],
    snowshowers: ['light snow showers', 'snow showers', 'heavy snow showers'],
    sleet: ['light sleet', 'sleet', 'heavy sleet'],
    thunder: ['thunderstorms', 'severe thunderstorms', 'severe thunderstorms'],
  },
};

function skyFromCloud(cloud: number | null): string {
  if (cloud == null) return 'cloudy';
  return cloud < 25 ? 'clear' : cloud < 70 ? 'partly' : 'cloudy';
}

function mm(lang: Lang, v: number): string {
  const r = v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
  return (lang === 'fi' ? String(r).replace('.', ',') : String(r)) + '\u00a0mm';
}

export function describe(s: Omit<PeriodSummary, 'text'>, lang: Lang): string {
  const out: string[] = [];
  const kind = symKind(s.sym);
  const wet = !!PRECIP[lang][kind] && s.pr >= 0.3;
  // sky
  const skyKind = kind in SKY[lang] && !wet ? kind : skyFromCloud(s.cloud);
  let sky = SKY[lang][skyKind];
  if (wet) {
    const p = PRECIP[lang][kind][Math.max(0, Math.min(2, symIntensity(s.sym) - 1))];
    sky += lang === 'fi' ? `, ${p}` : `, ${p}`;
    sky += lang === 'fi' ? ` (${mm(lang, s.pr)})` : ` (${mm(lang, s.pr)})`;
  }
  out.push(capitalize(sky) + '.');
  // temperature
  if (s.night) out.push(lang === 'fi' ? `Alin lämpötila ${temp(s.tmin)}.` : `Low ${temp(s.tmin)}.`);
  else out.push(lang === 'fi' ? `Ylin lämpötila ${temp(s.tmax)}.` : `High ${temp(s.tmax)}.`);
  // wind
  const lo = Math.round(s.wsmin);
  const hi = Math.round(s.wsmax);
  if (hi <= 1) out.push(lang === 'fi' ? 'Tyyntä.' : 'Calm.');
  else if (hi <= 3 || s.wd == null) out.push(lang === 'fi' ? 'Heikkoa tuulta.' : 'Light winds.');
  else {
    const range = lo === hi || lo < 1 ? `${hi}` : `${lo}–${hi}`;
    let w = `${capitalize(windPhrase(lang, s.wd))} ${range}\u00a0m/s`;
    if (s.wgmax != null && s.wgmax >= 15) w += lang === 'fi' ? `, puuskissa ${Math.round(s.wgmax)}\u00a0m/s` : `, gusts to ${Math.round(s.wgmax)}\u00a0m/s`;
    out.push(w + '.');
  }
  return out.join(' ');
}

/** Short condition label for a symbol: "Heikkoa lumisadetta" / "Light snow". */
export function symLabel(lang: Lang, sym: Sym | null): string {
  if (!sym) return '';
  const kind = symKind(sym);
  if (SKY[lang][kind]) return SKY[lang][kind];
  const p = PRECIP[lang][kind];
  return p ? capitalize(p[Math.max(0, Math.min(2, symIntensity(sym) - 1))]) : '';
}
