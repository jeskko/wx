// Screen configuration. Precedence: defaults < localStorage < URL (?query or #c=<base64 json>).
//
// URL examples:
//   /?place=oulu,helsinki&lang=en
//   /?kiosk=1&slides=current,next36,extended&theme=retro
//   /?playlist=synth,synthwave   (music playlists, see music/playlists.json)
//   /#c=eyJwbGFjZXMiOlsib3VsdSJdfQ   (full config, base64url JSON; see encodeConfig)

import type { Lang, Place } from '../lib/types';

export type Theme = 'retro' | 'modern';

export interface SlideConf {
  id: string;
  enabled: boolean;
  duration: number; // seconds
}

export interface Config {
  lang: Lang;
  theme: Theme;
  places: string[];
  /** Places added with the place search (GeoNames, ids 'geo-<id>'); forecasts from MET Norway. */
  custom: Place[];
  airports: string[];
  slides: SlideConf[];
  /** Per-place exceptions: place id -> slide ids switched off for that place (place-scoped slides only). */
  off: Record<string, string[]>;
  /** Cities listed on the aurora summary; empty = the configured places. */
  auroraPlaces: string[];
  /** Cities listed on the almanac; empty = the configured places. */
  almanacPlaces: string[];
  /** World capitals with their own slide (ids from map/world.json). */
  capitals: string[];
  music: { enabled: boolean; volume: number; streamUrl: string | null; playlists: string[] };
  kiosk: boolean;
}

export const DEFAULT_SLIDES: SlideConf[] = [
  { id: 'current', enabled: true, duration: 12 },
  { id: 'next36', enabled: true, duration: 16 },
  { id: 'chart', enabled: true, duration: 12 },
  { id: 'extended', enabled: true, duration: 12 },
  { id: 'warnings', enabled: true, duration: 14 },
  { id: 'radar', enabled: true, duration: 14 },
  { id: 'cloudmap', enabled: true, duration: 13 },
  { id: 'tempmap', enabled: true, duration: 12 },
  { id: 'regional', enabled: true, duration: 14 },
  { id: 'windmap', enabled: true, duration: 12 },
  { id: 'roadmap', enabled: true, duration: 12 },
  { id: 'sea', enabled: true, duration: 14 },
  { id: 'airquality', enabled: true, duration: 12 },
  { id: 'aurora', enabled: true, duration: 14 },
  { id: 'auroramap', enabled: true, duration: 12 },
  { id: 'auroraglobe', enabled: true, duration: 12 },
  { id: 'aviation', enabled: true, duration: 14 },
  { id: 'taf', enabled: true, duration: 14 },
  { id: 'almanac', enabled: true, duration: 10 },
  { id: 'sky', enabled: true, duration: 14 },
  { id: 'map-scandinavia', enabled: true, duration: 12 },
  { id: 'map-europe', enabled: true, duration: 12 },
  { id: 'map-namerica', enabled: true, duration: 12 },
  { id: 'map-samerica', enabled: true, duration: 12 },
  { id: 'map-asia', enabled: true, duration: 12 },
  { id: 'map-africa', enabled: true, duration: 12 },
  { id: 'map-oceania', enabled: true, duration: 12 },
  { id: 'capital', enabled: true, duration: 12 },
  { id: 'credits', enabled: true, duration: 8 },
];

/** Defaults for a first-time viewer (no saved settings, no #c= link). */
export const DEFAULT_CONFIG: Config = {
  lang: 'fi',
  theme: 'modern',
  places: ['helsinki', 'oulu', 'kuopio', 'tampere', 'turku', 'rovaniemi', 'stockholm'],
  custom: [],
  airports: ['EFHK', 'EFTU', 'EFTP', 'EFJY', 'EFKU', 'EFOU', 'EFRO', 'EFKT', 'EFIV'],
  slides: DEFAULT_SLIDES,
  // the city slides (36 h, chart, 10 days) only for Oulu; current conditions everywhere
  off: {
    helsinki: ['next36', 'chart', 'extended'],
    kuopio: ['extended', 'chart', 'next36'],
    tampere: ['next36', 'chart', 'extended'],
    turku: ['next36', 'extended', 'chart'],
    rovaniemi: ['extended', 'next36', 'chart'],
    stockholm: ['next36', 'chart', 'extended'],
  },
  auroraPlaces: ['oulu', 'helsinki', 'kuopio', 'rovaniemi', 'ivalo', 'tampere', 'jyvaskyla'],
  almanacPlaces: ['oulu', 'helsinki', 'tampere', 'jyvaskyla', 'rovaniemi', 'ivalo', 'kuopio'],
  capitals: ['stockholm', 'london', 'washington', 'tokyo'],
  music: { enabled: true, volume: 0.3, streamUrl: null, playlists: ['jazz'] },
  kiosk: false,
};

const STORAGE_KEY = 'wx.config.v1';

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function validCustom(x: unknown): x is Place {
  const p = x as Place;
  return (
    !!p &&
    typeof p.id === 'string' &&
    /^geo-\d+$/.test(p.id) &&
    typeof p.name?.fi === 'string' &&
    typeof p.name?.en === 'string' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    typeof p.country === 'string'
  );
}

function cleanCustom(p: Place): Place {
  const tz = typeof p.tz === 'string' && /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+)*$/.test(p.tz) ? p.tz : undefined;
  return { id: p.id, name: { fi: p.name.fi.slice(0, 60), en: p.name.en.slice(0, 60) }, lat: p.lat, lon: p.lon, country: p.country.slice(0, 2), region: 'custom', icao: null, ...(tz ? { tz } : {}) };
}

/** Merge a partial config onto a base, validating shapes and keeping unknown slides out. */
export function merge(base: Config, p: Partial<Config> | null | undefined): Config {
  if (!p || typeof p !== 'object') return base;
  const out: Config = structuredClone(base);
  if (p.lang === 'fi' || p.lang === 'en') out.lang = p.lang;
  if (p.theme === 'retro' || p.theme === 'modern') out.theme = p.theme;
  if (Array.isArray(p.places) && p.places.length) out.places = p.places.filter((x) => typeof x === 'string');
  if (Array.isArray(p.custom)) out.custom = p.custom.filter(validCustom).slice(0, 30).map(cleanCustom);
  if (Array.isArray(p.airports)) out.airports = p.airports.filter((x) => typeof x === 'string').map((x) => x.toUpperCase());
  if (Array.isArray(p.slides)) {
    const known = new Map(DEFAULT_SLIDES.map((s) => [s.id, s]));
    const seen = new Set<string>();
    const slides: SlideConf[] = [];
    for (const s of p.slides) {
      if (!s || !known.has(s.id) || seen.has(s.id)) continue;
      seen.add(s.id);
      slides.push({ id: s.id, enabled: s.enabled !== false, duration: clamp(Number(s.duration) || known.get(s.id)!.duration, 4, 120) });
    }
    // new slides added in later versions appear at the end (before the credits), with their defaults
    for (const s of DEFAULT_SLIDES) {
      if (seen.has(s.id)) continue;
      const credits = slides.findIndex((x) => x.id === 'credits');
      if (credits >= 0) slides.splice(credits, 0, { ...s });
      else slides.push({ ...s });
    }
    out.slides = slides;
  }
  if (p.off && typeof p.off === 'object') {
    const known = new Set(DEFAULT_SLIDES.map((s) => s.id));
    const off: Record<string, string[]> = {};
    for (const [place, ids] of Object.entries(p.off)) {
      if (!Array.isArray(ids)) continue;
      const clean = [...new Set(ids.filter((x) => typeof x === 'string' && known.has(x)))];
      if (clean.length) off[place.toLowerCase()] = clean;
    }
    out.off = off;
  }
  if (Array.isArray(p.almanacPlaces)) out.almanacPlaces = p.almanacPlaces.filter((x) => typeof x === 'string').map((x) => x.toLowerCase());
  if (Array.isArray(p.capitals)) out.capitals = p.capitals.filter((x) => typeof x === 'string').map((x) => x.toLowerCase());
  if (Array.isArray(p.auroraPlaces)) out.auroraPlaces = p.auroraPlaces.filter((x) => typeof x === 'string').map((x) => x.toLowerCase());
  if (p.music && typeof p.music === 'object') {
    if (typeof p.music.enabled === 'boolean') out.music.enabled = p.music.enabled;
    if (typeof p.music.volume === 'number') out.music.volume = clamp(p.music.volume, 0, 1);
    if (p.music.streamUrl === null || typeof p.music.streamUrl === 'string') out.music.streamUrl = p.music.streamUrl || null;
    if (Array.isArray(p.music.playlists)) out.music.playlists = p.music.playlists.filter((x: unknown) => typeof x === 'string');
  }
  if (typeof p.kiosk === 'boolean') out.kiosk = p.kiosk;
  return out;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

export function encodeConfig(c: Partial<Config>): string {
  const bytes = new TextEncoder().encode(JSON.stringify(c));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeConfig(s: string): Partial<Config> | null {
  try {
    const b = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(b, (ch) => ch.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** Parse simple query parameters into a partial config. */
export function fromQuery(q: URLSearchParams): Partial<Config> {
  const p: Partial<Config> = {};
  const lang = q.get('lang');
  if (lang === 'fi' || lang === 'en') p.lang = lang;
  const theme = q.get('theme');
  if (theme === 'retro' || theme === 'modern') p.theme = theme;
  const place = q.get('place') ?? q.get('places');
  if (place) p.places = place.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const ap = q.get('airports');
  if (ap) p.airports = ap.split(',').map((s) => s.trim()).filter(Boolean);
  const slides = q.get('slides');
  if (slides) {
    const ids = slides.split(',').map((s) => s.trim());
    p.slides = [
      ...ids.map((id) => ({ id, enabled: true, duration: DEFAULT_SLIDES.find((d) => d.id === id)?.duration ?? 12 })),
      ...DEFAULT_SLIDES.filter((d) => !ids.includes(d.id)).map((d) => ({ ...d, enabled: false })),
    ];
  }
  if (q.has('kiosk')) p.kiosk = q.get('kiosk') !== '0';
  if (q.has('music') || q.has('playlist'))
    p.music = {
      ...DEFAULT_CONFIG.music,
      enabled: q.get('music') !== '0',
      ...(q.get('playlist') ? { playlists: q.get('playlist')!.split(',').map((s) => s.trim()) } : {}),
    };
  return p;
}

export function loadConfig(loc: Location = window.location): { config: Config; fromUrl: boolean } {
  let c = DEFAULT_CONFIG;
  const st = safeStorage();
  try {
    const raw = st?.getItem(STORAGE_KEY);
    if (raw) c = merge(c, JSON.parse(raw));
  } catch {
    /* ignore broken storage */
  }
  let fromUrl = false;
  const hash = new URLSearchParams(loc.hash.replace(/^#/, ''));
  const enc = hash.get('c');
  if (enc) {
    c = merge(c, decodeConfig(enc));
    fromUrl = true;
  }
  const q = new URLSearchParams(loc.search);
  if ([...q.keys()].length) {
    c = merge(c, fromQuery(q));
    fromUrl = true;
  }
  return { config: c, fromUrl };
}

/** Is a place-scoped slide shown for a place? */
export function slideOnFor(c: Config, placeId: string, slideId: string): boolean {
  return !(c.off[placeId] ?? []).includes(slideId);
}

export function saveConfig(c: Config): void {
  try {
    safeStorage()?.setItem(STORAGE_KEY, JSON.stringify(c));
  } catch {
    /* private mode etc. */
  }
}

export function shareUrl(c: Config, origin = window.location.origin): string {
  return `${origin}/#c=${encodeConfig(c)}`;
}
