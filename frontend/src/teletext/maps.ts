// Mosaic maps from the SVG basemaps: the land path is drawn on a hidden canvas and sampled down
// to the 2×3 pixels per cell of teletext block graphics. A country is cut out by flood-filling
// from seed cities with the borders drawn as walls (the basemaps have no per-country polygons).

import type { Basemap } from '../map/basemap';
import { projector } from '../map/basemap';
import { Bitmap } from './page';

/** Display aspect of a sextant pixel (width / height) on a 4:3 screen: cells are 0.833 wide. */
export const PX_ASPECT = 1.25;

export interface MosaicMap {
  /** pixel size */
  w: number;
  h: number;
  /** 1 = land of the cut-out country (or all land), 2 = other land, 0 = sea */
  kind: Uint8Array;
  /** lat/lon -> pixel coordinates (fractional) */
  px(lat: number, lon: number): [number, number];
  /** map metres -> pixel */
  fromMap(e: number, n: number): [number, number];
  /** pixel centre -> map metres */
  toMap(x: number, y: number): [number, number];
}

export interface MapView {
  /** map extent in metres [x0, y0, x1, y1] to fit */
  extent: [number, number, number, number];
  /** pixel box to fit it into (aspect is kept: pixels are PX_ASPECT wide) */
  maxW: number;
  maxH: number;
  /** cities (lat, lon) inside the country to cut out; none = all land is kind 1 */
  seeds?: [number, number][];
}

const SS = 6; // supersampling per pixel

export function rasterize(base: Basemap, v: MapView): MosaicMap {
  const [x0, y0, x1, y1] = v.extent;
  const kmW = (x1 - x0) / 1000;
  const kmH = (y1 - y0) / 1000;
  // km per pixel vertically; a pixel is PX_ASPECT times as wide
  const kpp = Math.max(kmH / v.maxH, kmW / (v.maxW * PX_ASPECT));
  const w = Math.round(kmW / (kpp * PX_ASPECT));
  const h = Math.round(kmH / kpp);
  const W = w * SS;
  const H = h * SS;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true })!;
  // basemap path units are km from the basemap's top-left corner
  const sx = W / kmW;
  const sy = H / kmH;
  const ox = (base.extent[0] - x0) / 1000;
  const oy = (y1 - base.extent[3]) / 1000;
  g.setTransform(sx, 0, 0, sy, ox * sx, oy * sy);
  g.fillStyle = '#fff';
  g.fill(new Path2D(base.land), 'evenodd');
  if (v.seeds?.length) {
    g.strokeStyle = '#000';
    g.lineWidth = 2.5 / sx; // a few hi-res pixels: a wall the flood fill can't leak through
    g.stroke(new Path2D(base.borders));
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  const img = g.getImageData(0, 0, W, H).data;
  const land = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) land[i] = img[i * 4] > 127 ? 1 : 0;

  const fwd = projector(base);
  const fromMap = (e: number, n: number): [number, number] => [((e - x0) / 1000 / kmW) * w, ((y1 - n) / 1000 / kmH) * h];
  const toMap = (x: number, y: number): [number, number] => [x0 + ((x + 0.5) / w) * kmW * 1000, y1 - ((y + 0.5) / h) * kmH * 1000];
  const px = (lat: number, lon: number) => {
    const [e, n] = fwd(lat, lon);
    return fromMap(e, n);
  };

  // flood fill the country from its seeds (scanline-free BFS on the hi-res mask)
  let inside: Uint8Array | null = null;
  if (v.seeds?.length) {
    inside = new Uint8Array(W * H);
    const stack: number[] = [];
    for (const [la, lo] of v.seeds) {
      const [fx, fy] = px(la, lo);
      // the seed may sit on a coast or lake pixel: search a little for land
      let found = -1;
      for (let d = 0; d < SS * 3 && found < 0; d++)
        for (let dy = -d; dy <= d && found < 0; dy++)
          for (let dx = -d; dx <= d && found < 0; dx++) {
            const X = Math.round(fx * SS) + dx;
            const Y = Math.round(fy * SS) + dy;
            if (X >= 0 && Y >= 0 && X < W && Y < H && land[Y * W + X]) found = Y * W + X;
          }
      if (found >= 0) stack.push(found);
    }
    while (stack.length) {
      const k = stack.pop()!;
      if (inside[k] || !land[k]) continue;
      inside[k] = 1;
      const X = k % W;
      if (X > 0) stack.push(k - 1);
      if (X < W - 1) stack.push(k + 1);
      if (k >= W) stack.push(k - W);
      if (k < W * (H - 1)) stack.push(k + W);
    }
  }

  const kind = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let l = 0;
      let c = 0;
      for (let j = 0; j < SS; j++)
        for (let i = 0; i < SS; i++) {
          const k = (y * SS + j) * W + x * SS + i;
          l += land[k];
          if (inside) c += inside[k];
        }
      const n = SS * SS;
      if (inside && c > n * 0.3) kind[y * w + x] = 1;
      else if (l > n * 0.45) kind[y * w + x] = inside ? 2 : 1;
    }
  return { w, h, kind, px, fromMap, toMap };
}

/** Pixels of kind `k` that touch a pixel of another kind (4-neighbourhood): an outline. */
export function outline(m: MosaicMap, k = 1): Uint8Array {
  const out = new Uint8Array(m.w * m.h);
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      if (m.kind[y * m.w + x] !== k) continue;
      // outside the picture counts as the same kind: the frame edge is not a coast
      const nb = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= m.w || yy >= m.h ? k : m.kind[yy * m.w + xx]);
      if (nb(x - 1, y) !== k || nb(x + 1, y) !== k || nb(x, y - 1) !== k || nb(x, y + 1) !== k) out[y * m.w + x] = 1;
    }
  return out;
}

/** Bitmap of the map in the given colours (0 = leave black). */
export function toBitmap(m: MosaicMap, colour: (kind: number, x: number, y: number) => number): Bitmap {
  const bm = new Bitmap(m.w, m.h);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) bm.px[y * m.w + x] = colour(m.kind[y * m.w + x], x, y);
  return bm;
}

/** Clear pixels of `colourToClear` in any cell that has (or sits beside) a cell with `keep`
 *  pixels, so a black cell separates the two colours: that cell can then hold the colour
 *  attribute without eating into the map (and reads as a border). */
export function separate(bm: Bitmap, keep: number, colourToClear: number): void {
  const cw = Math.ceil(bm.w / 2);
  const chh = Math.ceil(bm.h / 3);
  const has = (cx: number, cy: number, c: number) => {
    for (let j = 0; j < 3; j++) for (let i = 0; i < 2; i++) if (bm.get(cx * 2 + i, cy * 3 + j) === c) return true;
    return false;
  };
  const clear: [number, number][] = [];
  for (let cy = 0; cy < chh; cy++)
    for (let cx = 0; cx < cw; cx++)
      if (has(cx, cy, colourToClear) && (has(cx, cy, keep) || has(cx - 1, cy, keep) || has(cx + 1, cy, keep))) clear.push([cx, cy]);
  for (const [cx, cy] of clear)
    for (let j = 0; j < 3; j++)
      for (let i = 0; i < 2; i++) {
        const x = cx * 2 + i;
        const y = cy * 3 + j;
        if (bm.get(x, y) === colourToClear) bm.px[y * bm.w + x] = 0;
      }
}
