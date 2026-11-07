// Weather section (400s), modelled on Yle Teksti-TV 400-419 and NOS Teletekst 702/704.

import { t } from '../../i18n';
import { api } from '../../lib/data';
import type { PeriodSummary } from '../../lib/textfc';
import type { Day, Place } from '../../lib/types';
import { currentFor, placeTz } from '../../lib/wx';
import { loadBasemap } from '../../map/basemap';
import type { RegionalRow } from '../../slides/Regional.svelte';
import type { WarningsData } from '../../slides/Warnings.svelte';
import { C } from '../codes';
import { code, codeLegend, condWord, dec, dir, dm, hm, pad, rpad, tt, wd, wrap } from '../fmt';
import { outline, rasterize, separate, toBitmap } from '../maps';
import type { Layout } from '../page';
import { footer, frame, type Env, type PageDef } from '../service';

const fi = (e: Env) => e.lang === 'fi';

/** One observation row, Yle 402 style: name, temperature, wind, condition. */
function obsRow(L: Layout, lang: Env['lang'], row: number, name: string, temp: number | null, wdeg: number | null, ws: number | null, cond: string) {
  L.text(row, 1, pad(name, 12), C.White);
  L.text(row, 14, rpad(tt(temp, false), 3), C.Yellow);
  L.text(row, 18, pad(dir(lang, wdeg, ws), 2), C.Cyan);
  L.text(row, 21, rpad(ws == null ? '-' : String(Math.round(ws)), 2), C.Cyan);
  L.text(row, 24, cond, C.Green);
}

function obsHeader(L: Layout, row: number, e: Env) {
  L.text(row, 14, fi(e) ? 'Läm' : 'Tmp', C.Cyan);
  L.text(row, 18, fi(e) ? 'Tuuli' : 'Wind', C.Cyan);
  L.text(row, 24, fi(e) ? 'Sää' : 'Weather', C.Cyan);
}

const observations: PageDef = {
  num: 402,
  slide: 'regional',
  alsoFor: ['current'],
  section: 400,
  title: { fi: 'Havainnot', en: 'Observations' },
  short: { fi: 'Havainnot', en: 'Obs' },
  async build(e) {
    const out: Layout[] = [];
    const rows = await e.prep<RegionalRow[]>('regional');
    // configured places: nearest station (Nordic services too), else METAR
    const [obs, nordic, av] = await Promise.all([api.obs().catch(() => null), api.nordicObs().catch(() => null), api.aviation().catch(() => null)]);
    const stations = [...(obs?.stations ?? []), ...(nordic?.stations ?? [])];
    const own = e.places.map((p) => ({ p, cur: currentFor(p, stations, av ? Object.values(av.metar) : null) })).filter((x) => x.cur);
    const latest = (obs?.stations ?? []).map((s) => s.time).sort().pop();
    const when = latest ? hm(e.lang, latest, 'Europe/Helsinki') : '';
    const pages: ((L: Layout) => void)[] = [];
    if (rows?.length)
      pages.push((L) => {
        L.text(3, 1, fi(e) ? `Havainnot klo ${when}` : `Observations at ${when}`, C.White);
        obsHeader(L, 5, e);
        rows.slice(0, 16).forEach((r, i) => obsRow(L, e.lang, 6 + i, r.name, r.t, r.wd, r.ws, condWord(e.lang, r.sym)));
      });
    if (own.length)
      pages.push((L) => {
        L.text(3, 1, fi(e) ? 'Omat paikat' : 'Your places', C.White);
        obsHeader(L, 5, e);
        own.slice(0, 16).forEach(({ p, cur }, i) => obsRow(L, e.lang, 6 + i, p.name[e.lang], cur!.t, cur!.wd, cur!.ws, condWord(e.lang, cur!.sym)));
      });
    if (!pages.length) return null;
    pages.forEach((fill, i) => {
      const L = frame({ title: fi(e) ? 'Säähavainnot' : 'Observations', count: [i + 1, pages.length] });
      fill(L);
      footer(L, fi(e) ? 'Ilmatieteen laitos' : 'Source: FMI', [fi(e) ? 'Lyhenteet' : 'Legend', 419]);
      out.push(L);
    });
    return out;
  },
};

const forecastText: PageDef = {
  num: 401,
  slide: 'next36',
  section: 400,
  title: { fi: 'Ennuste', en: 'Forecast' },
  async build(e) {
    const chosen = e.places.filter((p) => e.on('next36', p));
    const list = (chosen.length ? chosen : e.places.slice(0, 1)).slice(0, 8);
    const got = await Promise.all(list.map(async (p) => ({ p, s: await e.prep<PeriodSummary[]>('next36', p) })));
    const ok = got.filter((x): x is { p: Place; s: PeriodSummary[] } => !!x.s);
    if (!ok.length) return null;
    return ok.map(({ p, s }, i) => {
      const L = frame({ title: fi(e) ? 'Sääennuste' : 'Forecast', count: [i + 1, ok.length] });
      L.text(3, 1, p.name[e.lang], C.White, { dh: true });
      L.right(3, 39, `${wd(e.lang, e.now, placeTz(p))} ${dm(e.lang, e.now, placeTz(p))}`, C.White);
      let row = 6;
      for (const per of s) {
        if (row > 21) break;
        const range = per.tmin === per.tmax ? tt(per.tmin) : `${tt(per.tmin)}...${tt(per.tmax)}`;
        L.text(row, 1, t(e.lang, per.label).toUpperCase(), C.Cyan);
        L.right(row, 39, `${code(e.lang, per.sym)} ${range}`, C.Yellow);
        row++;
        for (const line of wrap(per.text, 38)) {
          if (row > 21) break;
          L.text(row++, 1, line, C.White);
        }
        row++;
      }
      footer(L, p.country === 'FI' ? (fi(e) ? 'Ilmatieteen laitos' : 'FMI') : 'MET Norway', [fi(e) ? 'Säähakemisto' : 'Weather', 400]);
      return L;
    });
  },
};

const extended: PageDef = {
  num: 405,
  slide: 'extended',
  section: 400,
  title: { fi: '5 vrk', en: '5 days' },
  async build(e) {
    const chosen = e.places.filter((p) => e.on('extended', p));
    const list = (chosen.length ? chosen : e.places.slice(0, 1)).slice(0, 8);
    const got = await Promise.all(list.map(async (p) => ({ p, d: await e.prep<{ days: Day[]; tz: string }>('extended', p) })));
    const ok = got.filter((x): x is { p: Place; d: { days: Day[]; tz: string } } => !!x.d);
    if (!ok.length) return null;
    return ok.map(({ p, d }, i) => {
      const L = frame({ title: fi(e) ? '5 vuorokautta' : '5-day forecast', count: [i + 1, ok.length] });
      L.text(3, 1, p.name[e.lang], C.White, { dh: true });
      const days = d.days.slice(0, 5);
      // NOS 704 layout: an 8-character label column, then 6 cells per day
      const col = (k: number) => 10 + k * 6;
      days.forEach((day, k) => L.text(6, col(k) + 2, rpad(wd(e.lang, `${day.date}T12:00:00Z`, d.tz), 3), C.Yellow));
      const rows: [string, C, (x: Day) => string][] = [
        [fi(e) ? 'Sää' : 'Weather', C.Green, (x) => code(e.lang, x.sym)],
        [fi(e) ? 'Ylin' : 'High', C.Yellow, (x) => tt(x.tmax)],
        [fi(e) ? 'Alin' : 'Low', C.White, (x) => tt(x.tmin)],
        [fi(e) ? 'Sade mm' : 'Rain mm', C.Cyan, (x) => (x.pr < 0.05 ? '0' : dec(e.lang, x.pr, x.pr < 10 ? 1 : 0))],
        [fi(e) ? 'Sade %' : 'Rain %', C.Cyan, (x) => (x.pop == null ? '-' : String(Math.round(x.pop)))],
        [fi(e) ? 'Tuuli' : 'Wind', C.Green, (x) => dir(e.lang, x.wd, x.wsmax)],
        ['  m/s', C.Green, (x) => (x.wsmax == null ? '-' : String(Math.round(x.wsmax)))],
      ];
      rows.forEach(([label, colour, f], r) => {
        const row = 8 + r * 2;
        L.text(row, 1, label, C.Cyan);
        days.forEach((day, k) => L.text(row, col(k) + 1, rpad(f(day), 4), colour));
      });
      footer(L, p.country === 'FI' ? (fi(e) ? 'Ilmatieteen laitos' : 'FMI') : 'MET Norway', [fi(e) ? 'Lyhenteet' : 'Legend', 419]);
      return L;
    });
  },
};

// Finnish cities on the temperature map, south to north (13 as on the slide)
const MAP_CITIES = ['helsinki', 'turku', 'maarianhamina', 'lappeenranta', 'tampere', 'vaasa', 'kuopio', 'joensuu', 'kajaani', 'oulu', 'kuusamo', 'rovaniemi', 'ivalo'];
const SEEDS: [number, number][] = [
  [60.17, 24.94],
  [62.6, 29.76],
  [65.01, 25.47],
  [66.5, 25.73],
  [68.66, 27.54],
  [63.1, 21.6],
  [61.5, 23.76],
  [60.1, 19.94],
  [68.4, 23.6],
];

const tempMap: PageDef = {
  num: 404,
  slide: 'tempmap',
  section: 400,
  title: { fi: 'Kartta', en: 'Map' },
  async build(e) {
    const [base, pf, obs] = await Promise.all([loadBasemap('fi'), api.places().catch(() => null), api.obs().catch(() => null)]);
    if (!pf || !obs) return null;
    const fresh = obs.stations.filter((s) => s.t != null && Date.now() - Date.parse(s.time) < 90 * 60_000);
    if (!fresh.length) return null;
    const L = frame({ title: fi(e) ? 'Lämpötilat' : 'Temperatures' });
    // the map: rows 3-22, columns 0-21; Finland hollow (NOS style), neighbours solid
    const m = rasterize(base, { extent: [20_000, 6_610_000, 800_000, 7_790_000], maxW: 42, maxH: 60, seeds: SEEDS });
    const edge = outline(m, 1);
    const bm = toBitmap(m, (k, x, y) => (k === 1 ? (edge[y * m.w + x] ? C.Cyan : 0) : k === 2 ? C.Green : 0));
    separate(bm, C.Cyan, C.Green);
    const top = 3;
    const left = 1; // column 0 holds each row's first colour attribute
    L.blit(bm, top, left);
    const rows: { name: string; t: number }[] = [];
    for (const id of MAP_CITIES) {
      const p = pf.places.find((x) => x.id === id);
      if (!p) continue;
      let best = null as (typeof fresh)[number] | null;
      let bd = 30;
      for (const s of fresh) {
        const d = Math.hypot(s.lat - p.lat, (s.lon - p.lon) * Math.cos((p.lat * Math.PI) / 180)) * 111;
        if (d < bd) {
          bd = d;
          best = s;
        }
      }
      if (!best) continue;
      rows.push({ name: p.name[e.lang], t: best.t! });
      // number at the city: a colour attribute before it, a mosaic attribute after it
      const [x, y] = m.px(p.lat, p.lon);
      const s = tt(best.t, false);
      let c = left + Math.round(x / 2) - Math.floor(s.length / 2);
      c = Math.max(2, Math.min(21 - s.length, c));
      // on the city's row, or the row above if that hides less of the coastline
      const cost = (rr: number) => {
        let n = 0;
        for (let k = c - 1; k <= c + s.length; k++) if (L.rows[rr]?.[k]?.mosaic) n++;
        return n;
      };
      const r0 = top + Math.floor(y / 3);
      const r = cost(r0 - 1) < cost(r0) ? r0 - 1 : r0;
      for (let k = c - 1; k <= c + s.length; k++) L.rows[r][k] = { ...L.rows[r][k], code: 0x20, mosaic: false };
      L.text(r, c, s, best.t! > 0 ? C.Yellow : C.White);
    }
    // the list beside the map
    const latest = fresh.map((s) => s.time).sort().pop()!;
    L.text(4, 23, fi(e) ? `Klo ${hm(e.lang, latest, 'Europe/Helsinki')}` : `At ${hm(e.lang, latest, 'Europe/Helsinki')}`, C.White);
    rows.forEach((r, i) => {
      L.text(6 + i, 23, pad(r.name, 13), C.Cyan);
      L.text(6 + i, 37, rpad(tt(r.t), 3), r.t > 0 ? C.Yellow : C.White);
    });
    const byT = [...fresh].sort((a, b) => a.t! - b.t!);
    const lo = byT[0];
    const hi = byT[byT.length - 1];
    L.text(20, 23, fi(e) ? 'Kylmin' : 'Coldest', C.Cyan);
    L.text(21, 23, pad(lo.name ?? '', 12), C.White);
    L.right(21, 40, dec(e.lang, lo.t, 1), C.White);
    L.text(22, 23, fi(e) ? 'Lämpimin' : 'Warmest', C.Cyan);
    L.text(23, 23, pad(hi.name ?? '', 12), C.White);
    L.right(23, 40, dec(e.lang, hi.t, 1), C.Yellow);
    return [L];
  },
};

const WARN_BAR: Record<string, C> = { green: C.Green, yellow: C.Yellow, orange: C.Magenta, red: C.Red };

const warnings: PageDef = {
  num: 409,
  slide: 'warnings',
  section: 400,
  title: { fi: 'Varoitukset', en: 'Warnings' },
  short: { fi: 'Varoitus', en: 'Warnings' },
  async build(e) {
    const d = await e.prep<WarningsData>('warnings');
    if (!d) return null;
    const tz = 'Europe/Helsinki';
    const items = [...d.here.map((h) => ({ w: h.warning, places: h.places })), ...d.elsewhere.map((w) => ({ w, places: [] as string[] }))];
    // one warning type per subpage would be too many; pack blocks into pages of 18 rows
    const blocks = items.map(({ w, places }) => {
      const tx = w.text[e.lang] ?? w.text.fi ?? w.text.en ?? { event: '', headline: '', description: '', instruction: '' };
      const areas = [...new Set(w.areas.map((a) => a.name[e.lang] ?? a.name.fi ?? '').filter(Boolean))];
      const lines: [string, C][] = [];
      const head = (tx.event || tx.headline || '').toUpperCase();
      lines.push([head, WARN_BAR[w.color] ?? C.Yellow]);
      if (places.length) lines.push([(fi(e) ? 'Koskee: ' : 'Affects: ') + places.join(', '), C.White]);
      const where = areas.length > 4 ? `${areas.slice(0, 4).join(', ')} +${areas.length - 4}` : areas.join(', ');
      for (const l of wrap(where, 38).slice(0, 2)) lines.push([l, C.Cyan]);
      const from = w.onset ? `${wd(e.lang, w.onset, tz)} ${hm(e.lang, w.onset, tz)}` : '';
      const to = w.expires ? `${wd(e.lang, w.expires, tz)} ${hm(e.lang, w.expires, tz)}` : '';
      if (from || to) lines.push([`${from} - ${to}`, C.Green]);
      return lines;
    });
    const pages: [string, C][][][] = [[]];
    let used = 0;
    for (const b of blocks) {
      if (used + b.length + 1 > 18 && pages[pages.length - 1].length) {
        pages.push([]);
        used = 0;
      }
      pages[pages.length - 1].push(b);
      used += b.length + 1;
    }
    const n = Math.min(pages.length, 6);
    return pages.slice(0, n).map((bs, i) => {
      const L = frame({ title: fi(e) ? 'Säävaroitukset' : 'Weather warnings', count: [i + 1, n], bar: C.Red });
      let row = 4;
      for (const b of bs) {
        b.forEach(([s, colour], k) => {
          if (k === 0) {
            // coloured marker block + heading
            L.mosaicCell(row, 1, 0x7f, colour);
            L.text(row, 3, s.slice(0, 36), colour === C.Green ? C.White : colour);
          } else L.text(row, 3, s.slice(0, 37), colour);
          row++;
        });
        row++;
      }
      footer(L, fi(e) ? 'Ilmatieteen laitos' : 'Source: FMI', [fi(e) ? 'Säähakemisto' : 'Weather', 400]);
      return L;
    });
  },
};

const legend: PageDef = {
  num: 419,
  section: 400,
  title: { fi: 'Lyhenteet', en: 'Legend' },
  async build(e) {
    const L = frame({ title: fi(e) ? 'Lyhenteet' : 'Abbreviations' });
    L.text(4, 1, fi(e) ? 'Sääsymbolit' : 'Weather codes', C.Cyan);
    codeLegend(e.lang).forEach(([c, w], i) => {
      L.text(6 + i, 2, c, C.Yellow);
      L.text(6 + i, 6, w, C.White);
    });
    L.text(6 + 10, 2, fi(e) ? 'Iso alkukirjain = lunta' : 'Capital first letter = snow', C.Green);
    const dirs = e.lang === 'fi' ? ['P', 'KO', 'I', 'KA', 'E', 'LO', 'L', 'LU'] : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const words = e.lang === 'fi' ? ['pohjoinen', 'koillinen', 'itä', 'kaakko', 'etelä', 'lounas', 'länsi', 'luode'] : ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
    L.text(4, 22, fi(e) ? 'Tuulen suunta' : 'Wind direction', C.Cyan);
    dirs.forEach((d, i) => {
      L.text(6 + i, 23, d, C.Yellow);
      L.text(6 + i, 27, words[i], C.White);
    });
    L.text(15, 23, fi(e) ? '-- tyyntä' : '-- calm', C.White);
    L.text(19, 1, fi(e) ? 'Tuulen nopeus m/s. Lämpötilat' : 'Wind speed in m/s. Temperatures', C.White);
    L.text(20, 1, fi(e) ? 'celsiusasteina.' : 'in degrees Celsius.', C.White);
    footer(L, '', [fi(e) ? 'Säähakemisto' : 'Weather', 400]);
    return [L];
  },
};

export const WEATHER_PAGES: PageDef[] = [forecastText, observations, tempMap, extended, warnings, legend];
