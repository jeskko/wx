import { describe, expect, it } from 'vitest';
import { encode, glyph } from './charset';
import { C, COLS } from './codes';
import { decode } from './decode';
import { Bitmap, Layout } from './page';

const rowText = (cells: ReturnType<typeof decode>, r: number) => cells[r].map((s) => (s.mosaic ? '#' : glyph(s.code))).join('');

describe('charset', () => {
  it('maps the Finnish letters into the national option positions', () => {
    expect(encode('ÄÖÅäöå')).toEqual([0x5b, 0x5c, 0x5d, 0x7b, 0x7c, 0x7d]);
  });
  it('transliterates what the subset lacks', () => {
    expect(encode('Võru −5°').map(glyph).join('')).toBe('Vöru -5');
    expect(encode('Bogotá').map(glyph).join('')).toBe('Bogota');
    expect(encode('[x]').map(glyph).join('')).toBe('(x)'); // the bracket positions hold Ä and Å
  });
});

describe('encoder + decoder', () => {
  it('spends a space on each colour change', () => {
    const L = new Layout();
    L.text(5, 1, 'Helsinki', C.White);
    L.text(5, 10, '+5', C.Yellow);
    const page = L.encode();
    expect(page[5 * COLS + 9]).toBe(C.Yellow); // the space before "+5" holds the attribute
    const d = decode(page);
    expect(rowText(d, 5).trimEnd()).toBe(' Helsinki +5');
    expect(d[5][10].fg).toBe(C.Yellow);
    expect(d[5][1].fg).toBe(C.White);
  });

  it('loses content (and says so) when there is no room for attributes', () => {
    const L = new Layout();
    L.text(3, 0, 'AB', C.White);
    L.text(3, 2, 'CD', C.Red); // no space between: C becomes the attribute
    const d = decode(L.encode());
    expect(rowText(d, 3).slice(0, 4)).toBe('AB D');
    expect(d[3][3].fg).toBe(C.Red);
    expect(L.lost.length).toBe(1);
  });

  it('builds background bars with New Background', () => {
    const L = new Layout();
    L.fill(1, 2, 39, C.Blue);
    L.text(1, 4, 'TITLE', C.Yellow, { bg: C.Blue });
    const d = decode(L.encode());
    expect(d[1][0].bg).toBe(C.Black);
    expect(d[1][1].bg).toBe(C.Blue); // New Background is set-at
    expect(d[1][4].fg).toBe(C.Yellow);
    expect(d[1][39].bg).toBe(C.Blue);
    expect(L.lost).toEqual([]);
  });

  it('double height hides the row below', () => {
    const L = new Layout();
    L.text(3, 2, 'BIG', C.White, { dh: true });
    L.text(4, 2, 'hidden', C.White);
    const d = decode(L.encode());
    expect(d[3][2].dh).toBe(1);
    expect(d[4][2].dh).toBe(2);
    expect(rowText(d, 4)).not.toContain('hidden');
  });

  it('draws mosaics with a text label in them', () => {
    const L = new Layout();
    const bm = new Bitmap(20, 3);
    bm.rect(0, 0, 19, 2, C.Green);
    L.blit(bm, 6, 1);
    L.text(6, 5, 'Ab', C.Green);
    for (const c of [4, 7]) L.rows[6][c].code = 0x20; // room for the attributes
    const d = decode(L.encode());
    expect(d[6][2].mosaic).toBe(true);
    expect(glyph(d[6][5].code) + glyph(d[6][6].code)).toBe('Ab');
    expect(d[6][5].mosaic).toBe(false);
    expect(d[6][8].mosaic).toBe(true);
    expect(L.lost).toEqual([]);
  });

  it('hold mosaics fills the attribute cell with the previous block', () => {
    const L = new Layout();
    for (let c = 0; c < 20; c++) L.mosaicCell(8, c, 0x7f, c < 10 ? C.Red : C.Yellow);
    L.hold.add(8);
    const d = decode(L.encode());
    // the colour change at column 10 costs a cell, which shows the held red block
    expect(d[8][9].mosaic && d[8][9].fg === C.Red).toBe(true);
    expect(d[8][11].fg).toBe(C.Yellow);
    expect(d[8].slice(2, 20).every((s) => s.mosaic && s.code === 0x7f)).toBe(true);
  });
});
