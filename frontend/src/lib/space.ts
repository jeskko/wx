// Space weather (space.json): the Sun, sunspots, flares, protons and the NOAA R/S/G scales.
import type { Lang } from './types';

export interface SpaceRegion {
  num: number;
  lat: number;
  /** central-meridian distance, west + */
  lon: number;
  area: number;
  spots: number;
  /** McIntosh class, e.g. "Dkc" */
  cls: string | null;
  /** Mount Wilson magnetic class, e.g. "BGD" */
  mag: string | null;
  c: number | null;
  m: number | null;
  x: number | null;
  flares: { c: number; m: number; x: number };
  /** position on the disk at image time, in solar radii (right = west, up = north) */
  dx: number;
  dy: number;
  snapped: boolean;
}

export interface SpaceSeries {
  start: string;
  step: number;
  /** log10 of the flux, per step */
  log: (number | null)[];
}

export interface ScaleDay {
  date: string | null;
  r: number | null;
  s: number | null;
  g: number | null;
  rMinor: number | null;
  rMajor: number | null;
  sProb: number | null;
}

export interface Flare {
  begin: string | null;
  max: string;
  end: string | null;
  cls: string;
}

export interface SpaceFile {
  updated: string;
  sun: {
    diskR: number;
    images: { kind: 'hmi' | 'aia193'; file: string; time: string }[];
    regionsDate: string | null;
    regions: SpaceRegion[];
    spotGroups: number;
  } | null;
  ssn: { date: string; ssn: number } | null;
  f107: { time: string; flux: number; mean90: number | null } | null;
  /** monthly: [yyyy-mm, ssn, smoothed|null]; predicted: [yyyy-mm, predicted, low, high] */
  cycle: { observed: [string, number, number | null][]; predicted: [string, number, number, number][] } | null;
  probabilities: { date: string; c: number[]; m: number[]; x: number[]; proton: number[] } | null;
  xray: SpaceSeries | null;
  flares: Flare[] | null;
  protons: SpaceSeries | null;
  scales: { yesterday: ScaleDay; now: ScaleDay; forecast: ScaleDay[] } | null;
}

/** GOES 0.1–0.8 nm peak flux (log10 W/m²) -> flare class, e.g. -4.62 -> "M2.4". */
export function flareClass(log: number): string {
  const letters = ['A', 'B', 'C', 'M', 'X'];
  const k = Math.floor(log);
  const i = Math.min(4, Math.max(0, k + 8));
  const mant = Math.pow(10, log - (i - 8));
  return `${letters[i]}${(Math.floor(mant * 10 + 1e-6) / 10).toFixed(1)}`;
}

export function flareRank(cls: string): number {
  const base = { A: -8, B: -7, C: -6, M: -5, X: -4 }[cls[0]] ?? -9;
  const m = parseFloat(cls.slice(1)) || 1;
  return base + Math.log10(m);
}

export const FLARE_COLOR: Record<string, string> = { A: '#6d7a8a', B: '#4fb3ff', C: '#3fbf5a', M: '#e8902a', X: '#e8413a' };

/** NOAA scale level 0–5 colours (SWPC uses yellow→red). */
export const SCALE_COLOR = ['#3fbf5a', '#f6eb14', '#ffc800', '#ff9600', '#ff0000', '#c80000'];

export const SCALE_WORD: Record<Lang, string[]> = {
  fi: ['ei häiriöitä', 'heikko', 'kohtalainen', 'voimakas', 'ankara', 'äärimmäinen'],
  en: ['none', 'minor', 'moderate', 'strong', 'severe', 'extreme'],
};

export const SCALE_NAME: Record<'r' | 's' | 'g', Record<Lang, string>> = {
  r: { fi: 'Radiokatkot', en: 'Radio blackouts' },
  s: { fi: 'Säteilymyrskyt', en: 'Radiation storms' },
  g: { fi: 'Magneettimyrskyt', en: 'Geomagnetic storms' },
};

/** Value of a series at a time, or null. */
export function seriesAt(s: SpaceSeries, t: number): number | null {
  const i = Math.floor((t - Date.parse(s.start)) / (s.step * 60_000));
  return i >= 0 && i < s.log.length ? s.log[i] : null;
}

/** Latest non-null value of a series. */
export function seriesLast(s: SpaceSeries | null): { t: number; v: number } | null {
  if (!s) return null;
  for (let i = s.log.length - 1; i >= 0; i--) {
    const v = s.log[i];
    if (v != null) return { t: Date.parse(s.start) + i * s.step * 60_000, v };
  }
  return null;
}

/** The biggest flare in a window (by peak time). */
export function biggestFlare(fl: Flare[], from: number, to: number): Flare | null {
  let best: Flare | null = null;
  for (const f of fl) {
    const t = Date.parse(f.max);
    if (t < from || t > to) continue;
    if (!best || flareRank(f.cls) > flareRank(best.cls)) best = f;
  }
  return best;
}

/** S-scale level from ≥10 MeV proton flux (pfu, log10): S1 at 10, S2 100, … S5 100 000. */
export function protonLevel(log: number | null): number {
  if (log == null) return 0;
  return Math.max(0, Math.min(5, Math.floor(log)));
}

/** R-scale level from X-ray flux (log10 W/m²): R1 = M1, R2 = M5, R3 = X1, R4 = X10, R5 = X20. */
export function xrayLevel(log: number | null): number {
  if (log == null) return 0;
  const f = Math.pow(10, log) * (1 + 1e-9);
  return f >= 2e-3 ? 5 : f >= 1e-3 ? 4 : f >= 1e-4 ? 3 : f >= 5e-5 ? 2 : f >= 1e-5 ? 1 : 0;
}
