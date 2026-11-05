import { describe, expect, it } from 'vitest';
import { fitLoop, GRACE_MS, LEAD_MS, loopFraction } from './loop';

describe('fitLoop', () => {
  const total = (s: number, p: ReturnType<typeof fitLoop>) => p.loops * (p.play + p.hold);
  it('fills the slide exactly with whole passes', () => {
    for (const [slide, play, hold] of [[12, 10000, 1500], [13, 9000, 1500], [14, 4560, 2200], [12, 8800, 2200], [30, 10000, 1500], [5, 10000, 1500]]) {
      const p = fitLoop(slide, play, hold);
      expect(total(slide, p)).toBeCloseTo(Math.max(2000, slide * 1000 - LEAD_MS), 6);
      expect(p.hold).toBeLessThanOrEqual(hold);
    }
  });
  it('picks the nearest number of passes', () => {
    expect(fitLoop(12, 10000, 1500).loops).toBe(1); // 11.3 s: one slightly slower pass
    expect(fitLoop(14, 4560, 2200).loops).toBe(2); // radar: two passes instead of 1.97
    expect(fitLoop(30, 10000, 1500).loops).toBe(3);
  });
});

describe('loopFraction', () => {
  it('holds the last frame after the planned passes, then loops again', () => {
    const p = fitLoop(12, 10000, 1500); // one pass of ~10.25 s + 1.5 s hold
    expect(loopFraction(0, p)).toBe(0);
    expect(loopFraction(p.play / 2, p)).toBeCloseTo(0.5, 6);
    expect(loopFraction(p.play + p.hold + 500, p)).toBe(1); // slide overran: still holding
    expect(loopFraction(p.play + p.hold + GRACE_MS + 10, p)).toBeLessThan(0.01); // paused: loops again
  });
});
