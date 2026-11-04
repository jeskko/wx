// Spherical Lambert azimuthal equal-area projection for world views. Mirrors backend/wx/laea.py.

const R = 6371008.8;
const D = Math.PI / 180;

export interface LaeaSpec {
  type: 'laea';
  lat0: number;
  lon0: number;
}

export function laea(spec: { lat0: number; lon0: number }) {
  const s0 = Math.sin(spec.lat0 * D);
  const c0 = Math.cos(spec.lat0 * D);
  const l0 = spec.lon0 * D;
  return {
    forward(lat: number, lon: number): [number, number] {
      const p = lat * D;
      const dl = lon * D - l0;
      const sp = Math.sin(p);
      const cp = Math.cos(p);
      const cd = Math.cos(dl);
      const den = 1 + s0 * sp + c0 * cp * cd;
      const k = den > 1e-12 ? Math.sqrt(2 / den) : 0;
      return [R * k * cp * Math.sin(dl), R * k * (c0 * sp - s0 * cp * cd)];
    },
    inverse(x: number, y: number): [number, number] {
      const rho = Math.hypot(x, y);
      if (rho < 1e-9) return [spec.lat0, spec.lon0];
      const c = 2 * Math.asin(Math.min(1, rho / (2 * R)));
      const sc = Math.sin(c);
      const cc = Math.cos(c);
      const lat = Math.asin(Math.max(-1, Math.min(1, cc * s0 + (y * sc * c0) / rho)));
      const lon = l0 + Math.atan2(x * sc, rho * c0 * cc - y * s0 * sc);
      return [lat / D, ((((lon / D + 540) % 360) + 360) % 360) - 180];
    },
  };
}
