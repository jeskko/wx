// Teletext Level 1.5 spacing attributes (ETS 300 706, table 26). Every one of them occupies a
// character cell, which is what makes the medium what it is.

export const ROWS = 25;
export const COLS = 40;

export const C = { Black: 0, Red: 1, Green: 2, Yellow: 3, Blue: 4, Magenta: 5, Cyan: 6, White: 7 } as const;
/** A teletext colour 0-7. */
export type C = (typeof C)[keyof typeof C];

/** Alphanumerics in colour c (set-after). */
export const alpha = (c: C) => c;
/** Mosaic graphics in colour c (set-after). */
export const mosaic = (c: C) => 0x10 + c;

export const FLASH = 0x08; // set-after
export const STEADY = 0x09; // set-at
export const END_BOX = 0x0a;
export const START_BOX = 0x0b;
export const NORMAL_SIZE = 0x0c; // set-at
export const DOUBLE_HEIGHT = 0x0d; // set-after
export const CONCEAL = 0x18; // set-at
export const CONTIGUOUS = 0x19; // set-at
export const SEPARATED = 0x1a; // set-at
export const BLACK_BG = 0x1c; // set-at
export const NEW_BG = 0x1d; // set-at
export const HOLD = 0x1e; // set-at
export const RELEASE = 0x1f; // set-after

export const SPACE = 0x20;

/** RGB of the eight teletext colours. */
export const RGB = ['#000000', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'];

/** Is a 7-bit code a sextant (block graphics) code in mosaic mode? 0x40-0x5f "blast through" as text. */
export const isSextant = (code: number) => (code >= 0x20 && code < 0x40) || code >= 0x60;

/** Sextant code from six pixels: [top-left, top-right, mid-left, mid-right, bottom-left, bottom-right]. */
export function sextant(px: ArrayLike<boolean | number>): number {
  let c = 0x20;
  if (px[0]) c |= 0x01;
  if (px[1]) c |= 0x02;
  if (px[2]) c |= 0x04;
  if (px[3]) c |= 0x08;
  if (px[4]) c |= 0x10;
  if (px[5]) c |= 0x40;
  return c;
}
