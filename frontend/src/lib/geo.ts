// Place search over the baked GeoNames lists (backend/wx/sources/geonames.py):
// geo/<first two letters of the folded name>.json, rows sorted by population.

import { load } from './data';
import type { Place } from './types';

/** [geonameid, name, lat, lon, country, admin1, population, timezone, finnish name or ""] */
export type GeoRow = [number, string, number, number, string, string, number, string, string];

const SPECIAL: Record<string, string> = { ø: 'o', æ: 'ae', ß: 'ss', ð: 'd', þ: 'th', ł: 'l', đ: 'd' };

/** Same folding as the backend: lower case, no diacritics ('Jyväskylä' -> 'jyvaskyla'). */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[øæßðþłđ]/g, (c) => SPECIAL[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '');
}

export function shardKey(q: string): string | null {
  const k = fold(q).replace(/[^a-z]/g, '').slice(0, 2);
  return k.length === 2 ? k : null;
}

export const CUSTOM_PREFIX = 'geo-';
export const isCustom = (id: string) => id.startsWith(CUSTOM_PREFIX);

export function rowToPlace(r: GeoRow): Place {
  const [id, name, lat, lon, cc, , , tz, fi] = r;
  return { id: `${CUSTOM_PREFIX}${id}`, name: { fi: fi || name, en: name }, lat, lon, country: cc, region: 'custom', icao: null, tz };
}

/** Rows whose name (or Finnish name) starts with the query; most populous first. */
export function matchRows(rows: GeoRow[], q: string, limit = 12): GeoRow[] {
  const f = fold(q.trim());
  const hits = rows.filter((r) => fold(r[1]).startsWith(f) || (r[8] && fold(r[8]).startsWith(f)));
  // exact names first, then by population (rows come sorted by population)
  hits.sort((a, b) => Number(fold(b[1]) === f || fold(b[8]) === f) - Number(fold(a[1]) === f || fold(a[8]) === f));
  return hits.slice(0, limit);
}

export async function searchPlaces(q: string): Promise<GeoRow[]> {
  const key = shardKey(q);
  if (!key) return [];
  try {
    return matchRows(await load<GeoRow[]>(`geo/${key}.json`, 7 * 86400), q);
  } catch {
    return []; // no such shard
  }
}
