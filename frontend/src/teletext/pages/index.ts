// Page directory, the index pages and the carousel order.

import type { Config } from '../../engine/config';
import type { Lang } from '../../lib/types';
import { C } from '../codes';
import { dm, wd } from '../fmt';
import { Bitmap, type Layout } from '../page';
import { frame, type Env, type PageDef } from '../service';
import { MISC_PAGES } from './misc';
import { SPACE_PAGES } from './space';
import { WEATHER_PAGES } from './weather';

const fi = (e: Env) => e.lang === 'fi';

// "wx.fi" in 9-pixel-high block letters (3 rows of mosaics); vertical strokes are 2 pixels
const GLYPHS: Record<string, string[]> = {
  w: ['..........', '..........', '..........', '##......##', '##......##', '##..##..##', '##..##..##', '##.####.##', '.###..###.'],
  x: ['........', '........', '........', '##....##', '.##..##.', '..####..', '..####..', '.##..##.', '##....##'],
  '.': ['..', '..', '..', '..', '..', '..', '..', '##', '##'],
  f: ['..####', '.##...', '.##...', '#####.', '.##...', '.##...', '.##...', '.##...', '.##...'],
  i: ['##', '..', '..', '##', '##', '##', '##', '##', '##'],
};

function logo(L: Layout, row: number, col: number, colour: C): void {
  const word = 'wx.fi';
  const gap = { w: 2, x: 1, '.': 1, f: 2, i: 0 } as Record<string, number>;
  const w = [...word].reduce((n, ch) => n + GLYPHS[ch][0].length + gap[ch], 0);
  const bm = new Bitmap(w, 9);
  let x0 = 0;
  for (const ch of word) {
    GLYPHS[ch].forEach((line, y) => [...line].forEach((p, x) => p === '#' && bm.set(x0 + x, y, colour)));
    x0 += GLYPHS[ch][0].length + gap[ch];
  }
  L.blit(bm, row, col);
}

/** Index line: name in white, page number in yellow (no leaders, as on Yle and Ceefax). */
function entry(L: Layout, row: number, col: number, width: number, name: string, num: number, nameC: C = C.White): void {
  L.text(row, col, name.slice(0, width - 1), nameC);
  L.text(row, col + width, String(num), C.Yellow);
}

function titleOf(num: number, lang: Lang): string {
  const p = PAGES.find((x) => x.num === num);
  return p ? p.title[lang] : String(num);
}

const front: PageDef = {
  num: 100,
  section: 100,
  title: { fi: 'Etusivu', en: 'Index' },
  async build(e) {
    const L = frame({ title: '' });
    // replace the standard bar with the logo header
    for (let c = 0; c < 40; c++) L.rows[1][c] = { ...L.rows[1][c], code: 0x20, bg: C.Black, dh: false };
    logo(L, 2, 1, C.Yellow);
    // no double height here: it would hide the logo's middle row (it hides the whole row below)
    L.text(2, 21, fi(e) ? 'T E K S T I - T V' : 'T E L E T E X T', C.Cyan);
    L.text(4, 21, `${wd(e.lang, e.now, 'Europe/Helsinki')} ${dm(e.lang, e.now, 'Europe/Helsinki')}`, C.White);
    L.fill(6, 2, 39, C.Blue);
    L.text(6, 3, fi(e) ? 'SÄÄ' : 'WEATHER', C.Yellow, { bg: C.Blue });
    L.right(6, 39, '400', C.White, { bg: C.Blue });
    const wx = [401, 402, 404, 405, 409, 428, 429, 430];
    wx.forEach((n, i) => entry(L, 8 + (i % 4), i < 4 ? 2 : 21, 14, titleOf(n, e.lang), n));
    L.fill(13, 2, 39, C.Blue);
    L.text(13, 3, fi(e) ? 'AVARUUS JA RADIO' : 'SPACE AND RADIO', C.Yellow, { bg: C.Blue });
    L.right(13, 39, '600', C.White, { bg: C.Blue });
    [601, 603, 610, 611].forEach((n, i) => entry(L, 15 + (i % 2), i < 2 ? 2 : 21, 14, titleOf(n, e.lang), n));
    entry(L, 18, 2, 14, titleOf(419, e.lang), 419);
    entry(L, 18, 21, 14, titleOf(899, e.lang), 899);
    L.text(21, 1, fi(e) ? 'Sivut vaihtuvat itsestään. Näppäile' : 'Pages change by themselves. Type a', C.Cyan);
    L.text(22, 1, fi(e) ? 'sivunumero tai käytä värinäppäimiä.' : 'page number or use the colour keys.', C.Cyan);
    return [L];
  },
};

function sectionIndex(num: number, title: { fi: string; en: string }, list: [number, { fi: string; en: string }][], bar: C): PageDef {
  return {
    num,
    section: 100,
    title,
    async build(e) {
      const L = frame({ title: title[e.lang], bar });
      list.forEach(([n, name], i) => entry(L, 4 + i * 2, 3, 32, name[e.lang], n));
      return [L];
    },
  };
}

const weatherIndex = sectionIndex(
  400,
  { fi: 'Sää', en: 'Weather' },
  [
    [401, { fi: 'Sääennuste', en: 'Forecast' }],
    [402, { fi: 'Säähavainnot', en: 'Observations' }],
    [404, { fi: 'Lämpötilakartta', en: 'Temperature map' }],
    [405, { fi: 'Ennuste 5 vuorokautta', en: '5-day forecast' }],
    [409, { fi: 'Säävaroitukset', en: 'Weather warnings' }],
    [419, { fi: 'Lyhenteet', en: 'Abbreviations' }],
    [428, { fi: 'Lentosää METAR', en: 'METAR reports' }],
    [429, { fi: 'Lentopaikkaennusteet TAF', en: 'TAF forecasts' }],
    [430, { fi: 'Aurinko ja kuu', en: 'Sun and moon' }],
  ],
  C.Blue,
);

const spaceIndex0 = sectionIndex(
  600,
  { fi: 'Avaruus ja radio', en: 'Space and radio' },
  [
    [601, { fi: 'Revontulet', en: 'Aurora outlook' }],
    [603, { fi: 'Avaruussää', en: 'Space weather' }],
    [610, { fi: 'HF-radiokeli', en: 'HF propagation' }],
    [611, { fi: 'VHF/UHF-tropokeli', en: 'VHF/UHF tropo' }],
  ],
  C.Magenta,
);

const spaceIndex: PageDef = { ...spaceIndex0, short: { fi: 'Avaruus', en: 'Space' } };

export const PAGES: PageDef[] = [front, weatherIndex, ...WEATHER_PAGES, ...MISC_PAGES, spaceIndex, ...SPACE_PAGES].sort((a, b) => a.num - b.num);

export function pageDef(num: number): PageDef | undefined {
  return PAGES.find((p) => p.num === num);
}

/** Carousel ("Pages from Ceefax") order: the front page, then one page per enabled slide in
 *  the configured slide order; seconds per subpage from that slide's duration. */
export function carousel(config: Config): { num: number; seconds: number }[] {
  const out: { num: number; seconds: number }[] = [{ num: 100, seconds: 10 }];
  const seen = new Set<number>([100]);
  for (const s of config.slides) {
    if (!s.enabled) continue;
    const p = PAGES.find((x) => x.slide === s.id || x.alsoFor?.includes(s.id));
    if (!p || seen.has(p.num)) continue;
    seen.add(p.num);
    out.push({ num: p.num, seconds: Math.max(8, s.duration) });
  }
  return out;
}
