import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { daily, parseMetno, symFromMetno } from './customfc';
import { fold, matchRows, rowToPlace, shardKey, type GeoRow } from './geo';

describe('MET Norway in the browser', () => {
  it('maps symbols like the backend', () => {
    expect(symFromMetno('lightrainshowers_day')).toBe('showers-1');
    expect(symFromMetno('heavysnow')).toBe('snow-3');
    expect(symFromMetno('rainandthunder')).toBe('thunder-1');
    expect(symFromMetno('fair_night')).toBe('partly');
    expect(symFromMetno('sleetshowers_day')).toBe('sleet-2');
  });
  it('parses the fixture and builds local days', () => {
    const doc = JSON.parse(readFileSync(new URL('../../../backend/tests/fixtures/metno.json', import.meta.url), 'utf8'));
    const steps = parseMetno(doc);
    expect(steps.length).toBeGreaterThan(40);
    expect(steps[0].h).toBe(1);
    expect(steps[steps.length - 1].h).toBe(6);
    const days = daily(steps, 'Europe/Helsinki');
    expect(days.length).toBeGreaterThanOrEqual(8);
    for (const d of days) {
      expect(d.tmin).toBeLessThanOrEqual(d.tmax);
      expect(d.date).toMatch(/^\d{4}-\d\d-\d\d$/);
    }
    expect(days.filter((d) => !d.partial).every((d) => d.sym)).toBe(true);
  });
});

describe('place search', () => {
  const rows: GeoRow[] = [
    [656130, 'Jakobstad', 63.67, 22.7, 'FI', 'Ostrobothnia', 19668, 'Europe/Helsinki', 'Pietarsaari'],
    [655194, 'Jyväskylä', 62.24, 25.72, 'FI', 'Central Finland', 148744, 'Europe/Helsinki', ''],
    [1, 'Jyvaskyla Bay', 0, 0, 'XX', '', 10, 'UTC', ''],
  ];
  it('folds like the backend', () => {
    expect(fold('Tórshavn')).toBe('torshavn');
    expect(fold('Jyväskylä')).toBe('jyvaskyla');
    expect(shardKey('Ähtäri')).toBe('ah');
    expect(shardKey('j')).toBeNull();
  });
  it('matches either name, exact first', () => {
    expect(matchRows(rows, 'pietars').map((r) => r[0])).toEqual([656130]);
    expect(matchRows(rows, 'jyväskylä bay').map((r) => r[0])).toEqual([1]);
    expect(matchRows(rows, 'jyv').map((r) => r[0])).toEqual([655194, 1]);
    const p = rowToPlace(rows[0]);
    expect(p).toMatchObject({ id: 'geo-656130', name: { fi: 'Pietarsaari', en: 'Jakobstad' }, tz: 'Europe/Helsinki' });
  });
});
