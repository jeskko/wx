import { forward, type ExtentName, type Forward } from './proj';
import { laea, type LaeaSpec } from './laea';

export interface Basemap {
  extent: [number, number, number, number];
  width: number; // km
  height: number; // km
  land: string;
  lakes: string;
  borders: string;
  /** projection; absent = ETRS-TM35FIN (EPSG:3067) */
  proj?: LaeaSpec;
}

/** lat/lon -> map metres for a basemap's projection. */
export function projector(b: Basemap): Forward {
  return b.proj ? laea(b.proj).forward : forward;
}

const worldFiles = import.meta.glob<{ default: unknown }>('./world/*.json');
const worldCache = new Map<string, Promise<Basemap | null>>();

/** Basemap of a world view (region id or `cap-<capital id>`), or null if none was built. */
export function loadWorldBasemap(id: string): Promise<Basemap | null> {
  let p = worldCache.get(id);
  if (!p) {
    const imp = worldFiles[`./world/${id}.json`];
    p = imp ? imp().then((m) => m.default as Basemap) : Promise.resolve(null);
    worldCache.set(id, p);
  }
  return p;
}

const cache = new Map<ExtentName, Promise<Basemap>>();

/** Lazy-load the (100 kB-ish) basemap so the main bundle stays small. */
export function loadBasemap(name: ExtentName): Promise<Basemap> {
  let p = cache.get(name);
  if (!p) {
    p = (name === 'fi' ? import('./basemap-fi.json') : import('./basemap-nordic.json')).then((m) => m.default as unknown as Basemap);
    cache.set(name, p);
  }
  return p;
}

/** Pixel size of a map that fills `height` px. */
export function mapSize(b: Basemap, height = 520): { w: number; h: number } {
  return { w: Math.round((height * b.width) / b.height), h: height };
}
