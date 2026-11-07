// Page builder: composers describe what each cell should look like (character, colours, mosaic,
// double height); `encode()` compiles that into real Level 1.5 page bytes, spending a cell on
// every attribute change exactly as a teletext editor would. Attributes go into spaces just
// before the change when there are any; otherwise they overwrite content (and we log it), so a
// page that renders here would render the same on a 1980s TV set.

import { encode as encodeText } from './charset';
import {
  BLACK_BG,
  C,
  COLS,
  CONTIGUOUS,
  DOUBLE_HEIGHT,
  FLASH,
  HOLD,
  isSextant,
  NEW_BG,
  NORMAL_SIZE,
  ROWS,
  SEPARATED,
  SPACE,
  STEADY,
  alpha,
  mosaic,
} from './codes';

export interface Cell {
  code: number;
  fg: C;
  bg: C;
  mosaic: boolean;
  sep: boolean;
  dh: boolean;
  flash: boolean;
}

export interface TextOpts {
  bg?: C;
  dh?: boolean;
  flash?: boolean;
}

const blank = (bg: C = C.Black): Cell => ({ code: SPACE, fg: C.White, bg, mosaic: false, sep: false, dh: false, flash: false });

/** A 2×3-pixel-per-cell bitmap; pixel value is a colour 1-7, 0 = off. */
export class Bitmap {
  readonly px: Uint8Array;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.px = new Uint8Array(w * h);
  }
  get(x: number, y: number): number {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.px[y * this.w + x];
  }
  set(x: number, y: number, c: number): void {
    x = Math.round(x);
    y = Math.round(y);
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
  }
  rect(x0: number, y0: number, x1: number, y1: number, c: number): void {
    for (let y = Math.max(0, y0); y <= Math.min(this.h - 1, y1); y++) for (let x = Math.max(0, x0); x <= Math.min(this.w - 1, x1); x++) this.px[y * this.w + x] = c;
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number): void {
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
    for (let i = 0; i <= n; i++) this.set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
  }
}

export class Layout {
  readonly rows: Cell[][];
  /** content lost to attributes while encoding (debug aid) */
  readonly lost: string[] = [];
  /** rows encoded with Hold Mosaics: attribute cells repeat the previous block instead of a
   *  gap, so colour fields (tropo map) stay solid across colour changes */
  readonly hold = new Set<number>();

  constructor() {
    this.rows = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => blank()));
  }

  private put(row: number, col: number, cell: Partial<Cell>): void {
    if (row < 0 || row >= ROWS || col < 0 || col >= COLS) return;
    Object.assign(this.rows[row][col], cell);
  }

  /** Write text from `col`; returns the column after it. Characters beyond the row are dropped. */
  text(row: number, col: number, s: string, fg: C = C.White, o: TextOpts = {}): number {
    for (const code of encodeText(s)) {
      if (col >= COLS) break;
      const cur = this.rows[row]?.[col];
      this.put(row, col, { code, fg, mosaic: false, sep: false, dh: !!o.dh, flash: !!o.flash, bg: o.bg ?? cur?.bg ?? C.Black });
      col++;
    }
    return col;
  }

  /** Right-align text so that it ends just before column `end`. */
  right(row: number, end: number, s: string, fg: C = C.White, o: TextOpts = {}): void {
    this.text(row, end - encodeText(s).length, s, fg, o);
  }

  center(row: number, s: string, fg: C = C.White, o: TextOpts = {}, from = 0, to = COLS): void {
    const n = encodeText(s).length;
    this.text(row, from + Math.max(0, Math.floor((to - from - n) / 2)), s, fg, o);
  }

  /** Background colour for columns col0..col1 (inclusive). */
  fill(row: number, col0: number, col1: number, bg: C): void {
    for (let c = Math.max(0, col0); c <= Math.min(COLS - 1, col1); c++) this.rows[row][c].bg = bg;
  }

  mosaicCell(row: number, col: number, code: number, fg: C, sep = false, dh = false): void {
    this.put(row, col, { code, fg, mosaic: true, sep, dh, flash: false });
  }

  /** Place a bitmap with its top-left at (row, col). Each cell takes the most common colour of
   *  its six pixels; pixels in other colours are lost (one foreground colour per cell). */
  blit(bm: Bitmap, row: number, col: number, sep = false): void {
    for (let cy = 0; cy * 3 < bm.h; cy++) {
      for (let cx = 0; cx * 2 < bm.w; cx++) {
        const px = [bm.get(cx * 2, cy * 3), bm.get(cx * 2 + 1, cy * 3), bm.get(cx * 2, cy * 3 + 1), bm.get(cx * 2 + 1, cy * 3 + 1), bm.get(cx * 2, cy * 3 + 2), bm.get(cx * 2 + 1, cy * 3 + 2)];
        const count = new Map<number, number>();
        for (const p of px) if (p) count.set(p, (count.get(p) ?? 0) + 1);
        if (!count.size) continue;
        const fg = [...count.entries()].sort((a, b) => b[1] - a[1])[0][0] as C;
        let code = 0x20;
        const bits = [0x01, 0x02, 0x04, 0x08, 0x10, 0x40];
        px.forEach((p, i) => p === fg && (code |= bits[i]));
        const cell = this.rows[row + cy]?.[col + cx];
        if (cell) this.put(row + cy, col + cx, { code, fg, mosaic: true, sep, dh: false, flash: false });
      }
    }
  }

  /** Horizontal mosaic rule (top or bottom third of the cells). */
  rule(row: number, col0: number, col1: number, fg: C, where: 'top' | 'bottom' | 'middle' = 'bottom'): void {
    const code = where === 'top' ? 0x23 : where === 'middle' ? 0x2c : 0x70;
    for (let c = col0; c <= col1; c++) this.mosaicCell(row, c, code, fg);
  }

  /** Compile into 25×40 page bytes (row 0 is left for the header unless fromRow = 0). */
  encode(fromRow = 1): Uint8Array {
    const out = new Uint8Array(ROWS * COLS).fill(SPACE);
    for (let r = fromRow; r < ROWS; r++) out.set(this.encodeRow(r), r * COLS);
    return out;
  }

  private encodeRow(r: number): number[] {
    const cells = this.rows[r];
    const out: number[] = new Array(COLS).fill(SPACE);
    // free[i]: out[i] is a space that may host an attribute without changing what is seen
    const free: boolean[] = new Array(COLS).fill(false);
    let fg: C = C.White;
    let isMosaic = false;
    let bg: C = C.Black;
    let sep = false;
    let dh = false;
    let flash = false;
    let holdPending = this.hold.has(r);

    for (let i = 0; i < COLS; i++) {
      const c = cells[i];
      const ops: number[] = [];
      const isSpace = c.code === SPACE && !c.flash;
      if (c.bg !== bg) {
        if (c.bg === C.Black) ops.push(BLACK_BG);
        else {
          // New Background takes the current foreground colour
          if (fg !== c.bg) ops.push(isMosaic ? mosaic(c.bg) : alpha(c.bg));
          ops.push(NEW_BG);
        }
      }
      const bgFg: C = ops.length && c.bg !== C.Black ? c.bg : fg; // fg after the background ops
      if (!isSpace) {
        // (capitals would "blast through" in mosaic mode, but a word rarely stays in capitals:
        // switching to text up front costs the same one cell and never strands a lower-case letter)
        if (c.mosaic !== isMosaic || c.fg !== bgFg) ops.push(c.mosaic ? mosaic(c.fg) : alpha(c.fg));
        if (c.mosaic && c.sep !== sep) ops.push(c.sep ? SEPARATED : CONTIGUOUS);
        if (c.dh !== dh) ops.push(c.dh ? DOUBLE_HEIGHT : NORMAL_SIZE);
        if (c.flash !== flash) ops.push(c.flash ? FLASH : STEADY);
      }

      if (ops.length && holdPending) {
        ops.unshift(HOLD);
        holdPending = false;
      }
      if (ops.length) {
        // spaces just before this cell take the attributes
        let room = 0;
        while (room < ops.length && i - 1 - room >= 0 && free[i - 1 - room]) room++;
        // never overwrite an earlier attribute: if the spaces run out, the attributes eat into
        // this cell and the ones after it instead (that content is lost)
        const pos = i - room;
        if (room < ops.length && !this.hold.has(r)) this.lost.push(`r${r}c${i}: ${ops.length - room} cell(s) lost`);
        for (let j = 0; j < ops.length && pos + j < COLS; j++) {
          out[pos + j] = ops[j];
          free[pos + j] = false;
        }
        for (const op of ops) {
          if (op === BLACK_BG) bg = C.Black;
          else if (op === NEW_BG) bg = fg;
          else if (op < 0x08) {
            fg = op as C;
            isMosaic = false;
          } else if (op >= 0x10 && op < 0x18) {
            fg = (op - 0x10) as C;
            isMosaic = true;
          } else if (op === SEPARATED) sep = true;
          else if (op === CONTIGUOUS) sep = false;
          else if (op === DOUBLE_HEIGHT) dh = true;
          else if (op === NORMAL_SIZE) dh = false;
          else if (op === FLASH) flash = true;
          else if (op === STEADY) flash = false;
        }
        const end = pos + ops.length; // first cell not used by attributes
        if (end > i) {
          i = end - 1; // cells i..end-1 were consumed
          continue;
        }
      }
      out[i] = c.code;
      free[i] = isSpace;
    }
    return out;
  }
}
