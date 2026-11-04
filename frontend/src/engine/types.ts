import type { Component } from 'svelte';
import type { Key } from '../i18n';
import type { Lang, Place } from '../lib/types';
import type { Config } from './config';

export interface SlideCtx {
  lang: Lang;
  config: Config;
  /** The place this slide is about (for global slides: the first configured place). */
  place: Place;
  places: Place[];
  now: Date;
  /** seconds this slide stays on screen */
  duration: number;
}

export interface SlideProps<D> {
  ctx: SlideCtx;
  data: D;
}

export interface SlideDef<D = unknown> {
  id: string;
  title: Key;
  /** 'place' slides repeat for each configured place; 'global' slides show once per loop;
   *  'capital' slides repeat for each selected world capital (ctx.place is the capital). */
  scope: 'place' | 'global' | 'capital';
  /** Load everything the slide needs. Return null to skip the slide (no data / nothing to show). */
  prepare: (ctx: SlideCtx) => Promise<D | null>;
  component: Component<SlideProps<D>>;
}
