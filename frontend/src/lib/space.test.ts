import { describe, expect, it } from 'vitest';
import { biggestFlare, flareClass, flareRank, protonLevel, seriesAt, seriesLast, xrayLevel } from './space';

describe('flare classes', () => {
  it('converts flux to class and back', () => {
    expect(flareClass(Math.log10(2.4e-5))).toBe('M2.4');
    expect(flareClass(Math.log10(1.3e-6))).toBe('C1.3');
    expect(flareClass(Math.log10(1.2e-3))).toBe('X12.0');
    expect(flareClass(-8.5)).toBe('A0.3');
    expect(flareRank('M2.4')).toBeCloseTo(Math.log10(2.4e-5), 9);
    expect(flareRank('X1.0')).toBeGreaterThan(flareRank('M9.9'));
  });
  it('maps to NOAA R and S levels', () => {
    expect([1e-6, 1e-5, 5e-5, 1e-4, 1e-3, 3e-3].map((f) => xrayLevel(Math.log10(f)))).toEqual([0, 1, 2, 3, 4, 5]);
    expect([null, -1, 1, 2.5, 6].map((v) => protonLevel(v))).toEqual([0, 0, 1, 2, 5]);
  });
  it('picks the biggest flare in a window', () => {
    const fl = [
      { begin: null, end: null, max: '2026-11-07T10:00:00Z', cls: 'C9.0' },
      { begin: null, end: null, max: '2026-11-06T10:00:00Z', cls: 'M1.0' },
      { begin: null, end: null, max: '2026-11-01T10:00:00Z', cls: 'X1.0' },
    ];
    expect(biggestFlare(fl, Date.parse('2026-11-05T00:00:00Z'), Date.parse('2026-11-08T00:00:00Z'))?.cls).toBe('M1.0');
    expect(biggestFlare(fl, Date.parse('2026-11-08T00:00:00Z'), Date.parse('2026-11-09T00:00:00Z'))).toBeNull();
  });
});

describe('series', () => {
  const s = { start: '2026-11-07T10:00:00Z', step: 5, log: [-6, null, -5.5, null] };
  it('looks up by time and finds the last value', () => {
    expect(seriesAt(s, Date.parse('2026-11-07T10:12:00Z'))).toBe(-5.5);
    expect(seriesAt(s, Date.parse('2026-11-07T09:59:00Z'))).toBeNull();
    expect(seriesLast(s)).toEqual({ t: Date.parse('2026-11-07T10:10:00Z'), v: -5.5 });
    expect(seriesLast(null)).toBeNull();
  });
});
