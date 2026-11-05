// Finnish flag flying days, computed from the rules published by the Ministry of the Interior
// (intermin.fi/suomen-lippu/liputuspaivat): official days (flag decree 383/1978) and the
// established days listed in the Valtiokalenteri. Election days follow the election act:
// parliamentary elections on the third Sunday of April every 4 years (2027, 2031 ...),
// municipal + regional elections on the second Sunday of April (2029, 2033 ...), presidential
// elections on the fourth Sunday of January every 6 years (2030 ...) with the president taking
// office on 1 March. Early elections, second presidential rounds, European Parliament
// elections and referendums are not predictable: add them to EXTRA when announced.

import type { Lang } from './types';

export interface FlagDay {
  /** YYYY-MM-DD (Finnish calendar date) */
  date: string;
  name: Record<Lang, string>;
  official: boolean;
}

type Rule = { name: Record<Lang, string>; official: boolean; md?: [number, number]; nth?: [month: number, weekday: number, n: number]; between?: [month: number, from: number, to: number, weekday: number]; lastWeekday?: [month: number, weekday: number]; from?: number };

const SUN = 0;
const SAT = 6;

const RULES: Rule[] = [
  // official
  { md: [2, 28], official: true, name: { fi: 'Kalevalan päivä', en: 'Kalevala Day' } },
  { md: [5, 1], official: true, name: { fi: 'Vappu, suomalaisen työn päivä', en: 'May Day' } },
  { nth: [5, SUN, 2], official: true, name: { fi: 'Äitienpäivä', en: "Mother's Day" } },
  { md: [6, 4], official: true, name: { fi: 'Puolustusvoimain lippujuhlan päivä', en: 'Flag Day of the Defence Forces' } },
  { between: [6, 20, 26, SAT], official: true, name: { fi: 'Juhannuspäivä, Suomen lipun päivä', en: 'Midsummer Day, Day of the Finnish Flag' } },
  { nth: [11, SUN, 2], official: true, name: { fi: 'Isänpäivä', en: "Father's Day" } },
  { md: [12, 6], official: true, name: { fi: 'Itsenäisyyspäivä', en: 'Independence Day' } },
  // established
  { md: [2, 5], official: false, name: { fi: 'J. L. Runebergin päivä', en: 'Runeberg Day' } },
  { md: [3, 19], official: false, name: { fi: 'Minna Canthin päivä, tasa-arvon päivä', en: 'Minna Canth Day, Day of Equality' } },
  { md: [4, 9], official: false, name: { fi: 'Mikael Agricolan päivä, suomen kielen päivä', en: 'Day of the Finnish Language' } },
  { md: [4, 20], official: false, from: 2025, name: { fi: 'Evakkojen liputuspäivä', en: 'Evacuees’ Flag Day' } },
  { md: [4, 27], official: false, name: { fi: 'Kansallinen veteraanipäivä', en: 'National Veterans’ Day' } },
  { md: [5, 9], official: false, name: { fi: 'Eurooppa-päivä', en: 'Europe Day' } },
  { md: [5, 12], official: false, name: { fi: 'J. V. Snellmanin päivä, suomalaisuuden päivä', en: 'Snellman Day, Day of Finnish Heritage' } },
  { nth: [5, SUN, 3], official: false, name: { fi: 'Kaatuneitten muistopäivä', en: 'Remembrance Day' } },
  { md: [7, 6], official: false, name: { fi: 'Eino Leinon päivä, runon ja suven päivä', en: 'Eino Leino Day' } },
  { lastWeekday: [8, SAT], official: false, from: 2020, name: { fi: 'Suomen luonnon päivä', en: 'Finnish Nature Day' } },
  { md: [10, 1], official: false, name: { fi: 'Miina Sillanpään ja kansalaisvaikuttamisen päivä', en: 'Miina Sillanpää Day' } },
  { md: [10, 10], official: false, name: { fi: 'Aleksis Kiven päivä, suomalaisen kirjallisuuden päivä', en: 'Day of Finnish Literature' } },
  { md: [10, 24], official: false, name: { fi: 'YK:n päivä', en: 'United Nations Day' } },
  { md: [11, 6], official: false, name: { fi: 'Ruotsalaisuuden päivä', en: 'Swedish Heritage Day' } },
  { md: [11, 20], official: false, name: { fi: 'Lapsen oikeuksien päivä', en: 'Day of Children’s Rights' } },
  { md: [12, 8], official: false, name: { fi: 'Jean Sibeliuksen päivä, suomalaisen musiikin päivä', en: 'Sibelius Day, Day of Finnish Music' } },
];

/** Announced one-off official days (early elections, EU elections, referendums ...). */
const EXTRA: FlagDay[] = [];

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const weekday = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();

/** n-th given weekday of a month (n = 1..5). */
function nthWeekday(y: number, m: number, wd: number, n: number): number {
  const first = (wd - weekday(y, m, 1) + 7) % 7 + 1;
  return first + (n - 1) * 7;
}

function lastWeekday(y: number, m: number, wd: number): number {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return last - ((weekday(y, m, last) - wd + 7) % 7);
}

export function flagDays(y: number): FlagDay[] {
  const out: FlagDay[] = [];
  for (const r of RULES) {
    if (r.from && y < r.from) continue;
    let m = 0;
    let d = 0;
    if (r.md) [m, d] = r.md;
    else if (r.nth) [m, d] = [r.nth[0], nthWeekday(y, r.nth[0], r.nth[1], r.nth[2])];
    else if (r.lastWeekday) [m, d] = [r.lastWeekday[0], lastWeekday(y, r.lastWeekday[0], r.lastWeekday[1])];
    else if (r.between) {
      m = r.between[0];
      for (let x = r.between[1]; x <= r.between[2]; x++) if (weekday(y, m, x) === r.between[3]) d = x;
    }
    out.push({ date: ymd(y, m, d), name: r.name, official: r.official });
  }
  if (y >= 2027 && (y - 2027) % 4 === 0)
    out.push({ date: ymd(y, 4, nthWeekday(y, 4, SUN, 3)), official: true, name: { fi: 'Eduskuntavaalit', en: 'Parliamentary elections' } });
  if (y >= 2029 && (y - 2029) % 4 === 0)
    out.push({ date: ymd(y, 4, nthWeekday(y, 4, SUN, 2)), official: true, name: { fi: 'Kunta- ja aluevaalit', en: 'Municipal and regional elections' } });
  if (y >= 2030 && (y - 2030) % 6 === 0) {
    out.push({ date: ymd(y, 1, nthWeekday(y, 1, SUN, 4)), official: true, name: { fi: 'Presidentinvaali', en: 'Presidential election' } });
    out.push({ date: ymd(y, 3, 1), official: true, name: { fi: 'Tasavallan presidentin virkaanastujaispäivä', en: 'Presidential inauguration' } });
  }
  out.push(...EXTRA.filter((x) => x.date.startsWith(`${y}-`)));
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Flag days on the Finnish calendar date of `now` (usually zero or one). */
export function flagDaysOn(now: Date): FlagDay[] {
  const date = now.toLocaleDateString('en-CA', { timeZone: 'Europe/Helsinki' });
  return flagDays(Number(date.slice(0, 4))).filter((f) => f.date === date);
}
