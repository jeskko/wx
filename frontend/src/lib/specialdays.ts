// Finnish calendar of special days: flag days (lib/flagdays.ts), public holidays, other
// traditional days, daylight saving time changes, equinoxes and solstices. All computed from
// rules (no name days: that list is copyrighted by the University of Helsinki almanac office).

import { flagDays, mergeElections, type ElectionsFile } from './flagdays';
import type { Lang } from './types';

export interface SpecialDay {
  date: string;
  name: Record<Lang, string>;
  /** flag flying day (official or established) */
  flag: boolean;
  /** public holiday or customary day off (red day) */
  holiday: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400_000);

/** Easter Sunday (anonymous Gregorian algorithm). */
export function easter(y: number): Date {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return utc(y, month, day);
}

/** The given weekday (0 = Sunday) between two days of a month. */
function weekdayBetween(y: number, m: number, from: number, to: number, wd: number): Date {
  for (let d = from; d <= to; d++) if (utc(y, m, d).getUTCDay() === wd) return utc(y, m, d);
  throw new Error('no such weekday');
}
/** First given weekday on or after a date (may run into the next month). */
function weekdayOnOrAfter(y: number, m: number, d: number, wd: number): Date {
  const x = utc(y, m, d);
  return addDays(x, (wd - x.getUTCDay() + 7) % 7);
}
function lastWeekday(y: number, m: number, wd: number): Date {
  const last = new Date(Date.UTC(y, m, 0));
  return addDays(last, -((last.getUTCDay() - wd + 7) % 7));
}

/** Apparent solar longitude (deg), low-precision almanac formula (~0.01°). */
function sunLongitude(ms: number): number {
  const n = ms / 86400_000 + 2440587.5 - 2451545.0;
  const L = 280.46 + 0.9856474 * n;
  const g = ((357.528 + 0.9856003 * n) * Math.PI) / 180;
  return (((L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) % 360) + 360) % 360;
}

/** Instant the sun reaches ecliptic longitude `target` (0, 90, 180, 270) around a date. */
export function solarTerm(y: number, target: number): Date {
  const guess = { 0: [3, 20], 90: [6, 21], 180: [9, 22], 270: [12, 21] }[target as 0 | 90 | 180 | 270]!;
  let a = Date.UTC(y, guess[0] - 1, guess[1]) - 4 * 86400_000;
  let b = a + 8 * 86400_000;
  const f = (ms: number) => ((sunLongitude(ms) - target + 540) % 360) - 180;
  for (let i = 0; i < 50; i++) {
    const mid = (a + b) / 2;
    if (f(mid) < 0) a = mid;
    else b = mid;
  }
  return new Date((a + b) / 2);
}

const helsinkiDate = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Europe/Helsinki' });

type Entry = { date: string; fi: string; en: string; holiday?: boolean };

function others(y: number): Entry[] {
  const E = easter(y);
  const e = (n: number) => iso(addDays(E, n));
  const d = (m: number, day: number) => iso(utc(y, m, day));
  const out: Entry[] = [
    // public holidays and customary days off
    { date: d(1, 1), fi: 'Uudenvuodenpäivä', en: "New Year's Day", holiday: true },
    { date: d(1, 6), fi: 'Loppiainen', en: 'Epiphany', holiday: true },
    { date: e(-2), fi: 'Pitkäperjantai', en: 'Good Friday', holiday: true },
    { date: e(0), fi: 'Pääsiäispäivä', en: 'Easter Sunday', holiday: true },
    { date: e(1), fi: '2. pääsiäispäivä', en: 'Easter Monday', holiday: true },
    { date: e(39), fi: 'Helatorstai', en: 'Ascension Day', holiday: true },
    { date: e(49), fi: 'Helluntaipäivä', en: 'Pentecost', holiday: true },
    { date: iso(weekdayBetween(y, 6, 19, 25, 5)), fi: 'Juhannusaatto', en: 'Midsummer Eve', holiday: true },
    { date: iso(weekdayBetween(y, 6, 20, 26, 6)), fi: 'Juhannuspäivä', en: 'Midsummer Day', holiday: true },
    { date: d(5, 1), fi: 'Vappu', en: 'May Day', holiday: true },
    { date: iso(weekdayOnOrAfter(y, 10, 31, 6)), fi: 'Pyhäinpäivä', en: "All Saints' Day", holiday: true }, // Sat 31.10.–6.11.
    { date: d(12, 6), fi: 'Itsenäisyyspäivä', en: 'Independence Day', holiday: true },
    { date: d(12, 24), fi: 'Jouluaatto', en: 'Christmas Eve', holiday: true },
    { date: d(12, 25), fi: 'Joulupäivä', en: 'Christmas Day', holiday: true },
    { date: d(12, 26), fi: 'Tapaninpäivä', en: "St Stephen's Day", holiday: true },
    // other traditional days
    { date: d(1, 13), fi: 'Nuutinpäivä', en: "St Knut's Day" },
    { date: iso(weekdayBetween(y, 2, 2, 8, 0)), fi: 'Kynttilänpäivä', en: 'Candlemas' },
    { date: e(-49), fi: 'Laskiaissunnuntai', en: 'Shrove Sunday' },
    { date: e(-47), fi: 'Laskiaistiistai', en: 'Shrove Tuesday' },
    { date: d(2, 14), fi: 'Ystävänpäivä', en: "Valentine's Day" },
    { date: d(3, 8), fi: 'Naistenpäivä', en: "International Women's Day" },
    { date: iso(weekdayBetween(y, 3, 22, 28, 0)), fi: 'Marianpäivä', en: 'Annunciation (Lady Day)' },
    { date: e(-7), fi: 'Palmusunnuntai', en: 'Palm Sunday' },
    { date: e(-3), fi: 'Kiirastorstai', en: 'Maundy Thursday' },
    { date: e(-1), fi: 'Pääsiäislauantai', en: 'Holy Saturday' },
    { date: d(4, 30), fi: 'Vappuaatto', en: 'May Day Eve' },
    { date: iso(weekdayOnOrAfter(y, 9, 29, 0)), fi: 'Mikkelinpäivä', en: 'Michaelmas' }, // Sun 29.9.–5.10.
    { date: d(12, 31), fi: 'Uudenvuodenaatto', en: "New Year's Eve" },
    // clocks
    { date: iso(lastWeekday(y, 3, 0)), fi: 'Kesäaika alkaa: kellot tunti eteenpäin', en: 'Summer time begins: clocks forward an hour' },
    { date: iso(lastWeekday(y, 10, 0)), fi: 'Kesäaika päättyy: kellot tunti taaksepäin', en: 'Summer time ends: clocks back an hour' },
    // seasons (Finnish calendar date of the instant)
    { date: helsinkiDate(solarTerm(y, 0)), fi: 'Kevätpäiväntasaus', en: 'Spring equinox' },
    { date: helsinkiDate(solarTerm(y, 90)), fi: 'Kesäpäivänseisaus', en: 'Summer solstice' },
    { date: helsinkiDate(solarTerm(y, 180)), fi: 'Syyspäiväntasaus', en: 'Autumn equinox' },
    { date: helsinkiDate(solarTerm(y, 270)), fi: 'Talvipäivänseisaus', en: 'Winter solstice' },
  ];
  return out;
}

/** All special days of a year, one entry per day and name, sorted by date. */
export function specialDays(y: number, wd: ElectionsFile['elections'] = []): SpecialDay[] {
  const out: SpecialDay[] = mergeElections(flagDays(y), wd, y).map((f) => ({ date: f.date, name: f.name, flag: true, holiday: false }));
  for (const o of others(y)) {
    const date = o.date;
    // the same day as a flag day (vappu, juhannuspäivä, itsenäisyyspäivä): one entry, both marks
    const first = o.fi.split(/[ ,]/)[0].toLowerCase();
    const same = out.find((x) => x.flag && x.date === date && x.name.fi.toLowerCase().startsWith(first));
    if (same) {
      same.holiday ||= !!o.holiday;
      continue;
    }
    out.push({ date, name: { fi: o.fi, en: o.en }, flag: false, holiday: !!o.holiday });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || Number(b.flag) - Number(a.flag) || Number(b.holiday) - Number(a.holiday));
}

/** Special days from the Finnish date of `now` for `days` days (today included). */
export function upcomingSpecialDays(now: Date, days: number, wd: ElectionsFile['elections'] = []): SpecialDay[] {
  const today = helsinkiDate(now);
  const end = iso(addDays(new Date(`${today}T00:00:00Z`), days - 1));
  const y = Number(today.slice(0, 4));
  const all = [...specialDays(y, wd), ...(end.slice(0, 4) !== today.slice(0, 4) ? specialDays(y + 1, wd) : [])];
  return all.filter((s) => s.date >= today && s.date <= end);
}

export function specialDaysOn(now: Date, wd: ElectionsFile['elections'] = []): SpecialDay[] {
  return upcomingSpecialDays(now, 1, wd);
}
