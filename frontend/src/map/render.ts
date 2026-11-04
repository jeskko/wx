import type { Grid } from './grid';
import { pixel } from './proj';

/**
 * Draw an nx*ny image (one pixel per grid node, north row at the top) onto a W*H canvas whose
 * map extent is `ext`, so that each node's pixel centre lands on the node's map position.
 */
export function drawGridImage(
  c2d: CanvasRenderingContext2D,
  small: CanvasImageSource,
  grid: Grid,
  ext: [number, number, number, number],
  W: number,
  H: number,
) {
  const px = pixel(ext, W, H);
  const [gx0, gy0] = [grid.extent[0], grid.extent[1]];
  const s = grid.step;
  const [left, top] = px.fromMap(gx0 - s / 2, gy0 + (grid.ny - 1) * s + s / 2);
  const [right, bottom] = px.fromMap(gx0 + (grid.nx - 1) * s + s / 2, gy0 - s / 2);
  c2d.imageSmoothingEnabled = true;
  c2d.imageSmoothingQuality = 'high';
  c2d.drawImage(small, left, top, right - left, bottom - top);
}

/** Temperature colour scale (°C -> rgb), shared by the temperature map and badges. */
const T_STOPS: [number, [number, number, number]][] = [
  [-30, [120, 60, 200]],
  [-20, [60, 90, 230]],
  [-10, [70, 170, 255]],
  [0, [190, 240, 255]],
  [5, [150, 230, 140]],
  [10, [210, 235, 70]],
  [15, [255, 210, 60]],
  [20, [255, 150, 40]],
  [25, [240, 80, 40]],
  [30, [200, 30, 60]],
];

export function tempRgb(t: number): [number, number, number] {
  if (t <= T_STOPS[0][0]) return T_STOPS[0][1];
  for (let i = 1; i < T_STOPS.length; i++) {
    const [t1, c1] = T_STOPS[i];
    if (t <= t1) {
      const [t0, c0] = T_STOPS[i - 1];
      const f = (t - t0) / (t1 - t0);
      return [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * f)) as [number, number, number];
    }
  }
  return T_STOPS[T_STOPS.length - 1][1];
}

export const T_LEGEND = T_STOPS.map(([t]) => t);
