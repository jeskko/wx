import { describe, expect, it } from 'vitest';
import { ES_BANDS, auroraLevel, esChance, esGamma, esPathLength, foEsCurve, meteorNow, pctExceeding, requiredFoEs, showerZhr, METEOR_SHOWERS } from './vhf';

describe('ITU-R P.534 sporadic-E formulas', () => {
  it('reproduces Fig. 1 magnitudes', () => {
    // at f/foEs = 5 around 1600 km the chart shows roughly 20 dB, at 8 roughly 50 dB
    expect(esGamma(1600, 5)).toBeGreaterThan(17);
    expect(esGamma(1600, 5)).toBeLessThan(25);
    expect(esGamma(1600, 8)).toBeGreaterThan(45);
    expect(esGamma(1600, 8)).toBeLessThan(58);
    // two hops: 2.6 × the one-hop value at half the distance
    expect(esGamma(3200, 3)).toBeCloseTo(2.6 * esGamma(1600, 3), 6);
  });
  it('path length grows with distance and exceeds the ground distance', () => {
    expect(esPathLength(1000)).toBeGreaterThan(1000);
    expect(esPathLength(2000)).toBeGreaterThan(esPathLength(1000));
  });
  it('needs a higher foEs for higher bands', () => {
    const [b6, b4, b2] = ES_BANDS.map((b) => requiredFoEs(b.mhz, 1500));
    expect(b6).toBeLessThan(b4);
    expect(b4).toBeLessThan(b2);
    expect(b6).toBeGreaterThan(5);
    expect(b6).toBeLessThan(11);
    expect(b2).toBeGreaterThanOrEqual(144.3 / 8); // validity limit f/foEs ≤ 8
  });
});

describe('Fig. 7 climatology (Europe)', () => {
  it('hits the chart points at block centres', () => {
    expect(foEsCurve(14, true)[0]).toBeCloseTo(13.1, 6);
    expect(pctExceeding(13.1, 14, true)).toBeCloseTo(0.1, 6);
    expect(pctExceeding(6.8, 14, true)).toBeCloseTo(5, 6);
  });
  it('interpolates across midnight', () => {
    const c = foEsCurve(0, true)[0];
    expect(c).toBeGreaterThan(8.7);
    expect(c).toBeLessThan(10.7);
  });
  it('summer midday beats a winter night, and probabilities fall with frequency', () => {
    const six = ES_BANDS[0];
    const summer = esChance(six, 1500, 16.5, new Date('2026-06-20T11:00:00Z'));
    const winter = esChance(six, 1500, 16.5, new Date('2026-11-07T01:00:00Z'));
    expect(summer).toBeGreaterThan(3);
    expect(summer).toBeLessThan(10);
    expect(winter).toBeLessThan(summer / 10);
    const t = new Date('2026-06-20T11:00:00Z');
    const [p6, p4, p2] = ES_BANDS.map((b) => esChance(b, 1500, 16.5, t));
    expect(p6).toBeGreaterThan(p4);
    expect(p4).toBeGreaterThan(p2);
    expect(p2).toBeLessThan(0.01);
  });
});

describe('meteor scatter', () => {
  it('peaks with showers and is quiet on a November evening', () => {
    expect(meteorNow(new Date('2026-12-14T02:00:00Z'), 55.5, 16.5).level).toBe(3);
    expect(meteorNow(new Date('2026-11-07T17:00:00Z'), 55.5, 16.5).level).toBe(0);
    const pers = meteorNow(new Date('2026-08-12T23:00:00Z'), 55.5, 16.5);
    expect(pers.showers[0].s.en).toBe('Perseids');
  });
  it('shower ZHR falls off from the peak and wraps over the new year', () => {
    const q = METEOR_SHOWERS.find((s) => s.en === 'Quadrantids')!;
    expect(showerZhr(q, new Date('2026-01-03T12:00:00Z'))).toBeCloseTo(80, 6);
    expect(showerZhr(q, new Date('2026-01-10T12:00:00Z'))).toBe(0);
    const gem = METEOR_SHOWERS.find((s) => s.en === 'Geminids')!;
    expect(showerZhr(gem, new Date('2026-12-15T12:00:00Z'))).toBeLessThan(showerZhr(gem, new Date('2026-12-14T12:00:00Z')));
  });
});

describe('radio aurora rule of thumb', () => {
  it('maps Kp to levels', () => {
    expect([null, 2, 4, 5, 7].map((k) => auroraLevel(k))).toEqual([0, 0, 1, 2, 3]);
    // thirds: 4.67 ("5−") shows as 5 and is classified as 5
    expect(auroraLevel(4.67)).toBe(2);
    expect(auroraLevel(3.33)).toBe(0);
  });
});
