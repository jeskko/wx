import { describe, expect, it } from 'vitest';
import { forward, inverse, pixel, EXTENTS } from './proj';
import { Grid, type GridFile } from './grid';

describe('TM35FIN', () => {
  it('matches the backend implementation', () => {
    // values printed by backend/wx/proj.py
    const [e, n] = forward(60.1699, 24.9384);
    expect(e).toBeCloseTo(385611.3, 0);
    expect(n).toBeCloseTo(6672118.4, 0);
    const [e2, n2] = forward(65, 35);
    expect(e2).toBeCloseTo(876463.5, 0);
    expect(n2).toBeCloseTo(7232326.9, 0);
  });
  it('round-trips', () => {
    const [la, lo] = inverse(...forward(69.9078, 27.0265));
    expect(la).toBeCloseTo(69.9078, 6);
    expect(lo).toBeCloseTo(27.0265, 6);
  });
  it('maps extent corners to pixel corners', () => {
    const p = pixel(EXTENTS.fi, 700, 640);
    expect(p.fromMap(EXTENTS.fi[0], EXTENTS.fi[3])).toEqual([0, 0]);
    expect(p.fromMap(EXTENTS.fi[2], EXTENTS.fi[1])).toEqual([700, 640]);
  });
});

describe('Grid', () => {
  // 2x2 grid, step 1000 m, one int8 field "t" with scale 0.5 -> values [0, 2, 4, 6] * 0.5
  const b64 = btoa(String.fromCharCode(0, 2, 4, 6));
  const f: GridFile = {
    updated: '', source: '', extent: [0, 0, 1000, 1000], step: 1000, nx: 2, ny: 2, times: ['2026-01-01T00:00:00Z'],
    encoding: { t: { type: 'int8', scale: 0.5 } }, fields: { t: [b64] },
  };
  it('bilinear samples', () => {
    const g = new Grid(f);
    expect(g.sample('t', 0, 0, 0)).toBe(0);
    expect(g.sample('t', 0, 1000, 1000)).toBe(3);
    expect(g.sample('t', 0, 500, 500)).toBe(1.5);
    expect(Number.isNaN(g.sample('t', 0, -1, 0))).toBe(true);
  });
});
