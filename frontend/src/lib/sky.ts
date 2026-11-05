// Naked-eye sky: planet positions (JPL approximate Keplerian elements, 1800–2050, accuracy well
// under 1° for the purpose here), bright stars, horizontal coordinates and visibility tonight.
// Tested against JPL Horizons (sky.test.ts).

import { getMoonIllumination, getMoonPosition, getPosition } from 'suncalc';

const D = Math.PI / 180;
const OBLIQUITY = 23.43928 * D;

/** Centre of Finland, close enough for a sky view anywhere in the country. */
export const SKY_SITE = { lat: 63.5, lon: 26.0 };

export function julianDay(d: Date): number {
  return d.getTime() / 86400000 + 2440587.5;
}

/** Greenwich mean sidereal time, radians. */
export function gmst(d: Date): number {
  const jd = julianDay(d);
  const t = (jd - 2451545.0) / 36525;
  const deg = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * t * t - (t * t * t) / 38710000;
  return ((((deg % 360) + 360) % 360) * D);
}

// a [au], e, I, L, long. perihelion, long. ascending node [deg]; then rates per century (Standish, JPL)
type Elements = [number, number, number, number, number, number, number, number, number, number, number, number];
const ELEMENTS: Record<string, Elements> = {
  mercury: [0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628, 48.33076593, 0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
  venus: [0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718, 76.67984255, 0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329, -0.27769418],
  earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0, 0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0],
  mars: [1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959, 49.55953891, 0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
  jupiter: [5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909, -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
  saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448, -0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
};

/** Heliocentric ecliptic J2000 position [au]. */
function helio(name: string, d: Date): [number, number, number] {
  const el = ELEMENTS[name];
  const t = (julianDay(d) - 2451545.0) / 36525;
  const a = el[0] + el[6] * t;
  const e = el[1] + el[7] * t;
  const I = (el[2] + el[8] * t) * D;
  const L = el[3] + el[9] * t;
  const peri = el[4] + el[10] * t;
  const node = (el[5] + el[11] * t) * D;
  const w = peri * D - node;
  let M = (((L - peri) % 360) + 540) % 360 - 180;
  M *= D;
  let E = M + e * Math.sin(M);
  for (let i = 0; i < 8; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(node), sO = Math.sin(node), cI = Math.cos(I), sI = Math.sin(I);
  return [
    (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    sw * sI * xp + cw * sI * yp,
  ];
}

export type PlanetId = 'mercury' | 'venus' | 'mars' | 'jupiter' | 'saturn';
export const PLANETS: PlanetId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

export interface Equatorial {
  ra: number; // radians
  dec: number; // radians
}

/** Geocentric RA/Dec (J2000), distances and apparent magnitude of a planet. */
export function planet(id: PlanetId, d: Date): Equatorial & { mag: number; dist: number; elong: number } {
  const p = helio(id, d);
  const e = helio('earth', d);
  const g = [p[0] - e[0], p[1] - e[1], p[2] - e[2]];
  const dist = Math.hypot(g[0], g[1], g[2]);
  const r = Math.hypot(p[0], p[1], p[2]);
  const R = Math.hypot(e[0], e[1], e[2]);
  // ecliptic -> equatorial
  const x = g[0];
  const y = g[1] * Math.cos(OBLIQUITY) - g[2] * Math.sin(OBLIQUITY);
  const z = g[1] * Math.sin(OBLIQUITY) + g[2] * Math.cos(OBLIQUITY);
  const ra = (Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI);
  const dec = Math.asin(z / dist);
  // phase angle (sun-planet-earth) and elongation (sun-earth-planet)
  const i = Math.acos(Math.max(-1, Math.min(1, (r * r + dist * dist - R * R) / (2 * r * dist)))) / D;
  const elong = Math.acos(Math.max(-1, Math.min(1, (R * R + dist * dist - r * r) / (2 * R * dist)))) / D;
  const l5 = 5 * Math.log10(r * dist);
  const mag =
    id === 'mercury'
      ? // Mallama & Hilton (2018)
        -0.613 + l5 + 6.328e-2 * i - 1.6336e-3 * i ** 2 + 3.3644e-5 * i ** 3 - 3.4265e-7 * i ** 4 + 1.6893e-9 * i ** 5 - 3.0334e-12 * i ** 6
      : id === 'venus'
        ? -4.4 + l5 + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i ** 3
        : id === 'mars'
          ? -1.52 + l5 + 0.016 * i
          : id === 'jupiter'
            ? -9.4 + l5 + 0.005 * i
            : -8.88 + l5 + 0.044 * i; // Saturn, rings ignored (they are near edge-on in the late 2020s)
  return { ra, dec, mag, dist, elong };
}

/** Altitude and azimuth (degrees; azimuth from north, clockwise). */
export function horizontal(eq: Equatorial, d: Date, lat = SKY_SITE.lat, lon = SKY_SITE.lon): { alt: number; az: number } {
  const H = gmst(d) + lon * D - eq.ra;
  const phi = lat * D;
  const sinAlt = Math.sin(phi) * Math.sin(eq.dec) + Math.cos(phi) * Math.cos(eq.dec) * Math.cos(H);
  const alt = Math.asin(sinAlt);
  const az = Math.atan2(-Math.cos(eq.dec) * Math.sin(H), Math.sin(eq.dec) * Math.cos(phi) - Math.cos(eq.dec) * Math.sin(phi) * Math.cos(H));
  return { alt: alt / D, az: ((az / D) + 360) % 360 };
}

// suncalc 2.x: altitude and azimuth in degrees, azimuth from north
export function sunAlt(d: Date, lat = SKY_SITE.lat, lon = SKY_SITE.lon): number {
  return getPosition(d, lat, lon).altitude;
}

export function moonHorizontal(d: Date, lat = SKY_SITE.lat, lon = SKY_SITE.lon) {
  const m = getMoonPosition(d, lat, lon);
  return { alt: m.altitude, az: ((m.azimuth % 360) + 360) % 360, ill: getMoonIllumination(d) };
}

// ------------------------------------------------------------------ stars

/** Bright stars: [name fi, name en, RA hours, Dec degrees, magnitude] (J2000). */
export const STARS: [string, string, number, number, number][] = [
  ['Sirius', 'Sirius', 6.7525, -16.716, -1.46],
  ['Arcturus', 'Arcturus', 14.261, 19.182, -0.05],
  ['Vega', 'Vega', 18.6156, 38.784, 0.03],
  ['Capella', 'Capella', 5.2782, 45.998, 0.08],
  ['Rigel', 'Rigel', 5.2423, -8.202, 0.13],
  ['Procyon', 'Procyon', 7.655, 5.225, 0.34],
  ['Betelgeuze', 'Betelgeuse', 5.9195, 7.407, 0.5],
  ['Altair', 'Altair', 19.8464, 8.868, 0.76],
  ['Aldebaran', 'Aldebaran', 4.5987, 16.509, 0.86],
  ['Spica', 'Spica', 13.4199, -11.161, 0.97],
  ['Antares', 'Antares', 16.4901, -26.432, 1.06],
  ['Pollux', 'Pollux', 7.7553, 28.026, 1.14],
  ['Fomalhaut', 'Fomalhaut', 22.9608, -29.622, 1.16],
  ['Deneb', 'Deneb', 20.6905, 45.28, 1.25],
  ['Regulus', 'Regulus', 10.1395, 11.967, 1.35],
  ['Castor', 'Castor', 7.5767, 31.888, 1.58],
  ['Bellatrix', 'Bellatrix', 5.4189, 6.35, 1.64],
  ['Alnilam', 'Alnilam', 5.6036, -1.202, 1.69],
  ['Alnitak', 'Alnitak', 5.6793, -1.943, 1.77],
  ['Mintaka', 'Mintaka', 5.5334, -0.299, 2.23],
  ['Saiph', 'Saiph', 5.7959, -9.67, 2.09],
  ['Polaris', 'Polaris', 2.5302, 89.264, 1.98],
  ['Dubhe', 'Dubhe', 11.0621, 61.751, 1.79],
  ['Merak', 'Merak', 11.0307, 56.382, 2.37],
  ['Phecda', 'Phecda', 11.8972, 53.695, 2.44],
  ['Megrez', 'Megrez', 12.257, 57.033, 3.31],
  ['Alioth', 'Alioth', 12.9005, 55.96, 1.77],
  ['Mizar', 'Mizar', 13.3987, 54.925, 2.27],
  ['Alkaid', 'Alkaid', 13.7923, 49.313, 1.86],
  ['Schedar', 'Schedar', 0.6751, 56.537, 2.24],
  ['Caph', 'Caph', 0.153, 59.15, 2.28],
  ['Gamma Cas', 'Gamma Cas', 0.9451, 60.717, 2.15],
  ['Ruchbah', 'Ruchbah', 1.4303, 60.235, 2.68],
  ['Segin', 'Segin', 1.9066, 63.67, 3.35],
  ['Sadr', 'Sadr', 20.3705, 40.257, 2.23],
  ['Albireo', 'Albireo', 19.512, 27.96, 3.05],
  ['Gienah Cyg', 'Gienah Cyg', 20.7702, 33.97, 2.48],
  ['Delta Cyg', 'Delta Cyg', 19.7496, 45.131, 2.87],
  ['Elnath', 'Elnath', 5.4382, 28.608, 1.65],
  ['Mirfak', 'Mirfak', 3.4054, 49.861, 1.79],
  ['Alpheratz', 'Alpheratz', 0.1398, 29.09, 2.06],
  ['Markab', 'Markab', 23.0793, 15.205, 2.48],
  ['Scheat', 'Scheat', 23.0629, 28.083, 2.42],
  ['Algenib', 'Algenib', 0.2206, 15.184, 2.83],
  ['Denebola', 'Denebola', 11.8177, 14.572, 2.14],
  ['Algieba', 'Algieba', 10.3329, 19.842, 2.08],
  ['Seulaset', 'Pleiades', 3.7914, 24.105, 1.6],
];

/** Constellation lines by star names (en), for orientation. */
export const LINES: { fi: string; en: string; path: string[][] }[] = [
  { fi: 'Otava', en: 'Big Dipper', path: [['Alkaid', 'Mizar', 'Alioth', 'Megrez', 'Dubhe', 'Merak', 'Phecda', 'Megrez']] },
  { fi: 'Kassiopeia', en: 'Cassiopeia', path: [['Caph', 'Schedar', 'Gamma Cas', 'Ruchbah', 'Segin']] },
  {
    fi: 'Orion',
    en: 'Orion',
    path: [
      ['Betelgeuse', 'Bellatrix'],
      ['Betelgeuse', 'Alnitak', 'Saiph'],
      ['Bellatrix', 'Mintaka', 'Rigel'],
      ['Alnitak', 'Alnilam', 'Mintaka'],
    ],
  },
  { fi: 'Joutsen', en: 'Cygnus', path: [['Deneb', 'Sadr', 'Albireo'], ['Delta Cyg', 'Sadr', 'Gienah Cyg']] },
  { fi: 'Pegasos', en: 'Pegasus', path: [['Alpheratz', 'Scheat', 'Markab', 'Algenib', 'Alpheratz']] },
  { fi: 'Leijona', en: 'Leo', path: [['Regulus', 'Algieba', 'Denebola', 'Regulus']] },
  { fi: 'Kaksoset', en: 'Gemini', path: [['Castor', 'Pollux']] },
  { fi: 'Ajomies', en: 'Auriga', path: [['Capella', 'Elnath']] },
];

export function starEq(s: (typeof STARS)[number]): Equatorial {
  return { ra: s[2] * 15 * D, dec: s[3] * D };
}

// ------------------------------------------------------------------ meteor showers

/** Major showers: [fi, en, start, peak, end] as month-day (local). */
const SHOWERS: [string, string, string, string, string][] = [
  ['Kvadrantidit', 'Quadrantids', '12-28', '01-03', '01-12'],
  ['Lyridit', 'Lyrids', '04-14', '04-22', '04-30'],
  ['Perseidit', 'Perseids', '07-17', '08-12', '08-24'],
  ['Orionidit', 'Orionids', '10-02', '10-21', '11-07'],
  ['Leonidit', 'Leonids', '11-06', '11-17', '11-30'],
  ['Geminidit', 'Geminids', '12-04', '12-14', '12-20'],
];

export function activeShowers(d: Date): { fi: string; en: string; peak: Date; atPeak: boolean }[] {
  const y = d.getUTCFullYear();
  const at = (md: string, year: number) => new Date(`${year}-${md}T12:00:00Z`);
  const out: { fi: string; en: string; peak: Date; atPeak: boolean }[] = [];
  for (const [fi, en, a, p, b] of SHOWERS) {
    // a shower may run over the new year (start in December, peak/end in January)
    for (const yy of [y - 1, y]) {
      const start = at(a, yy);
      const end = at(b, b < a ? yy + 1 : yy);
      const peak = at(p, p < a ? yy + 1 : yy);
      if (d >= start && d <= end) {
        out.push({ fi, en, peak, atPeak: Math.abs(d.getTime() - peak.getTime()) < 2 * 86400_000 });
        break;
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ tonight

export const COMPASS = {
  fi: ['pohjoisessa', 'koillisessa', 'idässä', 'kaakossa', 'etelässä', 'lounaassa', 'lännessä', 'luoteessa'],
  en: ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'],
};
export const compassIndex = (az: number) => Math.round(az / 45) % 8;
/** "from" and "to" forms for satellite paths: "lounaasta kaakkoon" / "from SW to SE" */
export const COMPASS_FROM = {
  fi: ['pohjoisesta', 'koillisesta', 'idästä', 'kaakosta', 'etelästä', 'lounaasta', 'lännestä', 'luoteesta'],
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
};
export const COMPASS_TO = {
  fi: ['pohjoiseen', 'koilliseen', 'itään', 'kaakkoon', 'etelään', 'lounaaseen', 'länteen', 'luoteeseen'],
  en: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'],
};

export interface NightWindow {
  /** time the chart shows */
  at: Date;
  /** darkest sun altitude tonight (deg) */
  minSun: number;
  /** sun below -6° at some point (otherwise a light summer night) */
  dark: boolean;
  /** times when the sun is below -6° (or the darkest hour on light nights), 10-min steps */
  samples: Date[];
}

/** Tonight's observing window: now if it is already dark, else from dusk until dawn. */
export function tonight(now: Date): NightWindow {
  const step = 10 * 60_000;
  const samples: Date[] = [];
  let minSun = 90;
  let darkest = now;
  // look ahead up to 20 h, stop when the sun is back above -6° after a dark period
  let seenDark = false;
  for (let t = now.getTime(); t < now.getTime() + 20 * 3600_000; t += step) {
    const d = new Date(t);
    const s = sunAlt(d);
    if (s < minSun) {
      minSun = s;
      darkest = d;
    }
    if (s < -6) {
      samples.push(d);
      seenDark = true;
    } else if (seenDark) break;
  }
  const dark = samples.length > 0;
  if (!dark) {
    // light night: use the hour around the darkest moment
    for (let t = darkest.getTime() - 3600_000; t <= darkest.getTime() + 3600_000; t += step) samples.push(new Date(t));
  }
  // chart time: now if dark, else when the sun first gets 9° below the horizon (or darkest moment)
  let at = darkest;
  if (dark) {
    const deep = samples.find((d) => sunAlt(d) < -9);
    at = sunAlt(now) < -6 ? now : (deep ?? samples[0]);
  }
  return { at, minSun, dark, samples };
}

export interface Visible {
  id: string;
  mag: number;
  /** position at the chart time */
  alt: number;
  az: number;
  /** best moment tonight (highest while dark) */
  best: Date | null;
  bestAlt: number;
  bestAz: number;
}

/** Planets and Moon that get at least 5° (Moon 0°) high while it is dark enough tonight. */
export function visibleTonight(win: NightWindow): Visible[] {
  const out: Visible[] = [];
  for (const id of PLANETS) {
    let best: Date | null = null;
    let bestAlt = -90;
    let bestAz = 0;
    let mag = 99;
    for (const d of win.samples) {
      const p = planet(id, d);
      const h = horizontal(p, d);
      // brighter objects show through twilight; faint ones need real darkness
      const need = p.mag < -1 ? -4 : p.mag < 1 ? -7 : -9;
      if (sunAlt(d) > need) continue;
      if (h.alt > bestAlt) {
        bestAlt = h.alt;
        bestAz = h.az;
        best = d;
        mag = p.mag;
      }
    }
    const minAlt = id === 'mercury' ? 3 : 5;
    if (best && bestAlt >= minAlt) {
      const p = planet(id, win.at);
      const h = horizontal(p, win.at);
      out.push({ id, mag: Math.min(mag, p.mag), alt: h.alt, az: h.az, best, bestAlt, bestAz });
    }
  }
  // the Moon: visible whenever it is up during the window
  let mBest: Date | null = null;
  let mAlt = -90;
  let mAz = 0;
  for (const d of win.samples) {
    const m = moonHorizontal(d);
    if (m.alt > mAlt) [mBest, mAlt, mAz] = [d, m.alt, m.az];
  }
  if (mBest && mAlt > 0) {
    const m = moonHorizontal(win.at);
    out.unshift({ id: 'moon', mag: -12, alt: m.alt, az: m.az, best: mBest, bestAlt: mAlt, bestAz: mAz });
  }
  return out;
}
