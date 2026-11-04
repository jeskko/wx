import { describe, expect, it } from 'vitest';
import { decodeFrame } from './raster';

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
