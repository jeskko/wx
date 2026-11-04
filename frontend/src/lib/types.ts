// Shapes of the JSON files written by the backend baker (backend/wx/jobs.py).

export type Lang = 'fi' | 'en';
export type Localized = Record<Lang, string>;

export interface Place {
  id: string;
  name: Localized;
  lat: number;
  lon: number;
  country: string;
  region: string;
  icao: string | null;
}

export interface PlacesFile {
  updated: string;
  places: Place[];
  airports: string[];
}

export interface Station {
  id: string | null;
  name: string | null;
  region: string | null;
  lat: number;
  lon: number;
  time: string;
  t: number | null;
  ws: number | null;
  wg: number | null;
  wd: number | null;
  rh: number | null;
  td: number | null;
  r1h: number | null;
  ri: number | null;
  snow: number | null;
  p: number | null;
  ptend: number | null;
  vis: number | null;
  n: number | null;
  wawa: number | null;
}

export interface ObsFile {
  source: string;
  updated: string;
  stations: Station[];
}

/** Normalized weather symbol: kind or kind-intensity, see backend/wx/symbols.py */
export type Sym = string;

export interface Step {
  time: string;
  h: number;
  t: number | null;
  feels: number | null;
  ws: number | null;
  wg: number | null;
  wd: number | null;
  rh: number | null;
  pr: number | null;
  pop: number | null;
  cloud: number | null;
  p: number | null;
  sym: Sym | null;
}

export interface Day {
  date: string;
  partial: boolean;
  tmin: number;
  tmax: number;
  pr: number;
  wsmax: number | null;
  wgmax: number | null;
  wd: number | null;
  pop: number | null;
  sym: Sym | null;
}

export interface ForecastFile {
  place: string;
  source: 'fmi' | 'metno';
  updated: string;
  tz: string;
  hourly: Step[];
  daily: Day[];
}

export interface Metar {
  icao: string;
  name: string;
  lat: number;
  lon: number;
  time: string | null;
  raw: string;
  t: number | null;
  td: number | null;
  wd: number | null;
  wdvrb: boolean;
  wskt: number | null;
  wgkt: number | null;
  vis: number | null;
  qnh: number | null;
  wx: string | null;
  clouds: { cover: string; base: number | null }[];
  cat: 'VFR' | 'MVFR' | 'IFR' | 'LIFR' | null;
}

export interface Taf {
  icao: string;
  issued: string | null;
  from: string | null;
  to: string | null;
  raw: string;
}

export interface AviationFile {
  updated: string;
  metar: Record<string, Metar>;
  taf: Record<string, Taf>;
}

export interface WarningText {
  event: string | null;
  headline: string | null;
  description: string | null;
  instruction: string | null;
}

export interface Warning {
  id: string;
  sent: string | null;
  code: string | null;
  severity: 'Minor' | 'Moderate' | 'Severe' | 'Extreme' | null;
  urgency: string | null;
  certainty: string | null;
  onset: string | null;
  expires: string | null;
  color: 'green' | 'yellow' | 'orange' | 'red';
  text: Partial<Record<'fi' | 'sv' | 'en', WarningText>>;
  areas: { name: Partial<Record<'fi' | 'sv' | 'en', string>>; polygons: [number, number][][] }[];
}

export interface WarningsFile {
  updated: string;
  source: string;
  warnings: Warning[];
}

export interface KpRow {
  time: string;
  kp: number;
  kind: string;
}

export interface MagStation {
  code: string | null;
  name: string;
  lat: number;
  lon: number;
  range: number;
  dxmax: number;
  time: string;
  n: number;
}

export interface Ovation {
  observed: string;
  forecast: string;
  lat0: number;
  lon0: number;
  step: number;
  grid: number[][];
}

export interface AuroraFile {
  updated: string;
  kp: { observed: KpRow[]; forecast: KpRow[] } | null;
  ovation: Ovation | null;
  solarwind: { time: string; bz: number | null; bt: number | null; speed: number | null } | null;
  mag: MagStation[] | null;
}

export interface HealthFile {
  updated: string;
  jobs: Record<string, { last_ok: string | null; age_s: number | null; interval_s: number; stale: boolean; errors: number; last_error: string | null }>;
}
