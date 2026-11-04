// ETRS-TM35FIN (EPSG:3067) transverse Mercator, Krüger series. Mirrors backend/wx/proj.py.

const A = 6378137.0;
const F = 1 / 298.257222101;
const LON0 = (27 * Math.PI) / 180;
const K0 = 0.9996;
const FE = 500000;

const n = F / (2 - F);
const AA = (A / (1 + n)) * (1 + n ** 2 / 4 + n ** 4 / 64);
const ALPHA = [n / 2 - (2 / 3) * n ** 2 + (5 / 16) * n ** 3, (13 / 48) * n ** 2 - (3 / 5) * n ** 3, (61 / 240) * n ** 3];
const BETA = [n / 2 - (2 / 3) * n ** 2 + (37 / 96) * n ** 3, (1 / 48) * n ** 2 + (1 / 15) * n ** 3, (17 / 480) * n ** 3];
const DELTA = [2 * n - (2 / 3) * n ** 2 - 2 * n ** 3, (7 / 3) * n ** 2 - (8 / 5) * n ** 3, (56 / 15) * n ** 3];
const E2N = (2 * Math.sqrt(n)) / (1 + n);

/** (lat, lon) degrees -> [E, N] metres */
export function forward(lat: number, lon: number): [number, number] {
  const phi = (lat * Math.PI) / 180;
  const dl = (lon * Math.PI) / 180 - LON0;
  const t = Math.sinh(Math.atanh(Math.sin(phi)) - E2N * Math.atanh(E2N * Math.sin(phi)));
  const xi = Math.atan2(t, Math.cos(dl));
  const eta = Math.atanh(Math.sin(dl) / Math.sqrt(1 + t * t));
  let e = eta;
  let nn = xi;
  for (let j = 1; j <= 3; j++) {
    e += ALPHA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
    nn += ALPHA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
  }
  return [FE + K0 * AA * e, K0 * AA * nn];
}

/** [E, N] metres -> [lat, lon] degrees */
export function inverse(e: number, nm: number): [number, number] {
  const xi = nm / (K0 * AA);
  const eta = (e - FE) / (K0 * AA);
  let xi_ = xi;
  let eta_ = eta;
  for (let j = 1; j <= 3; j++) {
    xi_ -= BETA[j - 1] * Math.sin(2 * j * xi) * Math.cosh(2 * j * eta);
    eta_ -= BETA[j - 1] * Math.cos(2 * j * xi) * Math.sinh(2 * j * eta);
  }
  const chi = Math.asin(Math.sin(xi_) / Math.cosh(eta_));
  let phi = chi;
  for (let j = 1; j <= 3; j++) phi += DELTA[j - 1] * Math.sin(2 * j * chi);
  const lam = LON0 + Math.atan2(Math.sinh(eta_), Math.cos(xi_));
  return [(phi * 180) / Math.PI, (lam * 180) / Math.PI];
}

export type ExtentName = 'fi' | 'nordic';
export type Extent = [number, number, number, number]; // xmin, ymin, xmax, ymax (m)

export const EXTENTS: Record<ExtentName, Extent> = {
  fi: [-280000, 6560000, 1120000, 7840000],
  nordic: [-900000, 6150000, 1500000, 8050000],
};

/** Pixel transform for an extent drawn into a w x h box (y down). */
export function pixel(ext: Extent, w: number, h: number) {
  const [x0, y0, x1, y1] = ext;
  const sx = w / (x1 - x0);
  const sy = h / (y1 - y0);
  return {
    fromMap: (e: number, nm: number): [number, number] => [(e - x0) * sx, (y1 - nm) * sy],
    toMap: (px: number, py: number): [number, number] => [x0 + px / sx, y1 - py / sy],
    fromLatLon(lat: number, lon: number): [number, number] {
      const [e, nm] = forward(lat, lon);
      return [(e - x0) * sx, (y1 - nm) * sy];
    },
  };
}
