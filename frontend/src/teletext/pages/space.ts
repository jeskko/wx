// Space weather and radio section (600s). No broadcaster ever had these pages, so the layouts
// are our own, built from the same building blocks (tables, coloured blocks, mosaic maps).

import { t } from '../../i18n';
import { loadBasemap } from '../../map/basemap';
import { forward } from '../../map/proj';
import type { AuroraData } from '../../slides/Aurora.svelte';
import type { HfData } from '../../slides/Hf.svelte';
import type { SpaceWxData } from '../../slides/SpaceWeather.svelte';
import { tropoLevel, type TropoData } from '../../slides/TropoMap.svelte';
import { flareClass, seriesAt, SCALE_WORD } from '../../lib/space';
import { C } from '../codes';
import { dec, dm, hm, pad, rpad, wd } from '../fmt';
import { outline, rasterize } from '../maps';
import { Bitmap } from '../page';
import { footer, frame, type Env, type PageDef } from '../service';

const fi = (e: Env) => e.lang === 'fi';
const TZ = 'Europe/Helsinki';

const aurora: PageDef = {
  num: 601,
  slide: 'aurora',
  section: 600,
  title: { fi: 'Revontulet', en: 'Aurora' },
  async build(e) {
    const d = await e.prep<AuroraData>('aurora');
    if (!d) return null;
    const L = frame({ title: fi(e) ? 'Revontulet' : 'Aurora outlook', bar: C.Green });
    const kpT = d.rows[0]?.out.kpTonight ?? null;
    L.text(4, 1, fi(e) ? 'Kp-indeksi nyt' : 'Kp index now', C.Cyan);
    L.text(4, 22, d.kpNow == null ? '-' : dec(e.lang, d.kpNow, 1), C.Yellow, { dh: true });
    L.text(6, 1, fi(e) ? 'Ennuste tänä yönä' : 'Forecast tonight', C.Cyan);
    L.text(6, 22, kpT == null ? '-' : dec(e.lang, kpT, 1), C.Yellow, { dh: true });
    const sw = d.file.solarwind;
    if (sw) {
      L.text(8, 1, fi(e) ? 'Aurinkotuuli' : 'Solar wind', C.Cyan);
      L.text(8, 22, sw.speed == null ? '-' : `${Math.round(sw.speed)} km/s`, C.White);
      L.text(9, 1, 'Bz', C.Cyan);
      L.text(9, 22, sw.bz == null ? '-' : `${dec(e.lang, sw.bz, 1)} nT`, sw.bz != null && sw.bz < -5 ? C.Red : C.White);
    }
    // Kp bar chart of the last 24 h + next 24 h: one column per 3 h, separated blocks (SRF style)
    const kp = d.file.kp;
    if (kp) {
      const now = e.now.getTime();
      const obs = kp.observed.filter((r) => Date.parse(r.time) > now - 24 * 3600_000 && Date.parse(r.time) <= now).slice(-8);
      const fc = kp.forecast.filter((r) => Date.parse(r.time) > now).slice(0, 8);
      const all = [...obs.map((r) => ({ kp: r.kp, f: false })), ...fc.map((r) => ({ kp: r.kp, f: true }))];
      // one cell per bar and a gap cell between them, which takes the colour change
      const bm = new Bitmap(all.length * 4, 9);
      all.forEach((r, i) => {
        const hgt = Math.max(1, Math.round(Math.min(9, r.kp)));
        const colour = r.kp >= 5 ? C.Red : r.kp >= 4 ? C.Yellow : r.f ? C.Cyan : C.Green;
        bm.rect(i * 4, 9 - hgt, i * 4 + 1, 8, colour);
      });
      L.text(11, 1, fi(e) ? 'Kp 24 h ja ennuste' : 'Kp 24 h and forecast', C.Cyan);
      L.blit(bm, 12, 2);
      L.text(15, 2, fi(e) ? 'havaittu' : 'observed', C.Green);
      L.text(15, 2 + obs.length * 2, fi(e) ? 'ennuste' : 'forecast', C.Cyan);
    }
    L.text(17, 1, fi(e) ? 'Mahdollisuus tänä yönä' : 'Chance tonight', C.Cyan);
    const LEVEL_C = [C.White, C.Green, C.Yellow, C.Red];
    d.rows.slice(0, 5).forEach((r, i) => {
      L.text(18 + i, 2, pad(r.name, 14), C.White);
      const word = r.out.dark ? t(e.lang, `aurora.${r.out.level}` as 'aurora.0') : fi(e) ? 'valoisaa' : 'daylight';
      L.text(18 + i, 17, word.slice(0, 23), r.out.dark ? LEVEL_C[r.out.level] : C.Blue);
    });
    footer(L, 'NOAA SWPC, FMI', [fi(e) ? 'Avaruus' : 'Space', 600]);
    return [L];
  },
};

const LETTERS = ['A', 'B', 'C', 'M', 'X'];

const spaceWeather: PageDef = {
  num: 603,
  slide: 'spaceweather',
  alsoFor: ['sun'],
  section: 600,
  title: { fi: 'Avaruussää', en: 'Space wx' },
  async build(e) {
    const d = await e.prep<SpaceWxData>('spaceweather');
    if (!d) return null;
    const f = d.file;
    const L = frame({ title: fi(e) ? 'Avaruussää' : 'Space weather', bar: C.Magenta });
    const sc = f.scales;
    const lvlC = (v: number | null) => (v == null ? C.White : v >= 3 ? C.Red : v >= 1 ? C.Yellow : C.Green);
    if (sc) {
      L.text(4, 1, fi(e) ? 'NOAA-asteikot' : 'NOAA scales', C.Cyan);
      L.text(4, 18, fi(e) ? 'nyt' : 'now', C.Cyan);
      sc.forecast.slice(0, 3).forEach((day, k) => day.date && L.text(4, 24 + k * 5, wd(e.lang, `${day.date}T12:00:00Z`, 'UTC'), C.Cyan));
      const names = fi(e) ? ['R radiokatkot', 'S protonit', 'G magn.myrsky'] : ['R radio blackout', 'S radiation', 'G geomagnetic'];
      (['r', 's', 'g'] as const).forEach((k, i) => {
        const row = 6 + i;
        L.text(row, 1, names[i], C.White);
        const v = sc.now[k];
        L.text(row, 18, v == null ? '-' : `${k.toUpperCase()}${v}`, lvlC(v));
        sc.forecast.slice(0, 3).forEach((day, j) => {
          // forecast days give probabilities for R and S; G has a level
          const s = k === 'g' ? (day.g == null ? '-' : `G${day.g}`) : k === 'r' ? (day.rMinor == null ? '-' : `${day.rMinor}%`) : day.sProb == null ? '-' : `${day.sProb}%`;
          L.text(row, 24 + j * 5, s, k === 'g' ? lvlC(day.g) : C.White);
        });
      });
      const worst = Math.max(sc.now.r ?? 0, sc.now.s ?? 0, sc.now.g ?? 0);
      L.text(10, 1, `${fi(e) ? 'Tilanne' : 'Status'}: ${SCALE_WORD[e.lang][worst]}`, lvlC(worst));
    }
    // GOES X-ray flux, last 24 h: one band of 3 pixels per flare class A..X (log scale)
    if (f.xray) {
      const now = e.now.getTime();
      const W = 72;
      const bm = new Bitmap(W, 15);
      for (let x = 0; x < W; x++) {
        const tm = now - 24 * 3600_000 + (x / (W - 1)) * 24 * 3600_000;
        let v: number | null = null;
        // the max over the column's 20 minutes
        for (let k = 0; k < 20; k += 5) {
          const s = seriesAt(f.xray, tm - k * 60_000);
          if (s != null && (v == null || s > v)) v = s;
        }
        if (v == null) continue;
        const y = Math.round(14 - (Math.max(-8, Math.min(-3, v)) + 8) * 3);
        bm.set(x, y, v >= -5 ? C.Red : v >= -6 ? C.Yellow : C.Green);
      }
      L.text(12, 1, fi(e) ? 'Röntgenvuo 24 h' : 'X-ray flux 24 h', C.Cyan);
      const cur = seriesAt(f.xray, now - 10 * 60_000);
      if (cur != null) L.right(12, 39, `${fi(e) ? 'nyt' : 'now'} ${flareClass(cur)}`, C.White);
      LETTERS.forEach((l, i) => L.text(13 + (4 - i), 1, l, C.White));
      L.blit(bm, 13, 3);
      L.text(18, 3, `-24 h`, C.Cyan);
      L.right(18, 39, hm(e.lang, now, TZ), C.Cyan);
    }
    const p = f.probabilities;
    if (p) {
      L.text(20, 1, fi(e) ? 'Purkaustodennäköisyys' : 'Flare probability', C.Cyan);
      L.text(21, 1, `M ${p.m.slice(0, 3).map((v) => rpad(`${v}%`, 4)).join(' ')}`, C.Yellow);
      L.text(22, 1, `X ${p.x.slice(0, 3).map((v) => rpad(`${v}%`, 4)).join(' ')}`, C.Red);
    }
    const ssn = f.ssn?.ssn;
    if (ssn != null) L.text(21, 26, `${fi(e) ? 'Auringonp.' : 'Sunspots'} ${ssn}`, C.White);
    if (f.f107) L.text(22, 26, `F10.7 ${Math.round(f.f107.flux)}`, C.White);
    footer(L, 'NOAA SWPC', [fi(e) ? 'Avaruus' : 'Space', 600]);
    return [L];
  },
};

// HF: best mode per band as coloured blocks; one subpage per 6 hours ahead
const MODE_C = [C.Black, C.Red, C.Yellow, C.Green];
const HF_SHORT: Record<string, { fi: string; en: string }> = {
  nordic: { fi: 'Pohjoismaat', en: 'Nordics' },
  'eu-c': { fi: 'Keski-Eur.', en: 'C Europe' },
  'eu-s': { fi: 'Etelä-Eur.', en: 'S Europe' },
  in: { fi: 'Intia', en: 'India' },
  jp: { fi: 'Japani', en: 'Japan' },
  'na-e': { fi: 'P-Am. itä', en: 'N Am. east' },
  'na-w': { fi: 'P-Am. länsi', en: 'N Am. west' },
  'af-s': { fi: 'Etelä-Afr.', en: 'S Africa' },
};

const hf: PageDef = {
  num: 610,
  slide: 'hf',
  section: 600,
  title: { fi: 'HF-keli', en: 'HF' },
  async build(e) {
    const d = await e.prep<HfData>('hf');
    if (!d) return null;
    const { hf: f } = d;
    const steps = [0, 6, 12, 18].filter((h) => d.start + h < f.times.length);
    return steps.map((h, si) => {
      const i = d.start + h;
      const L = frame({ title: fi(e) ? 'HF-radiokeli' : 'HF propagation', count: [si + 1, steps.length], bar: C.Blue });
      const at = f.times[i];
      L.text(3, 1, `${wd(e.lang, at, TZ)} ${fi(e) ? 'klo' : ''} ${hm(e.lang, at, TZ)}`.replace('  ', ' '), C.White);
      L.right(3, 39, h === 0 ? (fi(e) ? 'nyt' : 'now') : `+${h} h`, C.Yellow);
      // 3 cells per band from column 12: a gap (holds the colour attribute when needed) + 2 blocks
      const bands = f.bands.slice(0, 9);
      bands.forEach((b, k) => L.right(5, 15 + k * 3, b.id.replace('m', ''), C.Cyan));
      L.text(5, 1, fi(e) ? 'metriä' : 'metres', C.Cyan);
      f.regions.slice(0, 8).forEach((r, ri) => {
        const row = 7 + ri * 2;
        L.text(row, 1, pad((HF_SHORT[r.id] ?? r.name)[e.lang], 11), C.White);
        const lv = r.levels[i] ?? '';
        bands.forEach((_, k) => {
          const v = +(lv[k] ?? '0');
          const col = 13 + k * 3;
          if (v > 0) {
            L.mosaicCell(row, col, 0x7f, MODE_C[v]);
            L.mosaicCell(row, col + 1, 0x7f, MODE_C[v]);
          } else {
            L.mosaicCell(row, col, 0x2c, C.Blue);
            L.mosaicCell(row, col + 1, 0x2c, C.Blue);
          }
        });
      });
      // legend and conditions
      L.mosaicCell(23, 1, 0x7f, C.Green);
      L.text(23, 3, fi(e) ? 'puhe' : 'SSB', C.Green);
      L.mosaicCell(23, 9, 0x7f, C.Yellow);
      L.text(23, 11, 'CW', C.Yellow);
      L.mosaicCell(23, 15, 0x7f, C.Red);
      L.text(23, 17, 'FT8', C.Red);
      L.text(23, 22, `SSN ${Math.round(f.ssn)}${d.kp != null ? ` Kp ${dec(e.lang, d.kp, 0)}` : ''}`, C.White);
      if (f.drap?.event) L.text(4, 2, fi(e) ? 'RADIOPIMENNYS PÄIVÄPUOLELLA' : 'DAYSIDE RADIO BLACKOUT', C.Red, { flash: true });
      return L;
    });
  },
};

// Tropo: a Nordic mosaic map coloured by the ducting index; subpages now, +12, +24, +36 h
// level 1 (slightly enhanced) is left out: it covers most of the map most of the time
const TROPO_C = [0, 0, C.Cyan, C.Yellow, C.Red];

const tropo: PageDef = {
  num: 611,
  slide: 'tropo',
  section: 600,
  title: { fi: 'Tropokeli', en: 'Tropo' },
  async build(e) {
    const d = await e.prep<TropoData>('tropo');
    if (!d) return null;
    const base = await loadBasemap('nordic');
    const g = d.grid;
    // the area the slide shows, fitted into columns 0-27, rows 3-22
    const m = rasterize(base, { extent: [-450_000, 6_150_000, 1_000_000, 7_800_000], maxW: 54, maxH: 60 });
    const coast = outline(m, 1);
    const offsets = [0, 12, 24, 36].filter((h) => e.now.getTime() + h * 3600_000 <= g.times[g.times.length - 1]);
    const LEVELS = fi(e) ? ['normaali', 'hieman parempi', 'parantunut', 'kanavoituu', 'voimakas'] : ['normal', 'slightly up', 'enhanced', 'ducting', 'strong duct'];
    return offsets.map((h, si) => {
      const tm = e.now.getTime() + h * 3600_000;
      const tf = g.timeIndex(tm);
      const L = frame({ title: fi(e) ? 'VHF/UHF-tropokeli' : 'VHF/UHF tropo', count: [si + 1, offsets.length], bar: C.Blue });
      // index level per pixel; the coastline where the index is normal
      const bm = new Bitmap(m.w, m.h);
      for (let y = 0; y < m.h; y++)
        for (let x = 0; x < m.w; x++) {
          const [ex, ny] = m.toMap(x, y);
          const v = g.sample('tropo', tf, ex, ny);
          const lv = Number.isNaN(v) ? 0 : tropoLevel(v);
          // the coast stays visible on top of the index colours
          bm.px[y * m.w + x] = coast[y * m.w + x] ? C.Green : TROPO_C[lv];
        }
      const top = 3;
      L.blit(bm, top, 0);
      for (let r = top; r < top + Math.ceil(m.h / 3); r++) L.hold.add(r);
      // time + legend on the right
      L.text(4, 28, h === 0 ? (fi(e) ? 'NYT' : 'NOW') : `+${h} h`, C.Yellow, { dh: true });
      L.text(6, 28, `${wd(e.lang, tm, TZ)} ${hm(e.lang, Math.round(tm / 3600_000) * 3600_000, TZ)}`, C.White);
      LEVELS.forEach((w, k) => {
        if (k < 2) return;
        L.mosaicCell(8 + k, 28, 0x7f, TROPO_C[k] as C);
        L.text(8 + k, 30, w.slice(0, 10), C.White);
      });
      // index at the listed places
      L.text(15, 28, fi(e) ? 'Indeksi' : 'Index', C.Cyan);
      d.points.slice(0, 6).forEach((p, k) => {
        const [ex, ny] = forward(p.lat, p.lon);
        const v = g.sample('tropo', tf, ex, ny);
        L.text(16 + k, 28, pad(p.name, 9), C.White);
        L.text(16 + k, 38, Number.isNaN(v) ? ' -' : rpad(String(Math.round(v)), 2), Number.isNaN(v) ? C.White : (TROPO_C[tropoLevel(v)] as C) || C.White);
      });
      footer(L, `HARMONIE ${dm(e.lang, d.origin, TZ)} ${hm(e.lang, d.origin, TZ)}`, [fi(e) ? 'Radio' : 'Radio', 600]);
      return L;
    });
  },
};

export const SPACE_PAGES: PageDef[] = [aurora, spaceWeather, hf, tropo];
