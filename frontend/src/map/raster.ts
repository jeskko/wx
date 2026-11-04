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
