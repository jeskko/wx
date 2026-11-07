// G0 Latin with the Swedish/Finnish/Hungarian national option subset (ETS 300 706 table 36),
// the set Finnish broadcasters (Yle Teksti-TV) use. 13 positions of ASCII are swapped for
// É Ä Ö Å Ü é ä ö å ü ¤; there is no degree sign, no arrows and no other accented letters.

const NATIONAL: Record<number, string> = {
  0x23: '#',
  0x24: '¤',
  0x40: 'É',
  0x5b: 'Ä',
  0x5c: 'Ö',
  0x5d: 'Å',
  0x5e: 'Ü',
  0x5f: '_',
  0x60: 'é',
  0x7b: 'ä',
  0x7c: 'ö',
  0x7d: 'å',
  0x7e: 'ü',
};

/** Unicode character shown for a 7-bit code in alphanumeric mode (0x7f is the full block). */
export function glyph(code: number): string {
  if (code < 0x20) return ' ';
  if (code === 0x7f) return '■';
  return NATIONAL[code] ?? String.fromCharCode(code);
}

const ENCODE = new Map<string, number>();
for (let c = 0x20; c < 0x7f; c++) ENCODE.set(String.fromCharCode(c), c);
for (const k of Object.keys(NATIONAL)) ENCODE.delete(String.fromCharCode(Number(k)));
for (const [k, v] of Object.entries(NATIONAL)) ENCODE.set(v, Number(k));

/** Replacements for characters the subset lacks (typography, other alphabets). */
const SUBST: Record<string, string> = {
  '−': '-',
  '–': '-',
  '—': '-',
  '‐': '-',
  '…': '...',
  '’': "'",
  '‘': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '«': '"',
  '»': '"',
  '·': '.',
  '•': '*',
  '×': 'x',
  ' ': ' ',
  ' ': ' ',
  ß: 'ss',
  Æ: 'Ä',
  æ: 'ä',
  Ø: 'Ö',
  ø: 'ö',
  Þ: 'Th',
  þ: 'th',
  Ð: 'D',
  ð: 'd',
  Ł: 'L',
  ł: 'l',
  Õ: 'Ö',
  õ: 'ö',
  '°': '',
  // ASCII positions taken by the national letters
  $: '¤',
  '[': '(',
  ']': ')',
  '{': '(',
  '}': ')',
  '|': '!',
  '\\': '/',
  '~': '-',
  '^': '',
  '`': "'",
  '@': '(at)',
};

/** Encode a string into 7-bit codes of the Finnish subset, transliterating what it lacks. */
export function encode(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const direct = ENCODE.get(ch);
    if (direct != null) {
      out.push(direct);
      continue;
    }
    const sub = SUBST[ch];
    if (sub != null) {
      for (const c of sub) out.push(ENCODE.get(c) ?? 0x3f);
      continue;
    }
    // strip diacritics: Š -> S, á -> a; Ä/Ö/Å/Ü/É survive above
    const base = ch.normalize('NFD').replace(/\p{M}/gu, '');
    const b = base.length === 1 ? ENCODE.get(base) : undefined;
    out.push(b ?? 0x3f);
  }
  return out;
}

/** Length in cells of a string once encoded. */
export const width = (s: string) => encode(s).length;
