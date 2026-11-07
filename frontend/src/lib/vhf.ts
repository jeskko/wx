// VHF "special" propagation indicators: sporadic E (climatology), meteor scatter, radio aurora.
// None of these is a forecast in the weather sense — sporadic E has no forecast model — so each is an
// honest statistical or rule-of-thumb indicator, documented below.

import { horizontal } from './sky';

const D = Math.PI / 180;

// ------------------------------------------------------------------------------------ sporadic E
//
// ITU-R P.534-6 (2021), "Method for calculating sporadic-E field strength":
//   eq. (3)  Γ1(d) = [40 / (1 + d/130 + (d/250)²) + 0.2·(d/2600)²]·(f/foEs)² + exp((d − 1660)/280)   dB
//   eq. (4)  Γ2(d) = 2.6·Γ1(d/2)                         (2600 < d < 4000 km)
//   eq. (1a) E0 = 104.8 − 20·log10 l   dB(µV/m) for 1 kW from an isotropic antenna
//   eq. (5)  l = 2·sqrt(R0² + (R0+h)² − 2·R0·(R0+h)·cos(d / 2R0)),  R0 = 8500 km, h = 120 km
// valid for f/foEs 1..8 (1 hop, < 5 dB error). Percentage of time foEs is exceeded: Fig. 7, region A
// (Europe and North Africa), in 4-hour blocks for summer (May–Aug) and the rest of the year.
// Caution: the Recommendation is stated for ±60° geomagnetic latitude; for paths from Finland to
// Central Europe the mid-point (southern Baltic) is inside that.

/** Fig. 7 block centres (local time, h) and the percentages of time on its curves. */
const FIG7_HOURS = [2, 6, 10, 14, 18, 22];
const FIG7_PCT = [0.1, 0.2, 0.5, 1, 2, 5];
/** foEs (MHz) exceeded for FIG7_PCT[i] % of the time, at FIG7_HOURS[j]; read from the chart. */
const FIG7: Record<'summer' | 'other', number[][]> = {
  summer: [
    [8.7, 9.0, 12.8, 13.1, 13.0, 10.7],
    [8.1, 8.4, 11.8, 12.0, 11.9, 9.8],
    [7.1, 7.6, 10.5, 10.5, 10.4, 8.7],
    [6.4, 7.0, 9.5, 9.4, 9.3, 7.9],
    [5.6, 6.3, 8.5, 8.3, 8.1, 7.0],
    [5.0, 5.5, 7.2, 6.8, 6.6, 6.1],
  ],
  other: [
    [6.8, 7.1, 8.1, 8.6, 7.8, 7.3],
    [6.0, 6.2, 7.5, 7.9, 7.1, 6.5],
    [5.6, 5.7, 6.5, 6.9, 6.2, 5.3],
    [5.3, 5.4, 5.8, 6.0, 5.5, 5.0],
    [5.1, 5.1, 5.2, 5.3, 5.0, 4.9],
    [4.8, 4.8, 4.8, 4.8, 4.8, 4.8],
  ],
};

/** foEs exceeded for each Fig. 7 percentage at a local hour (cyclic linear interpolation between blocks). */
export function foEsCurve(localHour: number, summer: boolean): number[] {
  const t = ((localHour % 24) + 24) % 24;
  let j = FIG7_HOURS.findIndex((h) => h > t) - 1;
  if (j === -2) j = FIG7_HOURS.length - 1; // after 22 h
  const j1 = (j + 1 + FIG7_HOURS.length) % FIG7_HOURS.length;
  const j0 = (j + FIG7_HOURS.length) % FIG7_HOURS.length;
  const h0 = FIG7_HOURS[j0];
  let h1 = FIG7_HOURS[j1];
  let tt = t;
  if (h1 <= h0) h1 += 24;
  if (tt < h0) tt += 24;
  const f = (tt - h0) / (h1 - h0);
  return FIG7[summer ? 'summer' : 'other'].map((row) => row[j0] + (row[j1] - row[j0]) * f);
}

/** Percentage of time foEs ≥ F (MHz): log-linear in F between the curves (Phillips rule, eq. 6), extrapolated beyond. */
export function pctExceeding(F: number, localHour: number, summer: boolean): number {
  const fo = foEsCurve(localHour, summer); // decreasing as the percentage grows
  const lp = FIG7_PCT.map(Math.log10);
  let i = 0;
  if (F >= fo[0]) i = 0; // rarer than 0.1 %: extrapolate with the first segment
  else if (F <= fo[fo.length - 1]) i = fo.length - 2; // commoner than 5 %: extrapolate with the last
  else while (i < fo.length - 2 && F < fo[i + 1]) i++;
  const span = fo[i] - fo[i + 1];
  const slope = span > 0.05 ? (lp[i + 1] - lp[i]) / (fo[i + 1] - fo[i]) : -2; // log10 % per MHz
  const p = 10 ** (lp[i] + slope * (F - fo[i]));
  return Math.min(30, p);
}

export function esPathLength(d: number): number {
  const R0 = 8500;
  const h = 120;
  return 2 * Math.sqrt(R0 ** 2 + (R0 + h) ** 2 - 2 * R0 * (R0 + h) * Math.cos(d / (2 * R0)));
}

function gammaCoeff(d: number): number {
  return 40 / (1 + d / 130 + (d / 250) ** 2) + 0.2 * (d / 2600) ** 2;
}

/** Ionospheric attenuation Γ (dB) for frequency/foEs ratio r over surface distance d (km). */
export function esGamma(d: number, r: number): number {
  if (d > 2600) return 2.6 * esGamma(d / 2, r);
  return gammaCoeff(d) * r * r + Math.exp((d - 1660) / 280);
}

/** ITU-R P.372 median man-made noise, rural (Fa = 67.2 − 27.7·log f, dB above kT0). */
export function ruralNoiseFa(fMHz: number): number {
  return 67.2 - 27.7 * Math.log10(fMHz);
}

export interface EsStation {
  powerW: number;
  gainTxDbi: number;
  gainRxDbi: number;
  bandwidthHz: number;
  requiredSnrDb: number;
}

/** A typical VHF DX station: 100 W, a 5-element Yagi (≈10 dBi) at both ends, SSB at +10 dB SNR. */
export const TYPICAL_VHF: EsStation = { powerW: 100, gainTxDbi: 10, gainRxDbi: 10, bandwidthHz: 2700, requiredSnrDb: 10 };

/** foEs (MHz) needed for the link to reach the required SNR at frequency f over d km. */
export function requiredFoEs(fMHz: number, d: number, st: EsStation = TYPICAL_VHF): number {
  const l = esPathLength(d);
  const E0 = 104.8 - 20 * Math.log10(l);
  const P = 10 * Math.log10(st.powerW / 1000);
  // received power (dBW) = E + Gr − 20·log f − 107.2; noise = −204 + Fa + 10·log B
  const noise = -204 + ruralNoiseFa(fMHz) + 10 * Math.log10(st.bandwidthHz);
  const gammaMax = E0 + P + st.gainTxDbi + st.gainRxDbi - 20 * Math.log10(fMHz) - 107.2 - noise - st.requiredSnrDb;
  const dd = d > 2600 ? d / 2 : d;
  const scale = d > 2600 ? 2.6 : 1;
  const r2 = (gammaMax / scale - Math.exp((dd - 1660) / 280)) / gammaCoeff(dd);
  const r = Math.min(8, Math.sqrt(Math.max(1, r2))); // the formula is valid for f/foEs ≤ 8
  return fMHz / r;
}

export interface EsBand {
  id: string;
  mhz: number;
}
export const ES_BANDS: EsBand[] = [
  { id: '6m', mhz: 50.15 },
  { id: '4m', mhz: 70.2 },
  { id: '2m', mhz: 144.3 },
];

/** Percentage of time the band is open by Es on the path at UTC time t (path mid-point local time). */
export function esChance(band: EsBand, d: number, midLon: number, t: Date): number {
  const localHour = t.getUTCHours() + t.getUTCMinutes() / 60 + midLon / 15;
  const m = t.getUTCMonth() + 1;
  const summer = m >= 5 && m <= 8;
  return pctExceeding(requiredFoEs(band.mhz, d), localHour, summer);
}

// ------------------------------------------------------------------------------------ meteor scatter
//
// ITU-R P.843: the sporadic meteor rate varies sinusoidally through the day (maximum near local dawn,
// when the observer faces the Earth's orbital motion) with a seasonal factor (northern maximum in
// July–August). Shower activity follows the IMO profile ZHR(t) = ZHRmax·10^(−B·|t − tmax|), here
// with B expressed per day; the useful rate scales with the sine of the radiant altitude.

export interface Shower {
  fi: string;
  en: string;
  /** month-day of maximum (UTC; varies by about a day from year to year) */
  peak: string;
  zhr: number;
  /** IMO-style slope, log10 ZHR per day from the peak */
  b: number;
  /** radiant at maximum, degrees */
  ra: number;
  dec: number;
  /** daytime shower: invisible to the eye, but fine for radio */
  day?: boolean;
}

// IMO Meteor Shower Calendar values (rounded)
export const METEOR_SHOWERS: Shower[] = [
  { fi: 'Kvadrantidit', en: 'Quadrantids', peak: '01-03', zhr: 80, b: 2.0, ra: 230, dec: 49 },
  { fi: 'Lyridit', en: 'Lyrids', peak: '04-22', zhr: 18, b: 0.6, ra: 271, dec: 34 },
  { fi: 'Eta-akvaridit', en: 'Eta Aquariids', peak: '05-06', zhr: 50, b: 0.12, ra: 338, dec: -1 },
  { fi: 'Arietidit', en: 'Arietids', peak: '06-07', zhr: 30, b: 0.12, ra: 44, dec: 24, day: true },
  { fi: 'Zeeta-perseidit', en: 'Zeta Perseids', peak: '06-09', zhr: 20, b: 0.15, ra: 62, dec: 23, day: true },
  { fi: 'Perseidit', en: 'Perseids', peak: '08-12', zhr: 100, b: 0.3, ra: 48, dec: 58 },
  { fi: 'Orionidit', en: 'Orionids', peak: '10-21', zhr: 20, b: 0.15, ra: 95, dec: 16 },
  { fi: 'Leonidit', en: 'Leonids', peak: '11-17', zhr: 15, b: 0.5, ra: 152, dec: 22 },
  { fi: 'Geminidit', en: 'Geminids', peak: '12-14', zhr: 150, b: 0.5, ra: 112, dec: 33 },
  { fi: 'Ursidit', en: 'Ursids', peak: '12-22', zhr: 10, b: 0.9, ra: 217, dec: 76 },
];

/** Shower ZHR at time t (nearest yearly maximum), 0 when negligible. */
export function showerZhr(s: Shower, t: Date): number {
  const y = t.getUTCFullYear();
  let best = Infinity;
  for (const yy of [y - 1, y, y + 1]) {
    const pk = Date.parse(`${yy}-${s.peak}T12:00:00Z`);
    best = Math.min(best, Math.abs(t.getTime() - pk) / 86400_000);
  }
  const z = s.zhr * 10 ** (-s.b * best);
  return z < 1 ? 0 : z;
}

/** Sporadic background in "ZHR-equivalent" units: dawn maximum, dusk minimum, summer maximum. */
export function sporadicRate(t: Date, lon: number): number {
  const lt = t.getUTCHours() + t.getUTCMinutes() / 60 + lon / 15;
  const doy = (t.getTime() - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400_000;
  const diurnal = 1 + 0.6 * Math.cos(((lt - 6) / 24) * 2 * Math.PI); // ~4:1 dawn to dusk
  const seasonal = 1 + 0.33 * Math.cos(((doy - 210) / 365) * 2 * Math.PI); // ~2:1 Jul–Aug to Feb–Mar
  return 10 * diurnal * seasonal;
}

export interface MeteorNow {
  index: number;
  sporadic: number;
  /** showers contributing now, strongest first */
  showers: { s: Shower; zhr: number; alt: number; contrib: number }[];
  level: 0 | 1 | 2 | 3;
}

export function meteorNow(t: Date, lat: number, lon: number): MeteorNow {
  const sporadic = sporadicRate(t, lon);
  const showers = METEOR_SHOWERS.map((s) => {
    const zhr = showerZhr(s, t);
    const alt = zhr ? horizontal({ ra: s.ra * D, dec: s.dec * D }, t, lat, lon).alt : -90;
    return { s, zhr, alt, contrib: zhr * Math.max(0, Math.sin(alt * D)) };
  })
    .filter((x) => x.contrib >= 1)
    .sort((a, b) => b.contrib - a.contrib);
  const index = sporadic + showers.reduce((a, x) => a + x.contrib, 0);
  const level = index >= 60 ? 3 : index >= 22 ? 2 : index >= 9 ? 1 : 0;
  return { index, sporadic, showers, level };
}

// ------------------------------------------------------------------------------------ radio aurora
//
// Radio (backscatter) aurora on 6 m / 2 m needs E-region aurora within roughly 1000 km to the north.
// Lange-Hesse's 1957–63 study of 145 MHz contacts in Central Europe found occurrence rising with Kp and
// moving south as Kp grows; from Finland, under the auroral oval, contacts start at lower Kp. Rule of
// thumb used here (not a formula): Kp ≥ 6 strong, 5 likely, 4 possible, below that unlikely.

export function auroraLevel(kp: number | null): 0 | 1 | 2 | 3 {
  if (kp == null) return 0;
  // Kp comes in thirds (4.67 = "5−"); classify on the same rounded value the slide shows
  const k = Math.round(kp);
  return k >= 6 ? 3 : k >= 5 ? 2 : k >= 4 ? 1 : 0;
}
