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

describe('custom places', () => {
  it('keeps valid search places and drops junk', () => {
    const ok = { id: 'geo-656130', name: { fi: 'Pietarsaari', en: 'Jakobstad' }, lat: 63.67, lon: 22.7, country: 'FI', region: 'x', icao: 'X', tz: 'Europe/Helsinki' };
    const c = merge(DEFAULT_CONFIG, { custom: [ok, { id: 'helsinki' }, { ...ok, id: 'geo-1', tz: '../../etc' }] as never });
    expect(c.custom.map((p) => p.id)).toEqual(['geo-656130', 'geo-1']);
    expect(c.custom[0]).toMatchObject({ region: 'custom', icao: null, tz: 'Europe/Helsinki' });
    expect(c.custom[1].tz).toBeUndefined();
  });
});

describe('METAR / TAF decoding', () => {
  it('is off by default and survives merge and share links', () => {
    expect(DEFAULT_CONFIG.decodeMetar).toBe(false);
    expect(DEFAULT_CONFIG.decodeTaf).toBe(false);
    const c = merge(DEFAULT_CONFIG, decodeConfig(encodeConfig({ decodeMetar: true })));
    expect([c.decodeMetar, c.decodeTaf]).toEqual([true, false]);
    expect(merge(DEFAULT_CONFIG, { decodeTaf: 'yes' as never }).decodeTaf).toBe(false);
  });
  it('reads ?decode= from the URL', () => {
    const q = (s: string) => fromQuery(new URLSearchParams(s));
    expect(q('decode=taf')).toMatchObject({ decodeMetar: false, decodeTaf: true });
    expect(q('decode=metar,taf')).toMatchObject({ decodeMetar: true, decodeTaf: true });
    expect(q('decode=1')).toMatchObject({ decodeMetar: true, decodeTaf: true });
    expect(q('decode=0')).toMatchObject({ decodeMetar: false, decodeTaf: false });
    expect(q('lang=fi')).not.toHaveProperty('decodeMetar');
  });
});
