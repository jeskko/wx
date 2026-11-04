import type { ExtentName } from './proj';

export interface Basemap {
  extent: [number, number, number, number];
  width: number; // km
  height: number; // km
  land: string;
  lakes: string;
  borders: string;
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
