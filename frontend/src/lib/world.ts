// World view definitions (generated copy of backend/wx/world.json; see tools/build_world.py).

import WORLD_JSON from '../map/world.json';
import type { Place } from './types';

export interface WorldCityRef {
  fi: string;
  en: string;
  lat: number;
  lon: number;
}

export interface WorldRegion {
  id: string;
  fi: string;
  en: string;
  lat0: number;
  lon0: number;
  hw: number;
  hh: number;
  cities: (string | WorldCityRef)[];
}

export interface Capital {
  id: string;
  fi: string;
  en: string;
  lat: number;
  lon: number;
  icao: string;
  tz: string;
  region: string;
}

export const REGIONS = WORLD_JSON.regions as WorldRegion[];
export const CAPITALS = WORLD_JSON.capitals as Capital[];
export const CAPITAL_VIEW = WORLD_JSON.capital_view as { hw: number; hh: number };

const byId = new Map(CAPITALS.map((c) => [c.id, c]));

export function capitalById(id: string): Capital | undefined {
  return byId.get(id);
}

/** Capitals as Place objects (id `cap-<id>`) for the slide loop and header. */
export function capitalPlaces(ids: string[]): Place[] {
  return ids
    .map((id) => byId.get(id))
    .filter((c): c is Capital => !!c)
    .map((c) => ({ id: `cap-${c.id}`, name: { fi: c.fi, en: c.en }, lat: c.lat, lon: c.lon, country: '', region: c.region, icao: c.icao }));
}

/** Every named city of the world views (capitals + region extras), for map labels. */
export function allWorldCities(): WorldCityRef[] {
  const out: WorldCityRef[] = CAPITALS.map((c) => ({ fi: c.fi, en: c.en, lat: c.lat, lon: c.lon }));
  for (const r of REGIONS) for (const c of r.cities) if (typeof c !== 'string' && !out.some((o) => o.en === c.en)) out.push(c);
  return out;
}

export function regionCities(r: WorldRegion): WorldCityRef[] {
  return r.cities
    .map((c) => (typeof c === 'string' ? byId.get(c) : c))
    .filter((c): c is WorldCityRef => !!c)
    .map((c) => ({ fi: c.fi, en: c.en, lat: c.lat, lon: c.lon }));
}
