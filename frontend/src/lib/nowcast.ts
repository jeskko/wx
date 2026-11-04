// MET Norway radar nowcast: a one-line summary of precipitation in the next ~90 min.

import type { Lang } from './types';
import { time } from './format';

export interface NowcastFile {
  place: string;
  coverage: string | null;
  updated: string | null;
  steps: [string, number][];
}

/** mm/h below which a step counts as dry */
export const WET = 0.1;

/** Steps from now on (drops the ones already past). */
export function upcoming(nc: NowcastFile, now: Date): [string, number][] {
  return nc.steps.filter(([t]) => Date.parse(t) > now.getTime() - 5 * 60_000);
}

export function nowcastText(lang: Lang, steps: [string, number][], tz: string): string {
  if (!steps.length) return '';
  const wet = steps.map(([, r]) => r >= WET);
  const fi = lang === 'fi';
  const peak = Math.max(...steps.map(([, r]) => r));
  const heavy = peak >= 4 ? (fi ? 'runsasta ' : 'heavy ') : '';
  if (!wet.some(Boolean)) return fi ? 'Ei sadetta seuraavan 1,5 tunnin aikana' : 'No precipitation in the next 90 min';
  if (wet[0]) {
    const end = wet.indexOf(false);
    if (end < 0) return fi ? `Sadetta ${heavy ? 'paikoin runsaasti ' : ''}koko seuraavan 1,5 tunnin ajan` : `${heavy ? 'Heavy p' : 'P'}recipitation for the next 90 min`;
    return fi ? `Sade lakkaa noin klo ${time(lang, steps[end][0], tz)}` : `Precipitation ending around ${time(lang, steps[end][0], tz)}`;
  }
  const start = wet.indexOf(true);
  return fi
    ? `${heavy ? 'Runsas sade' : 'Sade'} alkaa noin klo ${time(lang, steps[start][0], tz)}`
    : `${heavy ? 'Heavy precipitation' : 'Precipitation'} starting around ${time(lang, steps[start][0], tz)}`;
}
