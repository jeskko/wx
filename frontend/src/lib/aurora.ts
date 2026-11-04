// Aurora visibility heuristics for a place, combining SWPC Kp forecast, the OVATION oval,
// FMI magnetometer activity, darkness and the cloud forecast.

import { getPosition } from 'suncalc';
import type { AuroraFile, KpRow, MagStation, Step } from './types';

/** Kp roughly needed to see aurora overhead/near the horizon at a latitude (Nordic rule of thumb). */
export function kpNeeded(lat: number): number {
  return Math.min(9, Math.max(0, (69 - lat) / 2 + 1));
}

export type Activity = 'quiet' | 'low' | 'moderate' | 'high';

/** Classify an hourly X-component range (nT) as FMI-style activity. */
export function activity(rangeNt: number): Activity {
  if (rangeNt >= 300) return 'high';
  if (rangeNt >= 100) return 'moderate';
  if (rangeNt >= 50) return 'low';
  return 'quiet';
}

/** Traffic-light colours for magnetometer activity. */
export const ACTIVITY_COLOR: Record<Activity, string> = {
  quiet: '#3fbf5a',
  low: '#ffd800',
  moderate: '#ff8a00',
  high: '#e8202a',
};

export function kpColor(kp: number): string {
  if (kp >= 7) return '#e8202a';
  if (kp >= 5) return '#ff8a00';
  if (kp >= 4) return '#ffd800';
  return '#3fbf5a';
}

export interface AuroraOutlook {
  kpNow: number | null;
  kpTonight: number | null;
  need: number;
  ovation: number | null;
  dark: boolean;
  cloud: number | null;
  localNt: number | null;
  level: 0 | 1 | 2 | 3;
}

function nearestMag(mag: MagStation[] | null, lat: number, lon: number): MagStation | null {
  if (!mag?.length) return null;
  return mag.reduce((a, m) => (Math.hypot(m.lat - lat, (m.lon - lon) * 0.45) < Math.hypot(a.lat - lat, (a.lon - lon) * 0.45) ? m : a));
}

export function outlook(a: AuroraFile, lat: number, lon: number, steps: Step[] | null, now: Date): AuroraOutlook {
  const fc: KpRow[] = a.kp?.forecast ?? [];
  const nowMs = now.getTime();
  const past = (a.kp?.observed ?? []).filter((r) => Date.parse(r.time) <= nowMs);
  const kpNow = past.length ? past[past.length - 1].kp : null;
  // tonight = the next 18:00–06:00 window (UTC+2 approx. is fine for this resolution)
  const start = new Date(now);
  if (start.getUTCHours() >= 4 && start.getUTCHours() < 16) start.setUTCHours(16, 0, 0, 0);
  const end = new Date(start.getTime() + 14 * 3600_000);
  const tonight = fc.filter((r) => {
    const t = Date.parse(r.time);
    return t + 3 * 3600_000 > start.getTime() && t < end.getTime();
  });
  const kpTonight = tonight.length ? Math.max(...tonight.map((r) => r.kp)) : kpNow;

  let ovation: number | null = null;
  if (a.ovation) {
    const i = Math.round(lat) - a.ovation.lat0;
    const j = Math.round(lon) - a.ovation.lon0;
    ovation = a.ovation.grid[i]?.[j] ?? null;
  }

  // darkness: sun below -10° at some point tonight
  let dark = false;
  for (let t = start.getTime(); t <= end.getTime(); t += 3600_000) {
    if (getPosition(new Date(t), lat, lon).altitude < -10) {  // suncalc 2: degrees
      dark = true;
      break;
    }
  }

  let cloud: number | null = null;
  if (steps) {
    const cs = steps
      .filter((s) => Date.parse(s.time) >= start.getTime() && Date.parse(s.time) < end.getTime())
      .map((s) => s.cloud)
      .filter((c): c is number => c != null);
    if (cs.length) cloud = cs.reduce((x, y) => x + y, 0) / cs.length;
  }

  const m = nearestMag(a.mag, lat, lon);
  const localNt = m ? m.range : null;
  const need = kpNeeded(lat);

  // geomagnetic chance
  const margin = (kpTonight ?? 0) - need;
  let level = margin >= 1 ? 3 : margin >= 0 ? 2 : margin >= -1.5 ? 1 : 0;
  if (ovation != null && ovation >= 30) level = Math.max(level, 2);
  if (ovation != null && ovation >= 60) level = 3;
  if (localNt != null && localNt >= 100 && now.getTime() >= start.getTime()) level = Math.max(level, 2);
  // weather & daylight
  if (!dark) level = 0;
  if (cloud != null && cloud > 90) level = Math.max(0, level - 2);
  else if (cloud != null && cloud > 70) level = Math.max(0, level - 1);

  return { kpNow, kpTonight, need, ovation, dark, cloud, localNt, level: level as AuroraOutlook['level'] };
}
