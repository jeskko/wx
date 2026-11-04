import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, DEFAULT_SLIDES, decodeConfig, encodeConfig, fromQuery, merge, type Config } from './config';

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

describe('per-place slide matrix', () => {
  it('validates the off map and drops unknown slides', async () => {
    const { slideOnFor } = await import('./config');
    const c = merge(DEFAULT_CONFIG, { off: { Oulu: ['aurora', 'bogus'], turku: 'x' as never } });
    expect(c.off).toEqual({ oulu: ['aurora'] });
    expect(slideOnFor(c, 'oulu', 'aurora')).toBe(false);
    expect(slideOnFor(c, 'oulu', 'current')).toBe(true);
    expect(slideOnFor(c, 'helsinki', 'aurora')).toBe(true);
  });
});

describe('new slides in saved configs', () => {
  it('are inserted before the credits', () => {
    const saved = { slides: [{ id: 'current', enabled: true, duration: 12 }, { id: 'credits', enabled: true, duration: 8 }] };
    const c = merge(DEFAULT_CONFIG, saved as Partial<Config>);
    expect(c.slides[c.slides.length - 1].id).toBe('credits');
    expect(c.slides.length).toBe(DEFAULT_SLIDES.length);
  });
});
