import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, decodeConfig, encodeConfig, fromQuery, merge } from './config';

describe('config', () => {
  it('round-trips through base64url with non-ascii', () => {
    const c = { places: ['jyväskylä'], lang: 'en' as const };
    expect(decodeConfig(encodeConfig(c))).toEqual(c);
  });
  it('rejects junk', () => {
    expect(decodeConfig('%%%')).toBeNull();
    expect(merge(DEFAULT_CONFIG, { lang: 'xx' as never })).toEqual(DEFAULT_CONFIG);
  });
  it('keeps slide order, drops unknown, appends missing', () => {
    const c = merge(DEFAULT_CONFIG, { slides: [{ id: 'aurora', enabled: true, duration: 999 }, { id: 'bogus', enabled: true, duration: 5 }] });
    expect(c.slides[0]).toEqual({ id: 'aurora', enabled: true, duration: 120 });
    expect(c.slides.find((s) => s.id === 'bogus')).toBeUndefined();
    expect(c.slides.length).toBe(DEFAULT_CONFIG.slides.length);
  });
  it('parses query shortcuts', () => {
    const p = fromQuery(new URLSearchParams('place=Oulu,rovaniemi&lang=en&slides=aurora,current&kiosk=1&music=0'));
    const c = merge(DEFAULT_CONFIG, p);
    expect(c.places).toEqual(['oulu', 'rovaniemi']);
    expect(c.slides.filter((s) => s.enabled).map((s) => s.id)).toEqual(['aurora', 'current']);
    expect(c.kiosk).toBe(true);
    expect(c.music.enabled).toBe(false);
  });
});
