import { describe as suite, expect, it } from 'vitest';
import { next36Periods, summarize } from './textfc';
import type { Step } from './types';
import { obsSymbol, feelsLike } from './wx';
import { temp, windPhrase } from './format';

const TZ = 'Europe/Helsinki';

function steps(fromIso: string, n: number, f: (i: number) => Partial<Step>): Step[] {
  const t0 = Date.parse(fromIso);
  return Array.from({ length: n }, (_, i) => ({
    time: new Date(t0 + i * 3600_000).toISOString(),
    h: 1, t: 2, feels: null, ws: 5, wg: null, wd: 225, rh: 90, pr: 0, pop: 0, cloud: 90, p: 1010, sym: 'cloudy',
    ...f(i),
  }));
}

suite('next36Periods', () => {
  it('morning gives today / tonight / tomorrow', () => {
    const p = next36Periods(new Date('2026-11-05T07:00:00Z'), TZ); // 09:00 local
    expect(p.map((x) => x.label)).toEqual(['today', 'tonight', 'tomorrow']);
    expect(p[1].start.toISOString()).toBe('2026-11-05T16:00:00.000Z'); // 18 local
  });
  it('evening gives tonight / tomorrow / tomorrow night', () => {
    const p = next36Periods(new Date('2026-11-05T19:30:00Z'), TZ); // 21:30 local
    expect(p.map((x) => x.label)).toEqual(['tonight', 'tomorrow', 'tomorrowNight']);
    expect(p[1].start.toISOString()).toBe('2026-11-06T04:00:00.000Z'); // 06 local
  });
});

suite('summarize', () => {
  it('describes a wet windy night in Finnish', () => {
    const s = steps('2026-11-05T16:00:00Z', 12, (i) => ({ t: -2 + i * 0.3, pr: 0.4, sym: 'snow-1', ws: 4 + (i % 4), wg: 16 }));
    const p = { label: 'tonight' as const, start: new Date('2026-11-05T16:00:00Z'), end: new Date('2026-11-06T04:00:00Z'), night: true };
    const out = summarize(s, p, 'fi')!;
    expect(out.text.replace(/\u00a0/g, ' ')).toBe('Pilvistä, heikkoa lumisadetta (4,8 mm). Alin lämpötila −2°. Lounaistuulta 4–7 m/s, puuskissa 16 m/s.');
    expect(summarize(s, p, 'en')!.text.replace(/\u00a0/g, ' ')).toBe('Cloudy, light snow (4.8 mm). Low −2°. Southwest wind 4–7 m/s, gusts to 16 m/s.');
  });
  it('dry calm day', () => {
    const s = steps('2026-11-06T04:00:00Z', 12, (i) => ({ t: 1 + i * 0.5, sym: 'clear', cloud: 5, ws: 0.5 }));
    const p = { label: 'tomorrow' as const, start: new Date('2026-11-06T04:00:00Z'), end: new Date('2026-11-06T16:00:00Z'), night: false };
    expect(summarize(s, p, 'fi')!.text).toBe('Selkeää. Ylin lämpötila +7°. Tyyntä.');
  });
});

suite('helpers', () => {
  it('formats temperatures', () => {
    expect(temp(-0.4)).toBe('0°');
    expect(temp(-3.6)).toBe('−4°');
    expect(temp(5)).toBe('+5°');
  });
  it('wind phrases', () => {
    expect(windPhrase('fi', 350)).toBe('pohjoistuulta');
    expect(windPhrase('en', 100)).toBe('east wind');
  });
  it('maps wawa codes', () => {
    expect(obsSymbol(81, 6)).toBe('showers-1');
    expect(obsSymbol(73, null)).toBe('snow-3');
    expect(obsSymbol(0, 0)).toBe('clear');
    expect(obsSymbol(22, 7)).toBe('cloudy'); // recent precip ignored
    expect(obsSymbol(null, null)).toBe(null);
  });
  it('wind chill', () => {
    expect(feelsLike(-10, 8, 80)).toBe(-19);
    expect(feelsLike(15, 8, 80)).toBe(15);
  });
});
