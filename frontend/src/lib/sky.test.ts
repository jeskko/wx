import { describe, expect, it } from 'vitest';
import { activeShowers, horizontal, planet, type PlanetId } from './sky';

// JPL Horizons, observer at 26.0E 63.5N, airless: RA, Dec (J2000, deg), azimuth, elevation, magnitude
const REF: Record<string, Record<PlanetId, [number, number, number, number, number]>> = {
  '2026-11-04T20:00:00Z': {
    mercury: [218.97803, -15.56291, 323.282626, -38.069328, 6.703],
    venus: [200.93652, -13.03235, 345.889024, -39.056775, -4.425],
    mars: [143.1107, 16.35813, 44.283771, -2.528039, 0.848],
    jupiter: [146.93729, 14.05123, 41.502288, -5.883367, -2.024],
    saturn: [9.01936, 0.97771, 180.798654, 27.625988, 0.48],
  },
  '2027-03-15T02:00:00Z': {
    mercury: [328.80694, -13.26359, 86.375703, -16.508208, 0.283],
    venus: [318.58268, -16.09987, 96.844998, -14.491442, -4.005],
    mars: [146.17529, 17.70435, 270.882336, 19.280448, -0.79],
    jupiter: [140.68946, 16.47881, 275.156717, 15.760528, -2.453],
    saturn: [14.07866, 3.58434, 35.983799, -18.105204, 0.761],
  },
};

const angle = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

describe('planet positions vs JPL Horizons', () => {
  for (const [iso, planets] of Object.entries(REF)) {
    for (const [id, [ra, dec, az, alt, mag]] of Object.entries(planets) as [PlanetId, number[]][]) {
      it(`${id} ${iso}`, () => {
        const d = new Date(iso);
        const p = planet(id, d);
        expect(angle((p.ra * 180) / Math.PI, ra)).toBeLessThan(0.3);
        expect(Math.abs((p.dec * 180) / Math.PI - dec)).toBeLessThan(0.3);
        const h = horizontal(p, d);
        // J2000 vs. of-date frame: ~0.35° of precession is fine for a sky chart
        expect(angle(h.az, az)).toBeLessThan(1.5);
        expect(Math.abs(h.alt - alt)).toBeLessThan(0.8);
        expect(Math.abs(p.mag - mag)).toBeLessThan(id === 'mercury' ? 1 : 0.6);
      });
    }
  }
});

describe('meteor showers', () => {
  it('handles the Quadrantids across new year', () => {
    expect(activeShowers(new Date('2027-01-03T20:00:00Z')).map((s) => s.en)).toContain('Quadrantids');
    expect(activeShowers(new Date('2026-12-30T20:00:00Z')).map((s) => s.en)).toContain('Quadrantids');
    expect(activeShowers(new Date('2026-12-14T20:00:00Z'))[0]).toMatchObject({ en: 'Geminids', atPeak: true });
    expect(activeShowers(new Date('2026-09-10T20:00:00Z'))).toEqual([]);
  });
});

describe('suncalc units (2.x: degrees, azimuth from north)', () => {
  it('sun and moon agree with JPL Horizons', async () => {
    const { sunAlt, moonHorizontal } = await import('./sky');
    const d = new Date('2026-11-04T20:00:00Z');
    // Horizons: Moon az 21.965, el -23.423 (airless)
    const m = moonHorizontal(d);
    expect(angle(m.az, 21.965)).toBeLessThan(1.5);
    expect(Math.abs(m.alt - -23.423)).toBeLessThan(1.5);
    // sun well below the horizon at 22:00 local in November
    expect(sunAlt(d)).toBeLessThan(-30);
    expect(sunAlt(d)).toBeGreaterThan(-60);
  });
});
