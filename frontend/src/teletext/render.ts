// Canvas painter for decoded cells. Text uses Bedstead (public domain SAA5050 lookalike,
// https://bjh21.me.uk/bedstead/); block graphics are drawn as rectangles.

import fontUrl from './bedstead.otf?url';
import { glyph } from './charset';
import { RGB } from './codes';
import type { Shown } from './decode';

let fontReady: Promise<void> | null = null;

export function loadFont(): Promise<void> {
  fontReady ??= (async () => {
    try {
      const f = new FontFace('Bedstead', `url(${fontUrl})`);
      await f.load();
      document.fonts.add(f);
    } catch {
      /* falls back to monospace */
    }
  })();
  return fontReady;
}

// sextant rows are 3/10, 4/10, 3/10 of the cell height (SAA5050)
const ROW_Y = [0, 0.3, 0.7, 1];
const BITS = [
  [0x01, 0x02],
  [0x04, 0x08],
  [0x10, 0x40],
];

/** Paint all cells into a w×h area starting at (x0, y0). `flashOn` is the flash phase. */
export function paint(g: CanvasRenderingContext2D, cells: Shown[][], x0: number, y0: number, w: number, h: number, flashOn: boolean, reveal = false): void {
  const rows = cells.length;
  const cols = cells[0].length;
  const cw = w / cols;
  const ch = h / rows;
  const sx = cw / (0.6 * ch); // Bedstead's em is 600×1000 per cell
  g.textBaseline = 'alphabetic';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const s = cells[r][c];
      // integer edges so neighbouring cells don't leave hairlines
      const x = Math.round(x0 + c * cw);
      const y = Math.round(y0 + r * ch);
      const xe = Math.round(x0 + (c + 1) * cw);
      const ye = Math.round(y0 + (r + 1) * ch);
      g.fillStyle = RGB[s.bg];
      g.fillRect(x, y, xe - x, ye - y);
      if (s.code === 0x20 || (s.flash && !flashOn) || (s.conceal && !reveal)) continue;
      g.fillStyle = RGB[s.fg];
      // double height: the glyph is stretched over two rows; each half is drawn clipped to its row
      const top = s.dh === 2 ? y0 + (r - 1) * ch : y0 + r * ch;
      const hh = s.dh ? 2 * ch : ch;
      if (s.dh) {
        g.save();
        g.beginPath();
        g.rect(x, y, xe - x, ye - y);
        g.clip();
      }
      if (s.mosaic) {
        const bx = [x0 + c * cw, x0 + (c + 0.5) * cw, x0 + (c + 1) * cw];
        for (let k = 0; k < 3; k++)
          for (let j = 0; j < 2; j++) {
            if (!(s.code & BITS[k][j])) continue;
            let px0 = bx[j];
            let px1 = bx[j + 1];
            let py0 = top + ROW_Y[k] * hh;
            let py1 = top + ROW_Y[k + 1] * hh;
            if (s.sep) {
              // separated graphics: a background gap on the left and bottom of every block
              px0 += cw / 6;
              py1 -= hh / 10;
            }
            g.fillRect(Math.round(px0), Math.round(py0), Math.round(px1) - Math.round(px0), Math.round(py1) - Math.round(py0));
          }
      } else {
        g.save();
        g.translate(x0 + c * cw, top);
        g.scale(sx, hh / ch);
        g.font = `${ch}px Bedstead, monospace`;
        g.fillText(glyph(s.code), 0, 0.8 * ch);
        g.restore();
      }
      if (s.dh) g.restore();
    }
  }
}
