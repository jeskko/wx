// Level 1.5 page decoder: 25×40 bytes -> what a TV shows in each cell. Follows the spacing
// attribute rules of ETS 300 706 §12.2 (set-at / set-after, hold mosaics, double height hiding
// the row below), so the renderer can't show anything a real decoder wouldn't.

import { C, COLS, ROWS, SPACE, isSextant } from './codes';

export interface Shown {
  /** 7-bit code to draw (SPACE for nothing) */
  code: number;
  /** draw as block graphics */
  mosaic: boolean;
  sep: boolean;
  fg: C;
  bg: C;
  flash: boolean;
  conceal: boolean;
  /** 0 normal, 1 top half of double height, 2 bottom half */
  dh: 0 | 1 | 2;
}

export function decode(page: Uint8Array): Shown[][] {
  const rows: Shown[][] = [];
  let prevDh = false;
  for (let r = 0; r < ROWS; r++) {
    if (prevDh && r < ROWS - 1) {
      // the row under a double-height row repeats it as bottom halves; its own bytes are ignored
      rows.push(rows[r - 1].map((s) => (s.dh === 1 ? { ...s, dh: 2 } : { ...s, code: SPACE, mosaic: false, dh: 0 })));
      prevDh = false;
      continue;
    }
    let fg: C = C.White;
    let bg: C = C.Black;
    let mosaic = false;
    let sep = false;
    let hold = false;
    let held = SPACE;
    let heldSep = false;
    let dh = false;
    let flash = false;
    let conceal = false;
    let rowDh = false;
    const out: Shown[] = [];
    for (let c = 0; c < COLS; c++) {
      const b = page[r * COLS + c] & 0x7f;
      // set-at attributes
      if (b < 0x20) {
        if (b === 0x09) flash = false;
        else if (b === 0x0c && dh) {
          dh = false;
          held = SPACE;
        } else if (b === 0x18) conceal = true;
        else if (b === 0x19) sep = false;
        else if (b === 0x1a) sep = true;
        else if (b === 0x1c) bg = C.Black;
        else if (b === 0x1d) bg = fg;
        else if (b === 0x1e) hold = true;
      }
      // what this cell shows
      let code: number;
      let m: boolean;
      let s = sep;
      if (b < 0x20) {
        if (hold && mosaic) {
          code = held;
          m = true;
          s = heldSep;
        } else {
          code = SPACE;
          m = false;
        }
      } else {
        code = b;
        m = mosaic && isSextant(b);
        if (m) {
          held = b;
          heldSep = sep;
        }
      }
      const isDh = dh && r > 0 && r < ROWS - 2;
      if (isDh) rowDh = true;
      out.push({ code, mosaic: m, sep: s, fg, bg, flash, conceal, dh: isDh ? 1 : 0 });
      // set-after attributes
      if (b < 0x20) {
        if (b >= 0x01 && b <= 0x07) {
          fg = b as C;
          if (mosaic) held = SPACE;
          mosaic = false;
          conceal = false;
        } else if (b >= 0x11 && b <= 0x17) {
          fg = (b - 0x10) as C;
          if (!mosaic) held = SPACE;
          mosaic = true;
          conceal = false;
        } else if (b === 0x08) flash = true;
        else if (b === 0x0d && !dh) {
          dh = true;
          held = SPACE;
        } else if (b === 0x1f) hold = false;
      }
    }
    rows.push(out);
    prevDh = rowDh;
  }
  return rows;
}
