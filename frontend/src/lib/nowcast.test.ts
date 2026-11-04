import { describe, expect, it } from 'vitest';
import { nowcastText } from './nowcast';

const mk = (rates: number[]): [string, number][] =>
  rates.map((r, i) => [new Date(Date.UTC(2026, 10, 4, 18, 0) + i * 5 * 60_000).toISOString(), r]);

describe('nowcastText', () => {
  it('dry', () => {
    expect(nowcastText('fi', mk([0, 0, 0]), 'Europe/Helsinki')).toBe('Ei sadetta seuraavan 1,5 tunnin aikana');
  });
  it('starting', () => {
    expect(nowcastText('fi', mk([0, 0, 0.5, 1]), 'Europe/Helsinki')).toBe('Sade alkaa noin klo 20.10');
    expect(nowcastText('en', mk([0, 0, 0.5, 6]), 'Europe/Helsinki')).toBe('Heavy precipitation starting around 20:10');
  });
  it('ending', () => {
    expect(nowcastText('en', mk([1, 1, 0, 0]), 'Europe/Helsinki')).toBe('Precipitation ending around 20:10');
  });
});
