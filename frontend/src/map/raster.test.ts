import { describe, expect, it } from 'vitest';
import { decodeFrame, decodeWorldFrame } from './raster';

describe('decodeFrame', () => {
  it('decodes channels and flips rows to south-first', () => {
    // 1x2 image: north pixel then south pixel
    const px = new Uint8ClampedArray([
      250, 50, 100, 255, // north: 100 % cloud, 1 mm/h, 0 °C
      255, 0, 0, 255, //    south: no data
    ]);
    const f = decodeFrame(px, 1, 2);
    expect(Number.isNaN(f.cloud[0])).toBe(true); // south row first
    expect(f.cloud[1]).toBeCloseTo(100);
    expect(f.pr[1]).toBeCloseTo(1);
    expect(f.t[1]).toBeCloseTo(0);
  });
});

describe('decodeWorldFrame', () => {
  it('reads the top half as t/pr and the bottom half as wind', () => {
    // nx=1, ny=1: row 0 = fields, row 1 = wind
    const px = new Uint8ClampedArray([130, 100, 0, 255, 138, 118, 0, 255]);
    const f = decodeWorldFrame(px, 1, 1);
    expect(f.t[0]).toBeCloseTo(5);
    expect(f.pr[0]).toBeCloseTo(4);
    expect(f.u[0]).toBeCloseTo(5);
    expect(f.v[0]).toBeCloseTo(-5);
  });
});
