// Aviation (428/429, raw messages as on Yle), almanac (430) and the credits page (899).

import type { Metar } from '../../lib/types';
import type { AlmanacData } from '../../slides/Almanac.svelte';
import type { TafRow } from '../../slides/Taf.svelte';
import type { Track } from '../../engine/audio';
import { C } from '../codes';
import { dm, hm, pad, rpad, wd, wrap } from '../fmt';
import type { Layout } from '../page';
import { footer, frame, type Env, type PageDef } from '../service';

const fi = (e: Env) => e.lang === 'fi';

/** Blocks of lines packed onto subpages (rows 4-22), each block kept together. */
function pack<T>(blocks: T[][], rows = 19): T[][][] {
  const pages: T[][][] = [[]];
  let used = 0;
  for (const b of blocks) {
    if (used + b.length > rows && pages[pages.length - 1].length) {
      pages.push([]);
      used = 0;
    }
    pages[pages.length - 1].push(b);
    used += b.length + 1;
  }
  return pages;
}

function messages(e: Env, title: string, items: { icao: string; name: string | null; raw: string }[], src: string): Layout[] {
  const blocks = items.map(({ icao, name, raw }) => {
    const body = raw.replace(/^(METAR|SPECI|TAF)\s+(AMD\s+|COR\s+)?/, '').replace(new RegExp(`^${icao}\\s+`), '');
    return [{ s: `${icao} ${name ?? ''}`.trim(), c: C.Yellow }, ...wrap(body, 36).map((s) => ({ s: `  ${s}`, c: C.White }))];
  });
  const pages = pack(blocks).slice(0, 8);
  return pages.map((bs, i) => {
    const L = frame({ title, count: [i + 1, pages.length], bar: C.Blue });
    let row = 4;
    for (const b of bs) {
      for (const l of b) L.text(row++, 1, l.s.slice(0, 38), l.c);
      row++;
    }
    footer(L, src, [fi(e) ? 'Säähakemisto' : 'Weather', 400]);
    return L;
  });
}

const metar: PageDef = {
  num: 428,
  slide: 'aviation',
  section: 400,
  title: { fi: 'METAR', en: 'METAR' },
  async build(e) {
    const ms = await e.prep<Metar[]>('aviation');
    if (!ms?.length) return null;
    return messages(e, fi(e) ? 'Lentosää METAR' : 'METAR reports', ms.map((m) => ({ icao: m.icao, name: m.name, raw: m.raw })), 'NOAA Aviation Weather Center');
  },
};

const taf: PageDef = {
  num: 429,
  slide: 'taf',
  section: 400,
  title: { fi: 'TAF', en: 'TAF' },
  async build(e) {
    const ts = await e.prep<TafRow[]>('taf');
    if (!ts?.length) return null;
    return messages(e, fi(e) ? 'Lentopaikkaennusteet' : 'TAF forecasts', ts.map((x) => ({ icao: x.icao, name: x.name, raw: x.raw })), 'NOAA Aviation Weather Center');
  },
};

const PHASES = {
  fi: ['Uusikuu', 'Kasvava sirppi', 'Ensimmäinen neljännes', 'Kasvava kuu', 'Täysikuu', 'Vähenevä kuu', 'Viimeinen neljännes', 'Vähenevä sirppi'],
  en: ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'],
};

const almanac: PageDef = {
  num: 430,
  slide: 'almanac',
  section: 400,
  title: { fi: 'Almanakka', en: 'Almanac' },
  async build(e) {
    const d = await e.prep<AlmanacData>('almanac');
    if (!d) return null;
    const L = frame({ title: fi(e) ? 'Aurinko ja kuu' : 'Sun and moon', bar: C.Blue });
    const tz0 = d.rows[0]?.tz ?? 'Europe/Helsinki';
    L.text(3, 1, `${wd(e.lang, e.now, tz0)} ${dm(e.lang, e.now, tz0)}`, C.White);
    L.text(5, 13, fi(e) ? 'Nousee Laskee Päivä' : 'Rises  Sets   Day', C.Cyan);
    d.rows.slice(0, 7).forEach((r, i) => {
      const row = 6 + i;
      L.text(row, 1, pad(r.name, 11), C.White);
      if (r.polar) {
        const w = r.polar === 'night' ? (fi(e) ? 'kaamos' : 'polar night') : fi(e) ? 'yötön yö' : 'midnight sun';
        L.text(row, 13, w, C.Cyan);
      } else {
        L.text(row, 13, `${rpad(hm(e.lang, r.sunrise, r.tz), 5)}  ${rpad(hm(e.lang, r.sunset, r.tz), 5)}`, C.Yellow);
        const h = Math.floor(r.dayMin / 60);
        const m = Math.round(r.dayMin % 60);
        L.text(row, 27, `${rpad(String(h), 2)} h ${rpad(String(m), 2)} min`, C.White);
      }
    });
    const row = 6 + Math.min(7, d.rows.length) + 1;
    L.text(row, 1, PHASES[e.lang][Math.round(d.moonPhase * 8) % 8], C.Yellow);
    L.right(row, 39, `${Math.round(d.moonFraction * 100)} %`, C.White);
    L.text(row + 1, 1, `${fi(e) ? 'Täysikuu' : 'Full moon'} ${dm(e.lang, d.nextFull, tz0)}  ${fi(e) ? 'Uusikuu' : 'New moon'} ${dm(e.lang, d.nextNew, tz0)}`, C.White);
    // special days of the next two weeks
    let r2 = row + 3;
    if (d.special.length) L.text(r2++, 1, fi(e) ? 'Tulevia merkkipäiviä' : 'Coming special days', C.Cyan);
    for (const s of d.special.slice(0, 22 - r2 + 1)) {
      const date = `${s.date}T12:00:00Z`;
      L.text(r2, 1, `${wd(e.lang, date, 'UTC')} ${dm(e.lang, date, 'UTC')}`, s.holiday ? C.Red : C.White);
      L.text(r2, 12, s.name[e.lang].slice(0, 26), s.flag ? C.Cyan : C.White);
      r2++;
    }
    return [L];
  },
};

const SOURCES: [string, string][] = [
  ['Ilmatieteen laitos (FMI)', 'CC BY 4.0'],
  ['SMHI, DMI', 'CC BY 4.0'],
  ['Keskkonnaagentuur', 'open data'],
  ['Vedurstofa Islands', 'open data'],
  ['Fintraffic / Digitraffic', 'CC BY 4.0'],
  ['ECMWF (via FMI)', 'CC BY 4.0'],
  ['MET Norway', 'CC BY 4.0'],
  ['NOAA AWC (METAR, TAF)', 'public domain'],
  ['NOAA SWPC', 'public domain'],
  ['NASA / SDO', 'free with credit'],
  ['VOACAP / DVOACAP', 'PD / MIT'],
  ['CelesTrak', 'open data'],
  ['Natural Earth', 'public domain'],
  ['GeoNames', 'CC BY 4.0'],
  ['Wikidata', 'CC0'],
  ['Bedstead-fontti / font', 'public domain'],
];

const credits: PageDef = {
  num: 899,
  slide: 'credits',
  section: 100,
  title: { fi: 'Tietoa', en: 'About' },
  async build(e) {
    const d = await e.prep<{ tracks: Track[] }>('credits');
    const pages: Layout[] = [];
    const n = d?.tracks.length ? 2 : 1;
    const L = frame({ title: fi(e) ? 'Tietolähteet' : 'Data sources', count: [1, n] });
    L.text(3, 1, fi(e) ? 'wx.fi kokoaa avointa dataa:' : 'wx.fi is built on open data:', C.White);
    SOURCES.forEach(([name, lic], i) => {
      L.text(5 + i, 1, pad(name, 24), C.Cyan);
      L.text(5 + i, 26, lic, C.White);
    });
    L.text(22, 1, 'github.com/jeskko/wx', C.Yellow);
    L.right(22, 39, 'MIT', C.White);
    pages.push(L);
    if (d?.tracks.length) {
      const M = frame({ title: fi(e) ? 'Musiikki' : 'Music', count: [2, n] });
      d.tracks.slice(0, 9).forEach((tr, i) => {
        M.text(4 + i * 2, 1, tr.title.slice(0, 38), C.Yellow);
        M.text(5 + i * 2, 3, `${tr.artist.replace(/\s*\(.*\)$/, '')} (${tr.license})`.slice(0, 36), C.White);
      });
      pages.push(M);
    }
    return pages;
  },
};

export const MISC_PAGES: PageDef[] = [metar, taf, almanac, credits];
