// The teletext service: numbered pages, each built from the same data the slides use
// (SlideDef.prepare) into one or more subpages.

import { SLIDES } from '../engine/registry';
import type { Config } from '../engine/config';
import type { SlideCtx } from '../engine/types';
import type { Lang, Localized, Place } from '../lib/types';
import { C } from './codes';
import { Layout } from './page';

export interface Env {
  lang: Lang;
  config: Config;
  /** configured places (in order) */
  places: Place[];
  now: Date;
  /** run a slide's prepare() for a place (default: the first configured place) */
  prep<T>(slide: string, place?: Place): Promise<T | null>;
  /** is a place-scoped slide on for this place (settings matrix)? */
  on(slide: string, place: Place): boolean;
}

export interface PageDef {
  num: number;
  /** slide id this page stands in for: its on/off switch, duration and loop position */
  slide?: string;
  /** extra slide ids that also map to this page (first one enabled wins) */
  alsoFor?: string[];
  /** section index page this page belongs to */
  section: number;
  /** title for indexes (14 cells) */
  title: Localized;
  /** Fastext label if the title is longer than 9 cells */
  short?: Localized;
  build(env: Env): Promise<Layout[] | null>;
}

export function makeEnv(lang: Lang, config: Config, places: Place[], now: Date): Env {
  return {
    lang,
    config,
    places,
    now,
    async prep<T>(slide: string, place?: Place): Promise<T | null> {
      const def = SLIDES[slide];
      const p = place ?? places[0];
      if (!def || !p) return null;
      const ctx: SlideCtx = { lang, config, place: p, places, now, duration: 12 };
      try {
        return (await def.prepare(ctx)) as T | null;
      } catch (e) {
        console.warn('teletext prep', slide, e);
        return null;
      }
    },
    on(slide, place) {
      return !(config.off[place.id] ?? []).includes(slide);
    },
  };
}

export interface FrameOpts {
  title: string;
  /** right side of the title bar (place name etc.) */
  tag?: string;
  /** subpage counter */
  count?: [number, number];
  /** background colour of the title bar */
  bar?: C;
}

/** House style: a double-height title on a coloured bar (rows 1-2), counter on the right. */
export function frame(o: FrameOpts): Layout {
  const L = new Layout();
  const bar = o.bar ?? C.Blue;
  L.fill(1, 2, 39, bar);
  L.text(1, 4, o.title.toUpperCase(), C.Yellow, { dh: true, bg: bar });
  if (o.count && o.count[1] > 1) L.right(1, 39, `${o.count[0]}/${o.count[1]}`, C.White, { bg: bar });
  else if (o.tag) L.right(1, 39, o.tag, C.White, { dh: true, bg: bar });
  return L;
}

/** A footer line on row 23: source on the left, a page reference on the right. */
export function footer(L: Layout, left: string, ref?: [string, number]): void {
  const r = ref ? `${ref[0]} ${ref[1]}` : '';
  // keep a space for the colour change between the two
  const room = ref ? 39 - r.length - 2 : 38;
  L.text(23, 1, left.length > room ? left.slice(0, room) : left, C.Cyan);
  if (ref) L.right(23, 39, r, C.White);
}
