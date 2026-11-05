// Cached fetcher for the baked JSON under /wx/data/.
// Each file has a max age; stale entries are refetched, and if a refetch fails
// the last good copy is kept (marked stale) so the screen never goes blank.

import { customForecast } from './customfc';
import type { Place } from './types';
import type { CamsFile, CapitalsFile, AirQualityFile, AuroraFile, AviationFile, ForecastFile, LightningFile, ObsFile, PlacesFile, SeaFile, WarningsFile } from './types';
import type { NowcastFile } from './nowcast';
import type { GridFile } from '../map/grid';
import type { FieldsIndex, WorldIndex } from '../map/raster';
import type { RadarIndex } from '../slides/RadarMap.svelte';
import type { RoadsFile } from '../slides/RoadMap.svelte';

export const DATA_BASE = '/wx/data/';

interface Entry<T> {
  value: T | null;
  fetched: number;
  ok: boolean;
  inflight: Promise<T> | null;
}

const cache = new Map<string, Entry<unknown>>();

export async function load<T>(path: string, maxAgeS: number): Promise<T> {
  let e = cache.get(path) as Entry<T> | undefined;
  const now = Date.now();
  if (e?.value && now - e.fetched < maxAgeS * 1000) return e.value;
  if (e?.inflight) return e.inflight;
  if (!e) {
    e = { value: null, fetched: 0, ok: false, inflight: null };
    cache.set(path, e as Entry<unknown>);
  }
  const entry = e;
  // minute-granular cache buster: nginx sends no Cache-Control for these files
  const url = `${DATA_BASE}${path}?t=${Math.floor(now / 60000)}`;
  entry.inflight = fetch(url)
    .then(async (r) => {
      if (!r.ok) throw new Error(`${r.status} ${path}`);
      const v = (await r.json()) as T;
      entry.value = v;
      entry.fetched = Date.now();
      entry.ok = true;
      return v;
    })
    .catch((err) => {
      entry.ok = false;
      if (entry.value) {
        // retry in a minute, keep serving the old copy meanwhile
        entry.fetched = Date.now() - maxAgeS * 1000 + 60_000;
        return entry.value;
      }
      throw err;
    })
    .finally(() => {
      entry.inflight = null;
    });
  return entry.inflight;
}

/** Returns the cached value synchronously if any (for tickers etc.). */
export function peek<T>(path: string): T | null {
  return (cache.get(path)?.value as T) ?? null;
}

/** Places added with the place search: forecasts come from MET Norway via the browser. */
const customPlaces = new Map<string, Place>();
export function setCustomPlaces(ps: Place[]) {
  customPlaces.clear();
  for (const p of ps) customPlaces.set(p.id, p);
}

export const api = {
  places: () => load<PlacesFile>('places.json', 3600),
  obs: () => load<ObsFile>('obs/fi.json', 300),
  nordicObs: () => load<ObsFile>('obs/nordic.json', 600),
  forecast: (id: string): Promise<ForecastFile> => {
    const p = customPlaces.get(id);
    return p ? customForecast(p, p.tz ?? 'UTC') : load<ForecastFile>(`fc/${id}.json`, 1800);
  },
  aviation: () => load<AviationFile>('aviation.json', 300),
  warnings: () => load<WarningsFile>('warnings/fi.json', 300),
  aurora: () => load<AuroraFile>('aurora.json', 600),
  radar: () => load<RadarIndex>('radar/fi/index.json', 120),
  grid: () => load<GridFile>('grid/fi.json', 1800),
  fields: () => load<FieldsIndex>('fields/fi/index.json', 1800),
  roads: () => load<RoadsFile>('roads/fi.json', 600),
  nowcast: (id: string) => load<NowcastFile>(`nowcast/${id}.json`, 300),
  sea: () => load<SeaFile>('sea/fi.json', 900),
  lightning: () => load<LightningFile>('lightning/fi.json', 120),
  cams: () => load<CamsFile>('cams/fi/index.json', 300),
  world: () => load<WorldIndex>('world/index.json', 1800),
  capitals: () => load<CapitalsFile>('world/capitals.json', 900),
  airquality: () => load<AirQualityFile>('airquality/fi.json', 900),
};
