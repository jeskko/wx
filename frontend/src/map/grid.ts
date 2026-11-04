// Decoder + sampler for data/grid/<extent>.json (see backend/wx/sources/grid.py).

export interface GridFile {
  updated: string;
  source: string;
  extent: [number, number, number, number];
  step: number;
  nx: number;
  ny: number;
  times: string[];
  encoding: Record<string, { type: 'int8' | 'uint8'; scale: number }>;
  fields: Record<string, string[]>;
}

export type FieldName = 'u' | 'v' | 'cloud' | 'pr' | 't';

export class Grid {
  readonly nx: number;
  readonly ny: number;
  readonly times: number[];
  readonly extent: [number, number, number, number];
  readonly step: number;
  private cache = new Map<string, Float32Array>();

  constructor(private f: GridFile) {
    this.nx = f.nx;
    this.ny = f.ny;
    this.extent = f.extent;
    this.step = f.step;
    this.times = f.times.map((t) => Date.parse(t));
  }

  /** Values of a field at time index ti, row-major with the south row first. */
  field(name: FieldName, ti: number): Float32Array {
    const key = `${name}:${ti}`;
    let a = this.cache.get(key);
    if (!a) {
      const enc = this.f.encoding[name];
      const bin = atob(this.f.fields[name][ti]);
      const raw = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
      const typed = enc.type === 'int8' ? new Int8Array(raw.buffer) : raw;
      a = new Float32Array(typed.length);
      for (let i = 0; i < typed.length; i++) a[i] = typed[i] * enc.scale;
      this.cache.set(key, a);
    }
    return a;
  }

  /** Fractional time index for a timestamp (clamped). */
  timeIndex(ms: number): number {
    const ts = this.times;
    if (ms <= ts[0]) return 0;
    if (ms >= ts[ts.length - 1]) return ts.length - 1;
    let i = 0;
    while (ts[i + 1] < ms) i++;
    return i + (ms - ts[i]) / (ts[i + 1] - ts[i]);
  }

  /** Bilinear sample at map coordinates (metres) and fractional time index. NaN outside. */
  sample(name: FieldName, tf: number, e: number, nm: number): number {
    const gx = (e - this.extent[0]) / this.step;
    const gy = (nm - this.extent[1]) / this.step;
    if (gx < 0 || gy < 0 || gx > this.nx - 1 || gy > this.ny - 1) return NaN;
    const t0 = Math.floor(tf);
    const t1 = Math.min(this.times.length - 1, t0 + 1);
    const ft = tf - t0;
    const a = this.bilinear(this.field(name, t0), gx, gy);
    if (ft === 0 || t1 === t0) return a;
    return a + (this.bilinear(this.field(name, t1), gx, gy) - a) * ft;
  }

  private bilinear(arr: Float32Array, gx: number, gy: number): number {
    const i = Math.min(this.nx - 2, Math.floor(gx));
    const j = Math.min(this.ny - 2, Math.floor(gy));
    const fx = gx - i;
    const fy = gy - j;
    const k = j * this.nx + i;
    const a = arr[k];
    const b = arr[k + 1];
    const c = arr[k + this.nx];
    const d = arr[k + this.nx + 1];
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  }
}
