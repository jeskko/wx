// METAR / TAF → plain language (Finnish or English), for the aviation slides' "decode" option.
//
// Token-based and forgiving: anything it does not understand is kept verbatim in `other`, so no
// information is silently lost. Remarks (RMK …) are dropped. Units follow the rest of wx.fi:
// wind in m/s, visibility in km/m, cloud heights in metres; times in the airport's local time.

import { LOCALE } from '../i18n';
import { capitalize, temp, visibility, windPhrase } from './format';
import type { Lang } from './types';
import { tzFor } from './wx';

export interface DecodedGroup {
  /** "Ajoittain klo 11–16" etc.; null for the main (base) conditions. */
  head: string | null;
  /** Decoded conditions, each starting with a capital letter. */
  items: string[];
  /** Tokens that were not understood, verbatim. */
  other: string[];
}

export interface DecodedMetar {
  /** "klo 10.20" / "10:20", with "UTC" when the airport's time zone is unknown. */
  time: string | null;
  auto: boolean;
  main: DecodedGroup;
  /** Landing forecast (TEMPO / BECMG) and NOSIG. */
  trend: DecodedGroup[];
}

export interface DecodedTaf {
  /** Validity, e.g. "ke klo 8 – to klo 8". */
  valid: string | null;
  amended: boolean;
  cancelled: boolean;
  groups: DecodedGroup[];
}

// ---------------------------------------------------------------------------------------- time

const PREFIX_COUNTRY: Record<string, string> = { EF: 'FI', ES: 'SE', EN: 'NO', EK: 'DK', BI: 'IS', EE: 'EE', EV: 'LV' };

/** Local time zone of an airport from its ICAO prefix; UTC when unknown. */
export function airportTz(icao: string): string {
  const c = PREFIX_COUNTRY[icao.slice(0, 2).toUpperCase()];
  return c ? tzFor(c) : 'UTC';
}

interface Clock {
  lang: Lang;
  tz: string;
  /** "now", for deciding when a weekday is needed */
  now: Date;
  /** reference for completing day-of-month times (TAF validity start, issue time …) */
  ref: Date;
}

/** Day-of-month + hour (+ minute) in UTC → Date, in the month closest to `ref`. Hour 24 = next midnight. */
export function dayTime(ref: Date, day: number, hour: number, minute = 0): Date {
  let best: Date | null = null;
  for (const dm of [-1, 0, 1]) {
    const d = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() + dm, day, hour, minute));
    if (d.getUTCDate() !== day && hour < 24) continue; // e.g. 31st in a 30-day month
    if (!best || Math.abs(d.getTime() - ref.getTime()) < Math.abs(best.getTime() - ref.getTime())) best = d;
  }
  return best ?? new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), day, hour, minute));
}

function localParts(d: Date, ck: Clock) {
  const f = new Intl.DateTimeFormat(LOCALE[ck.lang], { timeZone: ck.tz, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { wd: p.weekday.replace(/\.$/, ''), date: `${p.year}-${p.month}-${p.day}`, h: Number(p.hour), m: Number(p.minute) };
}

/** "klo 9" / "klo 14.20" (fi), "09:00" / "14:20" (en) */
function clock(lang: Lang, h: number, m: number): string {
  if (lang === 'fi') return `klo ${h}${m ? '.' + String(m).padStart(2, '0') : ''}`;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** A moment as local time, prefixed with the weekday unless it is today (or `sameDayAs`). */
function at(d: Date, ck: Clock, sameDayAs?: Date): string {
  const p = localParts(d, ck);
  const base = localParts(sameDayAs ?? ck.now, ck).date;
  const s = `${p.date === base ? '' : p.wd + ' '}${clock(ck.lang, p.h, p.m)}`;
  return ck.tz === 'UTC' ? `${s} UTC` : s;
}

/** "klo 11–16", "ke klo 23 – to klo 5", "11:00–16:00" … */
function span(a: Date, b: Date, ck: Clock): string {
  const pa = localParts(a, ck);
  const pb = localParts(b, ck);
  const today = localParts(ck.now, ck).date;
  const utc = ck.tz === 'UTC' ? ' UTC' : '';
  const start = `${pa.date === today ? '' : pa.wd + ' '}${clock(ck.lang, pa.h, pa.m)}`;
  if (pa.date === pb.date) {
    const end = ck.lang === 'fi' ? `${pb.h}${pb.m ? '.' + String(pb.m).padStart(2, '0') : ''}` : clock(ck.lang, pb.h, pb.m);
    return `${start}–${end}${utc}`;
  }
  return `${start} – ${pb.wd} ${clock(ck.lang, pb.h, pb.m)}${utc}`;
}

// ---------------------------------------------------------------------------------------- units

const KT = 0.514444;

function ms(v: number, unit: string): number {
  return unit === 'MPS' ? v : unit === 'KMH' ? v / 3.6 : v * KT;
}

/** cloud base in hundreds of feet → "180 m", "1 800 m" */
function heightM(lang: Lang, hundredsFt: number): string {
  const m = hundredsFt * 30.48;
  const r = m < 1000 ? Math.round(m / 10) * 10 : Math.round(m / 100) * 100;
  return `${r.toLocaleString(LOCALE[lang]).replace(/ | /g, ' ')} m`;
}

// ---------------------------------------------------------------------------------------- weather

const FI_NOUN: Record<string, [string, boolean]> = {
  // partitive, plural?
  DZ: ['tihkua', false],
  RA: ['vesisadetta', false],
  SN: ['lumisadetta', false],
  SG: ['lumijyväsiä', true],
  IC: ['jääneulasia', true],
  PL: ['jääjyväsiä', true],
  GR: ['rakeita', true],
  GS: ['lumirakeita', true],
  UP: ['tunnistamatonta sadetta', false],
  BR: ['utua', false],
  FG: ['sumua', false],
  FU: ['savua', false],
  VA: ['tulivuoren tuhkaa', false],
  DU: ['pölyä', false],
  SA: ['hiekkaa', false],
  HZ: ['autereista', false],
  PO: ['pölypyörteitä', true],
  SQ: ['voimakkaita tuulenpuuskia', true],
  FC: ['trombi', false],
  SS: ['hiekkamyrsky', false],
  DS: ['pölymyrsky', false],
};
const EN_NOUN: Record<string, string> = {
  DZ: 'drizzle',
  RA: 'rain',
  SN: 'snow',
  SG: 'snow grains',
  IC: 'ice crystals',
  PL: 'ice pellets',
  GR: 'hail',
  GS: 'small hail',
  UP: 'unknown precipitation',
  BR: 'mist',
  FG: 'fog',
  FU: 'smoke',
  VA: 'volcanic ash',
  DU: 'dust',
  SA: 'sand',
  HZ: 'haze',
  PO: 'dust whirls',
  SQ: 'squalls',
  FC: 'funnel cloud',
  SS: 'sandstorm',
  DS: 'duststorm',
};
const PRECIP = new Set(['DZ', 'RA', 'SN', 'SG', 'IC', 'PL', 'GR', 'GS', 'UP']);
const WX_RE = /^(-|\+|VC)?(MI|BC|PR|DR|BL|SH|TS|FZ)?((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PO|SQ|FC|SS|DS)*)$/;

function pairs(s: string): string[] {
  return s.match(/../g) ?? [];
}

function joinAnd(lang: Lang, xs: string[]): string {
  const and = lang === 'fi' ? ' ja ' : ' and ';
  return xs.length <= 1 ? (xs[0] ?? '') : xs.slice(0, -1).join(', ') + and + xs[xs.length - 1];
}

/** One present-weather group ("-SHRA", "VCFG", "TSRA", "FZFG" …) → phrase, or null if not one. */
export function weather(lang: Lang, code: string): string | null {
  const m = WX_RE.exec(code);
  if (!m || (!m[2] && !m[3])) return null;
  const [, int, desc, ph] = m;
  const codes = pairs(ph);
  const fi = lang === 'fi';
  const light = int === '-';
  const heavy = int === '+';
  const vc = int === 'VC';
  let out: string;

  if (desc === 'SH') {
    // showers: "heikkoja vesikuuroja" / "light rain showers"
    const hasRa = codes.includes('RA');
    const hasSn = codes.includes('SN');
    const kinds: string[] = [];
    if (hasRa && hasSn) kinds.push(fi ? 'räntä' : 'sleet');
    else if (hasRa) kinds.push(fi ? 'vesi' : 'rain');
    else if (hasSn) kinds.push(fi ? 'lumi' : 'snow');
    if (codes.includes('GR') || codes.includes('GS')) kinds.push(fi ? 'rae' : 'hail');
    if (fi) {
      out = kinds.length === 0 ? 'kuuroja' : kinds.length === 1 ? `${kinds[0]}kuuroja` : `${kinds[0]}- ja ${kinds[1]}kuuroja`;
      if (light) out = `heikkoja ${out}`;
      if (heavy) out = `voimakkaita ${out}`;
    } else {
      out = kinds.length ? `${kinds.join(' and ')} showers` : 'showers';
      if (light) out = `light ${out}`;
      if (heavy) out = `heavy ${out}`;
    }
  } else {
    const precip = codes.filter((c) => PRECIP.has(c));
    const rest = codes.filter((c) => !PRECIP.has(c));
    const nouns: string[] = [];
    let plural = false;
    // rain + snow = sleet
    const sleet = precip.includes('RA') && precip.includes('SN');
    for (const c of precip) {
      if (sleet && c === 'SN') continue;
      if (sleet && c === 'RA') {
        nouns.push(fi ? 'räntäsadetta' : 'sleet');
        continue;
      }
      nouns.push(fi ? FI_NOUN[c][0] : EN_NOUN[c]);
      plural ||= fi && FI_NOUN[c][1];
    }
    let p = joinAnd(lang, nouns);
    if (p && desc === 'FZ') p = (fi ? 'jäätävää ' : 'freezing ') + p;
    if (p && light) p = (fi ? (plural ? 'heikkoja ' : 'heikkoa ') : 'light ') + p;
    if (p && heavy) p = (fi ? (plural ? 'voimakkaita ' : 'voimakasta ') : 'heavy ') + p;

    const obsc = rest.map((c) => {
      if (c === 'FG' && desc === 'BC') return fi ? 'sumulauttoja' : 'fog patches';
      if (c === 'FG' && desc === 'MI') return fi ? 'matalaa sumua' : 'shallow fog';
      if (c === 'FG' && desc === 'PR') return fi ? 'paikoin sumua' : 'partial fog';
      if (c === 'FG' && desc === 'FZ') return fi ? 'jäätävää sumua' : 'freezing fog';
      return fi ? FI_NOUN[c][0] : EN_NOUN[c];
    });
    // drifting / blowing snow, dust, sand
    if (desc === 'BL' || desc === 'DR') {
      const what = codes[0];
      if (what === 'SN') p = fi ? (desc === 'BL' ? 'lumipyryä' : 'matalaa lumikiertoa') : desc === 'BL' ? 'blowing snow' : 'drifting snow';
      else if (what) p = fi ? `${desc === 'BL' ? 'pyryävää' : 'matalalla kulkevaa'} ${FI_NOUN[what][0]}` : `${desc === 'BL' ? 'blowing' : 'drifting'} ${EN_NOUN[what]}`;
      obsc.length = 0;
    }
    const parts = [p, ...obsc].filter(Boolean);
    if (desc === 'TS') {
      out = parts.length ? (fi ? `ukkosta ja ${joinAnd(lang, parts)}` : `thunderstorm with ${joinAnd(lang, parts)}`) : fi ? 'ukkosta' : 'thunderstorm';
    } else {
      out = joinAnd(lang, parts);
    }
  }
  if (vc) out = fi ? `${out} lähistöllä` : `${out} in the vicinity`;
  return out || null;
}

// ---------------------------------------------------------------------------------------- conditions

const FI_COVER: Record<string, string> = { FEW: 'muutamia', SCT: 'hajanaisia', BKN: 'runsaasti', OVC: 'yhtenäinen' };
const EN_COVER: Record<string, string> = { FEW: 'few', SCT: 'scattered', BKN: 'broken', OVC: 'overcast' };

function cloud(lang: Lang, cover: string, base: string, type: string | undefined): string {
  const fi = lang === 'fi';
  const h = /^\d{3}$/.test(base) ? heightM(lang, Number(base)) : null;
  let s: string;
  if (fi) {
    const noun = type === 'CB' ? 'ukkospilviä' : type === 'TCU' ? 'kohoavia kumpupilviä' : null;
    if (noun) s = cover === 'OVC' ? `yhtenäinen pilvikerros, ${noun}` : `${cover === 'BKN' ? 'runsaasti' : FI_COVER[cover]} ${noun}`;
    else s = cover === 'BKN' ? 'rakoileva pilvikerros' : cover === 'OVC' ? 'yhtenäinen pilvikerros' : `${FI_COVER[cover]} pilviä`;
    return h ? `${s} ${h.replace(/ m$/, '')} metrissä` : s;
  }
  const noun = type === 'CB' ? 'cumulonimbus' : type === 'TCU' ? 'towering cumulus' : cover === 'BKN' || cover === 'OVC' ? 'cloud' : 'clouds';
  s = cover === 'OVC' && !type ? 'overcast' : `${EN_COVER[cover]} ${noun}`;
  return h ? `${s} at ${h}` : s;
}

function visText(lang: Lang, m: number): string {
  if (m === 0) return lang === 'fi' ? 'alle 50 m' : 'below 50 m';
  return visibility(lang, m);
}

const DIR8: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
const FI_TOWARD = ['pohjoiseen', 'koilliseen', 'itään', 'kaakkoon', 'etelään', 'lounaaseen', 'länteen', 'luoteeseen'];
const EN_TOWARD = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];

/**
 * Decode one block of weather groups (the main part of a METAR, or one TAF change group).
 * Tokens are consumed in order; unknown ones end up in `other`.
 */
function conditions(tokens: string[], ck: Clock): { items: string[]; other: string[] } {
  const { lang } = ck;
  const fi = lang === 'fi';
  // buckets, assembled in the usual reading order at the end
  const wind: string[] = [];
  const vis: string[] = [];
  const tail: string[] = []; // temperatures, pressure, wind shear
  const other: string[] = [];
  const clouds: string[] = [];
  const wx: string[] = [];
  const rvr: string[] = [];
  const recent: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    let m: RegExpExecArray | null;

    if ((m = /^(VRB|\d{3})(\d{2,3})(?:G(\d{2,3}))?(KT|MPS|KMH)$/.exec(t))) {
      const sp = Math.round(ms(Number(m[2]), m[4]));
      const gu = m[3] ? Math.round(ms(Number(m[3]), m[4])) : null;
      let s: string;
      if (Number(m[2]) === 0 && !gu) s = fi ? 'tyyntä' : 'calm';
      else {
        const dir = m[1] === 'VRB' ? (fi ? 'suunnaltaan vaihtelevaa tuulta' : 'variable wind') : windPhrase(lang, Number(m[1]));
        s = `${dir} ${sp} m/s`;
        if (gu) s += fi ? `, puuskissa ${gu} m/s` : `, gusts ${gu} m/s`;
      }
      wind.push(s);
    } else if ((m = /^(\d{3})V(\d{3})$/.exec(t)) && wind.length) {
      wind[wind.length - 1] += fi ? ` (suunta vaihtelee ${Number(m[1])}–${Number(m[2])}°)` : ` (varying ${Number(m[1])}–${Number(m[2])}°)`;
    } else if (t === 'CAVOK') {
      vis.push(fi ? 'näkyvyys yli 10 km, ei merkittäviä pilviä' : 'visibility 10+ km, no significant cloud');
    } else if ((m = /^(\d{4})(NDV)?$/.exec(t))) {
      vis.push(`${fi ? 'näkyvyys' : 'visibility'} ${visText(lang, Number(m[1]))}`);
    } else if ((m = /^(\d{4})(N|NE|E|SE|S|SW|W|NW)$/.exec(t))) {
      const k = Math.round(DIR8[m[2]] / 45);
      vis.push(fi ? `pienin näkyvyys ${visText(lang, Number(m[1]))} ${FI_TOWARD[k]}` : `minimum visibility ${visText(lang, Number(m[1]))} to the ${EN_TOWARD[k]}`);
    } else if ((m = /^(P)?(\d+)SM$/.exec(t)) || (m = /^(P)?(\d\/\d)SM$/.exec(t))) {
      const [a, b] = m[2].split('/').map(Number);
      const mi = b ? a / b : a;
      const v = m[1] || mi >= 6 ? 9999 : Math.round((mi * 1609.344) / 10) * 10;
      vis.push(`${fi ? 'näkyvyys' : 'visibility'} ${visText(lang, v)}`);
    } else if ((m = /^R(\d{2}[LCR]?)\/([PM])?(\d{4})(?:V([PM])?(\d{4}))?(FT)?\/?([UDN])?$/.exec(t))) {
      const val = (pm: string | undefined, v: string) => {
        const n = m![6] ? Math.round((Number(v) * 0.3048) / 10) * 10 : Number(v);
        const pre = pm === 'P' ? (fi ? 'yli ' : 'above ') : pm === 'M' ? (fi ? 'alle ' : 'below ') : '';
        return `${pre}${n} m`;
      };
      let s = `${m[1]}: ${val(m[2], m[3])}${m[5] ? '–' + val(m[4], m[5]) : ''}`;
      if (m[7] === 'U') s += fi ? ', paranee' : ', improving';
      if (m[7] === 'D') s += fi ? ', heikkenee' : ', deteriorating';
      rvr.push(s);
    } else if ((m = /^RE([A-Z]+)$/.exec(t)) && weather(lang, m[1])) {
      recent.push(weather(lang, m[1])!);
    } else if (t === 'NSW') {
      wx.push(fi ? 'ei merkittävää säätä' : 'no significant weather');
    } else if (weather(lang, t)) {
      wx.push(weather(lang, t)!);
    } else if ((m = /^(FEW|SCT|BKN|OVC)(\d{3}|\/\/\/)(CB|TCU|\/\/\/)?$/.exec(t))) {
      clouds.push(cloud(lang, m[1], m[2], m[3] === '///' ? undefined : m[3]));
    } else if ((m = /^VV(\d{3}|\/\/\/)$/.exec(t))) {
      const h = /\d/.test(m[1]) ? heightM(lang, Number(m[1])) : null;
      clouds.push(fi ? `taivas ei näy${h ? `, pystynäkyvyys ${h}` : ''}` : `sky obscured${h ? `, vertical visibility ${h}` : ''}`);
    } else if (t === 'NSC') {
      clouds.push(fi ? 'ei merkittäviä pilviä' : 'no significant cloud');
    } else if (t === 'NCD') {
      clouds.push(fi ? 'ei havaittuja pilviä' : 'no cloud detected');
    } else if (t === 'SKC' || t === 'CLR') {
      clouds.push(fi ? 'selkeää' : 'clear sky');
    } else if ((m = /^(M)?(\d{2})\/(M)?(\d{2})?$/.exec(t))) {
      const tt = (m[1] ? -1 : 1) * Number(m[2]);
      const td = m[4] ? (m[3] ? -1 : 1) * Number(m[4]) : null;
      tail.push(`${fi ? 'lämpötila' : 'temperature'} ${temp(tt)}${td != null ? `, ${fi ? 'kastepiste' : 'dew point'} ${temp(td)}` : ''}`);
    } else if ((m = /^(TX|TN)(M)?(\d{2})\/(\d{2})(\d{2})Z$/.exec(t))) {
      const v = (m[2] ? -1 : 1) * Number(m[3]);
      const when = at(dayTime(ck.ref, Number(m[4]), Number(m[5])), ck);
      const lbl = m[1] === 'TX' ? (fi ? 'ylin lämpötila' : 'maximum temperature') : fi ? 'alin lämpötila' : 'minimum temperature';
      tail.push(`${lbl} ${temp(v)} (${when})`);
    } else if ((m = /^Q(\d{4})$/.exec(t))) {
      tail.push(`${fi ? 'ilmanpaine' : 'pressure'} ${Number(m[1])} hPa`);
    } else if ((m = /^A(\d{4})$/.exec(t))) {
      tail.push(`${fi ? 'ilmanpaine' : 'pressure'} ${Math.round(Number(m[1]) * 0.338639)} hPa`);
    } else if (t === 'WS') {
      // WS R22 / WS ALL RWY
      const rest: string[] = [];
      while (tokens[i + 1] && /^(R\d{2}[LCR]?|RWY\d{2}[LCR]?|ALL|RWY)$/.test(tokens[i + 1])) rest.push(tokens[++i]);
      const rwy = rest.join(' ').replace(/^RWY/, '').replace(/^R/, '');
      tail.push(fi ? `tuuliväänne${rwy ? ` (${/ALL/.test(rwy) ? 'kaikki kiitotiet' : 'kiitotie ' + rwy})` : ''}` : `wind shear${rwy ? ` (${/ALL/.test(rwy) ? 'all runways' : 'runway ' + rwy})` : ''}`);
    } else {
      other.push(t);
    }
  }
  const items = [...wind, ...vis];
  if (rvr.length) items.push(`${fi ? 'kiitotienäkyvyys' : 'runway visual range'} ${rvr.join(', ')}`);
  items.push(...wx);
  if (clouds.length) items.push(clouds.join(', '));
  if (recent.length) items.push(`${fi ? 'äskettäin' : 'recently'} ${joinAnd(lang, recent)}`);
  items.push(...tail);
  return { items: items.map(capitalize), other };
}

// ---------------------------------------------------------------------------------------- change groups

const CHANGE_RE = /^(BECMG|TEMPO|FM\d{6}|PROB\d{2}|NOSIG)$/;

/** Split tokens at change-group keywords; PROBnn may be followed by TEMPO. */
function splitGroups(tokens: string[]): string[][] {
  const out: string[][] = [[]];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (CHANGE_RE.test(t) && !(t === 'TEMPO' && /^PROB\d{2}$/.test(tokens[i - 1] ?? ''))) out.push([]);
    out[out.length - 1].push(t);
  }
  return out;
}

function changeHead(tokens: string[], ck: Clock): { head: string; rest: string[] } {
  const fi = ck.lang === 'fi';
  let i = 0;
  let prob: number | null = null;
  let kind: string | null = null;
  let m: RegExpExecArray | null;
  if ((m = /^PROB(\d{2})$/.exec(tokens[i]))) {
    prob = Number(m[1]);
    i++;
  }
  if (tokens[i] === 'TEMPO' || tokens[i] === 'BECMG') kind = tokens[i++];
  let when = '';
  if ((m = /^FM(\d{2})(\d{2})(\d{2})$/.exec(tokens[i] ?? ''))) {
    when = fi ? `${at(dayTime(ck.ref, +m[1], +m[2], +m[3]), ck)} alkaen` : `from ${at(dayTime(ck.ref, +m[1], +m[2], +m[3]), ck)}`;
    kind = 'FM';
    i++;
  } else if ((m = /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/.exec(tokens[i] ?? ''))) {
    when = span(dayTime(ck.ref, +m[1], +m[2]), dayTime(ck.ref, +m[3], +m[4]), ck);
    i++;
  } else {
    // METAR trend times: FMhhmm, TLhhmm, AThhmm
    const parts: string[] = [];
    while ((m = /^(FM|TL|AT)(\d{2})(\d{2})$/.exec(tokens[i] ?? ''))) {
      const d = new Date(ck.ref);
      d.setUTCHours(+m[2], +m[3], 0, 0);
      if (d.getTime() < ck.ref.getTime() - 3600_000) d.setUTCDate(d.getUTCDate() + 1);
      const s = at(d, ck);
      parts.push(m[1] === 'FM' ? (fi ? `${s} alkaen` : `from ${s}`) : m[1] === 'TL' ? (fi ? `${s} asti` : `until ${s}`) : fi ? s : `at ${s}`);
      i++;
    }
    when = parts.join(' ');
  }
  let head: string;
  if (fi) {
    const k = kind === 'TEMPO' ? 'ajoittain' : kind === 'BECMG' ? 'muuttuu' : '';
    head = [prob != null ? `${prob} %:n todennäköisyydellä` : '', k, when].filter(Boolean).join(' ');
  } else {
    const k = kind === 'TEMPO' ? 'temporarily' : kind === 'BECMG' ? 'becoming' : '';
    const rest = [k, when].filter(Boolean).join(' ');
    head = prob != null ? `${prob}% chance${rest ? ', ' + rest : ''}` : rest;
  }
  return { head: capitalize(head), rest: tokens.slice(i) };
}

// ---------------------------------------------------------------------------------------- public

function tokenize(raw: string): string[] {
  const s = raw.replace(/=\s*$/, '').trim();
  const cut = s.search(/\bRMK\b/);
  return (cut >= 0 ? s.slice(0, cut) : s).split(/\s+/).filter(Boolean);
}

export function decodeMetar(raw: string, lang: Lang, opts: { icao?: string; time?: string | null; now?: Date } = {}): DecodedMetar {
  let tokens = tokenize(raw);
  if (tokens[0] === 'METAR' || tokens[0] === 'SPECI') tokens = tokens.slice(1);
  if (tokens[0] === 'COR') tokens = tokens.slice(1);
  const icao = opts.icao ?? (/^[A-Z]{4}$/.test(tokens[0] ?? '') ? tokens[0] : '');
  if (tokens[0] === icao) tokens = tokens.slice(1);
  const now = opts.now ?? new Date();
  let ref = opts.time ? new Date(opts.time) : now;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{2})(\d{2})(\d{2})Z$/.exec(tokens[0] ?? ''))) {
    if (!opts.time) ref = dayTime(now, +m[1], +m[2], +m[3]);
    tokens = tokens.slice(1);
  }
  const ck: Clock = { lang, tz: airportTz(icao), now, ref };
  let auto = false;
  tokens = tokens.filter((t) => {
    if (t === 'AUTO') auto = true;
    return t !== 'AUTO' && t !== 'COR';
  });
  const [main, ...changes] = splitGroups(tokens);
  const trend: DecodedGroup[] = changes.map((g) => {
    if (g[0] === 'NOSIG') {
      return { head: null, items: [lang === 'fi' ? 'Ei merkittäviä muutoksia odotettavissa' : 'No significant change expected'], other: g.slice(1) };
    }
    const { head, rest } = changeHead(g, ck);
    return { head, ...conditions(rest, ck) };
  });
  return { time: at(ref, ck), auto, main: { head: null, ...conditions(main, ck) }, trend };
}

export function decodeTaf(raw: string, lang: Lang, opts: { icao?: string; from?: string | null; now?: Date } = {}): DecodedTaf {
  let tokens = tokenize(raw);
  let amended = false;
  while (/^(TAF|AMD|COR)$/.test(tokens[0] ?? '')) {
    if (tokens[0] !== 'TAF') amended = true;
    tokens = tokens.slice(1);
  }
  const icao = opts.icao ?? (/^[A-Z]{4}$/.test(tokens[0] ?? '') ? tokens[0] : '');
  if (tokens[0] === icao) tokens = tokens.slice(1);
  const now = opts.now ?? new Date();
  let ref = opts.from ? new Date(opts.from) : now;
  let m: RegExpExecArray | null;
  if (/^\d{6}Z$/.test(tokens[0] ?? '')) tokens = tokens.slice(1); // issue time
  let valid: string | null = null;
  const ck: Clock = { lang, tz: airportTz(icao), now, ref };
  if ((m = /^(\d{2})(\d{2})\/(\d{2})(\d{2})$/.exec(tokens[0] ?? ''))) {
    if (!opts.from) ck.ref = ref = dayTime(now, +m[1], +m[2]);
    valid = span(dayTime(ref, +m[1], +m[2]), dayTime(ref, +m[3], +m[4]), ck);
    tokens = tokens.slice(1);
  }
  if (tokens[0] === 'CNL' || tokens[0] === 'NIL') {
    return { valid, amended, cancelled: true, groups: [] };
  }
  const [main, ...changes] = splitGroups(tokens);
  const groups: DecodedGroup[] = [{ head: null, ...conditions(main, ck) }];
  for (const g of changes) {
    const { head, rest } = changeHead(g, ck);
    groups.push({ head, ...conditions(rest, ck) });
  }
  return { valid, amended, cancelled: false, groups };
}

