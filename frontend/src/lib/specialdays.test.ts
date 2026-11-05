import { describe, expect, it } from 'vitest';
import { easter, solarTerm, specialDays, specialDaysOn, upcomingSpecialDays } from './specialdays';

const byName = (y: number) => new Map(specialDays(y).map((s) => [s.name.fi, s]));

describe('special days', () => {
  it('computes Easter', () => {
    expect(easter(2025).toISOString().slice(0, 10)).toBe('2025-04-20');
    expect(easter(2026).toISOString().slice(0, 10)).toBe('2026-04-05');
    expect(easter(2027).toISOString().slice(0, 10)).toBe('2027-03-28');
  });
  it('computes moving holidays (2026)', () => {
    const d = byName(2026);
    expect(d.get('Pitkäperjantai')!.date).toBe('2026-04-03');
    expect(d.get('Helatorstai')!.date).toBe('2026-05-14');
    expect(d.get('Helluntaipäivä')!.date).toBe('2026-05-24');
    expect(d.get('Juhannusaatto')!.date).toBe('2026-06-19');
    expect(d.get('Pyhäinpäivä')!.date).toBe('2026-10-31');
    expect(byName(2025).get('Pyhäinpäivä')!.date).toBe('2025-11-01');
    expect(d.get('Mikkelinpäivä')!.date).toBe('2026-10-04');
    expect(d.get('Laskiaistiistai')!.date).toBe('2026-02-17');
    expect(d.get('Kesäaika alkaa: kellot tunti eteenpäin')!.date).toBe('2026-03-29');
    expect(d.get('Kesäaika päättyy: kellot tunti taaksepäin')!.date).toBe('2026-10-25');
  });
  it('finds equinoxes and solstices (vs. published times)', () => {
    // 2026: Mar 20 14:46 UTC, Jun 21 08:24, Sep 23 00:05, Dec 21 20:50
    for (const [t, want] of [[0, '2026-03-20T14:46'], [90, '2026-06-21T08:24'], [180, '2026-09-23T00:05'], [270, '2026-12-21T20:50']] as const) {
      expect(Math.abs(solarTerm(2026, t).getTime() - Date.parse(want + ':00Z'))).toBeLessThan(30 * 60_000);
    }
    expect(byName(2026).get('Talvipäivänseisaus')!.date).toBe('2026-12-21'); // 22:50 Finnish time
  });
  it('merges flag days that are also holidays', () => {
    const vappu = specialDays(2026).filter((s) => s.date === '2026-05-01');
    expect(vappu).toHaveLength(1);
    expect(vappu[0]).toMatchObject({ flag: true, holiday: true });
    const ind = specialDaysOn(new Date('2026-12-06T10:00:00Z'));
    expect(ind.map((s) => [s.name.fi, s.flag, s.holiday])).toEqual([['Itsenäisyyspäivä', true, true]]);
  });
  it('lists the next two weeks across new year', () => {
    const names = upcomingSpecialDays(new Date('2026-12-20T10:00:00Z'), 14).map((s) => s.name.fi);
    expect(names).toEqual(['Talvipäivänseisaus', 'Jouluaatto', 'Joulupäivä', 'Tapaninpäivä', 'Uudenvuodenaatto', 'Uudenvuodenpäivä']);
  });
});
