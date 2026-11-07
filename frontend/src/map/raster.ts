// Loader for data/fields/<extent>/: hourly HARMONIE rasters (5 km) packed into RGB PNGs.
// See backend/wx/sources/fields.py for the encoding. Exposed as a Grid (cloud, pr, t).

import { DATA_BASE } from '../lib/data';
import { Grid, type FieldName } from './grid';

export interface FieldsIndex {
  updated: string;
  origin: string;
  extent: [number, number, number, number];
  step: number;
  nx: number;
  ny: number;
  times: string[];
  files: string[];
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error(url));
    img.src = url;
  });
}

/** Decode one RGB frame into the three fields (south row first, like Grid expects). */
export function decodeFrame(rgba: Uint8ClampedArray, nx: number, ny: number): Record<'cloud' | 'pr' | 't', Float32Array> {
  const n = nx * ny;
  const cloud = new Float32Array(n);
  const pr = new Float32Array(n);
  const t = new Float32Array(n);
  for (let j = 0; j < ny; j++) {
    const row = ny - 1 - j; // image is north row first
    for (let i = 0; i < nx; i++) {
      const o = (row * nx + i) * 4;
      const k = j * nx + i;
      const r = rgba[o];
      if (r === 255) {
        cloud[k] = NaN;
        pr[k] = 0;
        t[k] = NaN;
        continue;
      }
      cloud[k] = r / 2.5;
      const g = rgba[o + 1] / 50;
      pr[k] = g * g;
      t[k] = rgba[o + 2] / 2 - 50;
    }
  }
  return { cloud, pr, t };
}

let cache: { key: string; grid: Grid } | null = null;

/** Load all frames from `fromMs` on (inclusive of the hour before) and wrap them as a Grid. */
export async function loadFields(index: FieldsIndex, fromMs: number, extent = 'fi'): Promise<Grid | null> {
  const keep = index.times.map((t, i) => ({ t, f: index.files[i] })).filter(({ t }) => Date.parse(t) >= fromMs - 3600_000);
  if (keep.length < 2) return null;
  const key = `${index.origin}:${keep[0].t}`;
  if (cache?.key === key) return cache.grid;

  const imgs = await Promise.all(keep.map(({ f }) => loadImage(`${DATA_BASE}fields/${extent}/${f}`)));
  const cv = document.createElement('canvas');
  cv.width = index.nx;
  cv.height = index.ny;
  const c2d = cv.getContext('2d', { willReadFrequently: true })!;
  const frames = imgs.map((img) => {
    c2d.clearRect(0, 0, index.nx, index.ny);
    c2d.drawImage(img, 0, 0);
    return decodeFrame(c2d.getImageData(0, 0, index.nx, index.ny).data, index.nx, index.ny);
  });
  const [x0, y0] = index.extent;
  const half = index.step / 2;
  const grid = new Grid(
    {
      // node = cell centre
      extent: [x0 + half, y0 + half, index.extent[2] - half, index.extent[3] - half],
      step: index.step,
      nx: index.nx,
      ny: index.ny,
      times: keep.map(({ t }) => t),
    },
    (name: FieldName, ti: number) => {
      if (name !== 'cloud' && name !== 'pr' && name !== 't') throw new Error(`no ${name} in fields`);
      return frames[ti][name];
    },
    ['cloud', 'pr', 't'],
  );
  cache = { key, grid };
  return grid;
}

// ---------------------------------------------------------------- tropo index (HARMONIE model levels)
// See backend/wx/sources/tropo.py: R = index × 25 (255 = no data), G = duct top / 10 m.

export type TropoIndex = FieldsIndex;

export function decodeTropoFrame(rgba: Uint8ClampedArray, nx: number, ny: number): Record<'tropo' | 'ductTop', Float32Array> {
  const n = nx * ny;
  const tropo = new Float32Array(n);
  const ductTop = new Float32Array(n);
  for (let j = 0; j < ny; j++) {
    const row = ny - 1 - j; // image is north row first
    for (let i = 0; i < nx; i++) {
      const o = (row * nx + i) * 4;
      const k = j * nx + i;
      const r = rgba[o];
      tropo[k] = r === 255 ? NaN : r / 25;
      ductTop[k] = r === 255 ? NaN : rgba[o + 1] * 10;
    }
  }
  return { tropo, ductTop };
}

let tropoCache: { key: string; grid: Grid } | null = null;

/** All tropo frames from the one before `fromMs` on, as a Grid with fields 'tropo' and 'ductTop'. */
export async function loadTropo(index: TropoIndex, fromMs: number, extent = 'nordic'): Promise<Grid | null> {
  const all = index.times.map((t, i) => ({ t, f: index.files[i] }));
  const first = Math.max(0, all.findIndex(({ t }) => Date.parse(t) > fromMs) - 1);
  const keep = all.slice(first);
  if (keep.length < 2) return null;
  const key = `${index.origin}:${keep[0].t}`;
  if (tropoCache?.key === key) return tropoCache.grid;

  const imgs = await Promise.all(keep.map(({ f }) => loadImage(`${DATA_BASE}tropo/${extent}/${f}`)));
  const cv = document.createElement('canvas');
  cv.width = index.nx;
  cv.height = index.ny;
  const c2d = cv.getContext('2d', { willReadFrequently: true })!;
  const frames = imgs.map((img) => {
    c2d.clearRect(0, 0, index.nx, index.ny);
    c2d.drawImage(img, 0, 0);
    return decodeTropoFrame(c2d.getImageData(0, 0, index.nx, index.ny).data, index.nx, index.ny);
  });
  const [x0, y0] = index.extent;
  const half = index.step / 2;
  const grid = new Grid(
    {
      extent: [x0 + half, y0 + half, index.extent[2] - half, index.extent[3] - half],
      step: index.step,
      nx: index.nx,
      ny: index.ny,
      times: keep.map(({ t }) => t),
    },
    (name: FieldName, ti: number) => {
      if (name !== 'tropo' && name !== 'ductTop') throw new Error(`no ${name} in tropo`);
      return frames[ti][name];
    },
    ['tropo', 'ductTop'],
  );
  tropoCache = { key, grid };
  return grid;
}

// ---------------------------------------------------------------- world views (ECMWF)

export interface WorldView {
  proj: { type: 'laea'; lat0: number; lon0: number };
  extent: [number, number, number, number];
  step: number;
  nx: number;
  ny: number;
  times: string[];
  files: string[];
}

export interface WorldIndex {
  updated: string;
  origin: string;
  views: Record<string, WorldView>;
}

/** Decode a double-height world frame (see backend/wx/sources/world.py). South row first. */
export function decodeWorldFrame(rgba: Uint8ClampedArray, nx: number, ny: number): Record<'t' | 'pr' | 'u' | 'v', Float32Array> {
  const n = nx * ny;
  const t = new Float32Array(n);
  const pr = new Float32Array(n);
  const u = new Float32Array(n);
  const v = new Float32Array(n);
  for (let j = 0; j < ny; j++) {
    const row = ny - 1 - j;
    for (let i = 0; i < nx; i++) {
      const o = (row * nx + i) * 4;
      const w = ((row + ny) * nx + i) * 4;
      const k = j * nx + i;
      if (rgba[o] === 255) {
        t[k] = NaN;
        continue;
      }
      t[k] = rgba[o] / 2 - 60;
      const g = rgba[o + 1] / 50;
      pr[k] = g * g;
      u[k] = rgba[w] / 2 - 64;
      v[k] = rgba[w + 1] / 2 - 64;
    }
  }
  return { t, pr, u, v };
}

const worldGrids = new Map<string, { key: string; grid: Grid }>();

/** Frames of a world view from the step before `fromMs` on, as a Grid with t, pr, u, v. */
export async function loadWorldGrid(id: string, view: WorldView, origin: string, fromMs: number): Promise<Grid | null> {
  let first = 0;
  view.times.forEach((t, i) => {
    if (Date.parse(t) <= fromMs) first = i;
  });
  const keep = view.times.map((t, i) => ({ t, f: view.files[i] })).slice(first);
  if (keep.length < 2) return null;
  const key = `${origin}:${keep[0].t}`;
  const hit = worldGrids.get(id);
  if (hit?.key === key) return hit.grid;
  const imgs = await Promise.all(keep.map(({ f }) => loadImage(`${DATA_BASE}world/${id}/${f}`)));
  const cv = document.createElement('canvas');
  cv.width = view.nx;
  cv.height = view.ny * 2;
  const c2d = cv.getContext('2d', { willReadFrequently: true })!;
  const frames = imgs.map((img) => {
    c2d.clearRect(0, 0, cv.width, cv.height);
    c2d.drawImage(img, 0, 0);
    return decodeWorldFrame(c2d.getImageData(0, 0, cv.width, cv.height).data, view.nx, view.ny);
  });
  const half = view.step / 2;
  const [x0, y0, x1, y1] = view.extent;
  const grid = new Grid(
    { extent: [x0 + half, y0 + half, x1 - half, y1 - half], step: view.step, nx: view.nx, ny: view.ny, times: keep.map(({ t }) => t) },
    (name: FieldName, ti: number) => {
      if (name !== 't' && name !== 'pr' && name !== 'u' && name !== 'v') throw new Error(`no ${name} in world fields`);
      return frames[ti][name];
    },
    ['t', 'pr', 'u', 'v'],
  );
  // keep a handful of views decoded; drop the oldest
  if (worldGrids.size > 6) worldGrids.delete(worldGrids.keys().next().value!);
  worldGrids.set(id, { key, grid });
  return grid;
}
