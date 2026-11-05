import { LOCALE } from '../i18n';
import type { Lang } from './types';

const MINUS = '−';

/** "+3°", "−12°", "0°" */
export function temp(v: number | null | undefined, sign = true): string {
  if (v == null || Number.isNaN(v)) return '–';
  const r = Math.round(v);
  if (r === 0) return '0°';
  if (r < 0) return `${MINUS}${-r}°`;
  return `${sign ? '+' : ''}${r}°`;
}

/** Number with a fixed number of decimals: decimal comma in Finnish, typographic minus. */
export function num(lang: Lang, v: number | null | undefined, digits = 0): string {
  if (v == null || Number.isNaN(v)) return '–';
  const s = v.toFixed(digits);
  // no "−0" / "−0,0" for values that round to zero
  const out = Number(s) === 0 ? s.replace('-', '') : s.replace('-', MINUS);
  return lang === 'fi' ? out.replace('.', ',') : out;
}

const DIRS: Record<Lang, string[]> = {
  fi: ['pohjois', 'koillis', 'itä', 'kaakkois', 'etelä', 'lounais', 'länsi', 'luoteis'],
  en: ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'],
};
const SHORT: Record<Lang, string[]> = {
  fi: ['P', 'KO', 'I', 'KA', 'E', 'LO', 'L', 'LU'],
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
};

export function dirIndex(deg: number): number {
  return Math.round((((deg % 360) + 360) % 360) / 45) % 8;
}

export function windShort(lang: Lang, deg: number | null): string {
  return deg == null ? '' : SHORT[lang][dirIndex(deg)];
}

/** "lounaistuulta" (fi, partitive) / "southwest wind" (en) */
export function windPhrase(lang: Lang, deg: number): string {
  const d = DIRS[lang][dirIndex(deg)];
  return lang === 'fi' ? `${d}tuulta` : `${d} wind`;
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function time(lang: Lang, iso: string | Date | null | undefined, tz?: string): string {
  if (!iso) return '–';
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleTimeString(LOCALE[lang], { hour: '2-digit', minute: '2-digit', timeZone: tz });
}

export function weekday(lang: Lang, date: string | Date, tz?: string, style: 'short' | 'long' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date.length === 10 ? date + 'T12:00:00Z' : date) : date;
  return d.toLocaleDateString(LOCALE[lang], { weekday: style, timeZone: tz });
}

export function dateLong(lang: Lang, d: Date, tz?: string): string {
  return d.toLocaleDateString(LOCALE[lang], { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz });
}

export function duration(minutes: number): string {
  // round the total first, so 299.6 min is "5 h 00 min", not "4 h 60 min"
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h} h ${m.toString().padStart(2, '0')} min`;
}

export function visibility(lang: Lang, m: number | null): string {
  if (m == null) return '–';
  if (m >= 9999) return lang === 'fi' ? 'yli 10 km' : '10+ km';
  if (m >= 5000) return `${Math.round(m / 1000)} km`;
  if (m >= 1000) return `${num(lang, m / 1000, 1)} km`;
  return `${Math.round(m / 10) * 10} m`;
}
