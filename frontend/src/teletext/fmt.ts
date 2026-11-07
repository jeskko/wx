// Teletext number and word conventions, modelled on Yle Teksti-TV: no degree sign, signed
// temperatures in tables (+5, -3, 0), wind as compass letters + m/s, weather as two-letter codes
// explained on the legend page (upper case = snow, as Yle does).

import { windShort } from '../lib/format';
import { symIntensity, symKind } from '../lib/wx';
import type { Lang, Sym } from '../lib/types';

/** "+5", "-12", "0"; "-" for missing. */
export function tt(v: number | null | undefined, sign = true): string {
  if (v == null || Number.isNaN(v)) return '-';
  const r = Math.round(v);
  if (r === 0) return '0';
  return r > 0 ? `${sign ? '+' : ''}${r}` : `-${-r}`;
}

/** One decimal with the language's decimal separator: "6,1" / "6.1". */
export function dec(lang: Lang, v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return '-';
  const s = v.toFixed(digits);
  const out = Number(s) === 0 ? s.replace('-', '') : s;
  return lang === 'fi' ? out.replace('.', ',') : out;
}

/** Compass letters (Finnish P/KO/I/KA/E/LO/L/LU, English N/NE/...); "--" when calm or missing. */
export function dir(lang: Lang, deg: number | null | undefined, ws?: number | null): string {
  if (deg == null || ws === 0) return '--';
  return windShort(lang, deg);
}

const CODES: Record<Lang, Record<string, string>> = {
  fi: { clear: 'se', partly: 'pp', cloudy: 'pi', fog: 'su', showers: 'vk', rain: 'vs', snowshowers: 'Lk', snow: 'Ls', sleet: 'rs', thunder: 'uk' },
  en: { clear: 'cl', partly: 'pc', cloudy: 'oc', fog: 'fg', showers: 'sh', rain: 'ra', snowshowers: 'Sh', snow: 'Sn', sleet: 'sl', thunder: 'th' },
};

/** Two-letter weather code for a symbol; "??" if unknown. */
export function code(lang: Lang, sym: Sym | null | undefined): string {
  return CODES[lang][symKind(sym ?? null)] ?? '??';
}

/** Legend rows for the codes, in display order. */
export function codeLegend(lang: Lang): [string, string][] {
  const words: Record<Lang, Record<string, string>> = {
    fi: { clear: 'selkeää', partly: 'puolipilvistä', cloudy: 'pilvistä', fog: 'sumua', showers: 'vesikuuroja', rain: 'vesisadetta', snowshowers: 'lumikuuroja', snow: 'lumisadetta', sleet: 'räntää', thunder: 'ukkosta' },
    en: { clear: 'clear', partly: 'partly cloudy', cloudy: 'overcast', fog: 'fog', showers: 'showers', rain: 'rain', snowshowers: 'snow showers', snow: 'snow', sleet: 'sleet', thunder: 'thunder' },
  };
  return Object.keys(CODES[lang]).map((k) => [CODES[lang][k], words[lang][k]]);
}

/** Upper-case abbreviated condition, Yle 402 style ("HEIK.LUMISADE"), at most n characters. */
export function condWord(lang: Lang, sym: Sym | null | undefined, n = 13): string {
  if (!sym) return '';
  const k = symKind(sym);
  const i = Math.max(1, Math.min(3, symIntensity(sym) || 2));
  const W: Record<Lang, Record<string, string[]>> = {
    fi: {
      clear: ['SELKEÄÄ'],
      partly: ['PUOLIPILV.'],
      cloudy: ['PILVISTÄ'],
      fog: ['SUMUA'],
      showers: ['HEIK.VESIKUUR', 'VESIKUUROJA', 'RUNS.VESIKUUR'],
      rain: ['HEIK.VESISADE', 'VESISADETTA', 'RUNS.VESISADE'],
      snowshowers: ['HEIK.LUMIKUUR', 'LUMIKUUROJA', 'RUNS.LUMIKUUR'],
      snow: ['HEIK.LUMISADE', 'LUMISADETTA', 'RUNS.LUMISADE'],
      sleet: ['HEIK.RÄNTÄ', 'RÄNTÄSADETTA', 'RUNS.RÄNTÄ'],
      thunder: ['UKKOSTA', 'UKKOSTA', 'RAJU UKKONEN'],
    },
    en: {
      clear: ['CLEAR'],
      partly: ['PARTLY CLOUDY'],
      cloudy: ['OVERCAST'],
      fog: ['FOG'],
      showers: ['LT SHOWERS', 'SHOWERS', 'HVY SHOWERS'],
      rain: ['LT RAIN', 'RAIN', 'HEAVY RAIN'],
      snowshowers: ['LT SNOW SHWRS', 'SNOW SHOWERS', 'HVY SNOW SHWR'],
      snow: ['LIGHT SNOW', 'SNOW', 'HEAVY SNOW'],
      sleet: ['LIGHT SLEET', 'SLEET', 'HEAVY SLEET'],
      thunder: ['THUNDER', 'THUNDER', 'SEVERE THNDR'],
    },
  };
  const opts = W[lang][k];
  if (!opts) return '';
  return (opts[i - 1] ?? opts[0]).slice(0, n);
}

/** Pad / cut to n cells (left aligned). */
export const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s + ' '.repeat(n - s.length));
/** Right-align in n cells. */
export const rpad = (s: string, n: number) => (s.length > n ? s.slice(0, n) : ' '.repeat(n - s.length) + s);

/** Word-wrap text to lines of at most n characters. */
export function wrap(s: string, n: number): string[] {
  const out: string[] = [];
  for (const para of s.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      if (!line) line = word;
      else if (line.length + 1 + word.length <= n) line += ' ' + word;
      else {
        out.push(line);
        line = word;
      }
      while (line.length > n) {
        out.push(line.slice(0, n));
        line = line.slice(n);
      }
    }
    out.push(line);
  }
  return out;
}

/** Hours:minutes in a time zone, teletext style "18.05" (fi) / "18:05" (en). */
export function hm(lang: Lang, d: Date | string | number | null | undefined, tz: string): string {
  if (d == null) return '--';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '--';
  const s = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: tz }).format(dt);
  return lang === 'fi' ? s.replace(':', '.') : s;
}

const WD: Record<Lang, string[]> = {
  fi: ['Su', 'Ma', 'Ti', 'Ke', 'To', 'Pe', 'La'],
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
};

/** Short weekday in a time zone: "Ma" / "Mon". */
export function wd(lang: Lang, d: Date | string | number, tz: string): string {
  const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(new Date(d));
  return WD[lang][['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(day)];
}

/** "07.11." (fi) / "07 Nov" (en) in a time zone. */
export function dm(lang: Lang, d: Date | string | number, tz: string): string {
  const dt = new Date(d);
  if (lang === 'fi') {
    const p = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', timeZone: tz }).formatToParts(dt);
    return `${p.find((x) => x.type === 'day')!.value}.${p.find((x) => x.type === 'month')!.value}.`;
  }
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: tz }).format(dt);
}
