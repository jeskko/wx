import { describe, expect, it } from 'vitest';
import { flagDays, flagDaysOn, mergeElections } from './flagdays';

const on = (y: number) => new Map(flagDays(y).map((f) => [f.name.en, f.date]));

describe('flag days', () => {
  it('computes the moving days', () => {
    const d26 = on(2026);
    expect(d26.get("Mother's Day")).toBe('2026-05-10');
    expect(d26.get('Remembrance Day')).toBe('2026-05-17');
    expect(d26.get('Midsummer Day, Day of the Finnish Flag')).toBe('2026-06-20');
    expect(d26.get('Finnish Nature Day')).toBe('2026-08-29');
    expect(d26.get("Father's Day")).toBe('2026-11-08');
    expect(on(2025).get('Midsummer Day, Day of the Finnish Flag')).toBe('2025-06-21');
    expect(on(2024).get("Father's Day")).toBe('2024-11-10');
  });
  it('has 7 official + 16 established days in a year without elections', () => {
    const fs = flagDays(2026);
    expect(fs.filter((f) => f.official)).toHaveLength(7);
    expect(fs.filter((f) => !f.official)).toHaveLength(16);
  });
  it('adds elections by the election act', () => {
    expect(on(2027).get('Parliamentary elections')).toBe('2027-04-18');
    expect(on(2029).get('Municipal and regional elections')).toBe('2029-04-08');
    expect(on(2025).get('Municipal and regional elections')).toBeUndefined();
    expect(on(2030).get('Presidential election')).toBe('2030-01-27');
    expect(on(2030).get('Presidential inauguration')).toBe('2030-03-01');
  });
  it('uses the Finnish calendar date', () => {
    expect(flagDaysOn(new Date('2026-12-05T22:30:00Z')).map((f) => f.name.fi)).toEqual(['Itsenäisyyspäivä']); // 00:30 in Helsinki
    expect(flagDaysOn(new Date('2026-11-05T12:00:00Z'))).toEqual([]);
  });
});

describe('Wikidata elections', () => {
  const wd = [
    { date: '2027-04-18', kind: 'parliamentary', name: { fi: 'Eduskuntavaalit', en: 'Parliamentary election' }, qid: 'Q1' },
    { date: '2027-04-25', kind: 'parliamentary', name: { fi: 'Eduskuntavaalit', en: 'x' }, qid: 'Q2' }, // disagrees: computed wins
    { date: '2029-06-10', kind: 'eu', name: { fi: 'Europarlamenttivaalit', en: 'European Parliament election' }, qid: 'Q3' },
    { date: '2030-02-10', kind: 'presidential2', name: { fi: 'Presidentinvaalin toinen kierros', en: 'Second round' }, qid: 'Q4' },
    { date: '2028-03-05', kind: 'parliamentary', name: { fi: 'Ennenaikaiset eduskuntavaalit', en: 'Snap election' }, qid: 'Q5' },
  ];
  const names = (y: number) => mergeElections(flagDays(y), wd, y).filter((f) => f.kind).map((f) => `${f.date} ${f.name.fi}`);
  it('keeps computed regular elections and adds the unpredictable ones', () => {
    expect(names(2027)).toEqual(['2027-04-18 Eduskuntavaalit']);
    expect(names(2029)).toEqual(['2029-04-08 Kunta- ja aluevaalit', '2029-06-10 Europarlamenttivaalit']);
    expect(names(2030)).toEqual(['2030-01-27 Presidentinvaali', '2030-02-10 Presidentinvaalin toinen kierros']);
    expect(names(2028)).toEqual(['2028-03-05 Ennenaikaiset eduskuntavaalit']);
  });
  it('shows them on the day', () => {
    expect(flagDaysOn(new Date('2029-06-10T10:00:00Z'), wd).map((f) => f.name.en)).toEqual(['European Parliament election']);
  });
});
