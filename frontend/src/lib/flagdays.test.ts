import { describe, expect, it } from 'vitest';
import { flagDays, flagDaysOn } from './flagdays';

const on = (y: number) => new Map(flagDays(y).map((f) => [f.name.en, f.date]));

describe('flag days', () => {
  it('computes the moving days', () => {
    const d26 = on(2026);
    expect(d26.get("Mother's Day")).toBe('2026-05-10');
    expect(d26.get('Remembrance Day')).toBe('2026-05-17');
    expect(d26.get('Midsummer Day, Day of the Finnish Flag')).toBe('2026-06-20');
    expect(d26.get('Finnish Nature Day')).toBe('2026-08-29');
    expect(d26.get("Father's Day")).toBe('2026-11-08');
    expect(on(2025).get('Midsummer Day, Day of the Finnish Flag')).toBe('2025-06-21');
    expect(on(2024).get("Father's Day")).toBe('2024-11-10');
  });
  it('has 7 official + 16 established days in a year without elections', () => {
    const fs = flagDays(2026);
    expect(fs.filter((f) => f.official)).toHaveLength(7);
    expect(fs.filter((f) => !f.official)).toHaveLength(16);
  });
  it('adds elections by the election act', () => {
    expect(on(2027).get('Parliamentary elections')).toBe('2027-04-18');
    expect(on(2029).get('Municipal and regional elections')).toBe('2029-04-08');
    expect(on(2025).get('Municipal and regional elections')).toBeUndefined();
    expect(on(2030).get('Presidential election')).toBe('2030-01-27');
    expect(on(2030).get('Presidential inauguration')).toBe('2030-03-01');
  });
  it('uses the Finnish calendar date', () => {
    expect(flagDaysOn(new Date('2026-12-05T22:30:00Z')).map((f) => f.name.fi)).toEqual(['Itsenäisyyspäivä']); // 00:30 in Helsinki
    expect(flagDaysOn(new Date('2026-11-05T12:00:00Z'))).toEqual([]);
  });
});
