import { describe, expect, it } from 'vitest';
import { airportTz, dayTime, decodeMetar, decodeTaf, weather } from './avdecode';

// Thursday 2026-11-05 10:30 Finnish time
const now = new Date('2026-11-05T08:30:00Z');

describe('weather', () => {
  it('builds Finnish phrases with the right intensity and number', () => {
    expect(weather('fi', '-SHRA')).toBe('heikkoja vesikuuroja');
    expect(weather('fi', '+RA')).toBe('voimakasta vesisadetta');
    expect(weather('fi', '-SNRA')).toBe('heikkoa räntäsadetta');
    expect(weather('fi', 'SHRAGS')).toBe('vesi- ja raekuuroja');
    expect(weather('fi', 'FZFG')).toBe('jäätävää sumua');
    expect(weather('fi', 'BCFG')).toBe('sumulauttoja');
    expect(weather('fi', 'VCSH')).toBe('kuuroja lähistöllä');
    expect(weather('fi', '-TSRA')).toBe('ukkosta ja heikkoa vesisadetta');
    expect(weather('fi', 'BLSN')).toBe('lumipyryä');
    expect(weather('fi', '-GR')).toBe('heikkoja rakeita');
  });
  it('builds English phrases', () => {
    expect(weather('en', '-SHSN')).toBe('light snow showers');
    expect(weather('en', 'FZDZ')).toBe('freezing drizzle');
    expect(weather('en', 'VCFG')).toBe('fog in the vicinity');
    expect(weather('en', 'TS')).toBe('thunderstorm');
  });
  it('rejects non-weather tokens', () => {
    expect(weather('fi', 'CAVOK')).toBeNull();
    expect(weather('fi', 'NOSIG')).toBeNull();
    expect(weather('fi', '9999')).toBeNull();
  });
});

describe('dayTime', () => {
  it('picks the month nearest to the reference and rolls hour 24 over', () => {
    expect(dayTime(now, 6, 24).toISOString()).toBe('2026-11-07T00:00:00.000Z');
    expect(dayTime(now, 31, 21).toISOString()).toBe('2026-10-31T21:00:00.000Z');
    expect(dayTime(new Date('2026-12-31T22:00:00Z'), 1, 6).toISOString()).toBe('2027-01-01T06:00:00.000Z');
  });
});

describe('airportTz', () => {
  it('maps Nordic prefixes and falls back to UTC', () => {
    expect(airportTz('EFHK')).toBe('Europe/Helsinki');
    expect(airportTz('ESSA')).toBe('Europe/Stockholm');
    expect(airportTz('KJFK')).toBe('UTC');
  });
});

describe('decodeMetar', () => {
  it('decodes a Finnish CAVOK observation in local time', () => {
    const d = decodeMetar('METAR EFRO 050820Z AUTO 30009KT 260V330 CAVOK 02/M03 Q1009', 'fi', { icao: 'EFRO', now });
    expect(d.time).toBe('klo 10.20');
    expect(d.auto).toBe(true);
    expect(d.main.items).toEqual([
      'Luoteistuulta 5 m/s (suunta vaihtelee 260–330°)',
      'Näkyvyys yli 10 km, ei merkittäviä pilviä',
      'Lämpötila +2°, kastepiste −3°',
      'Ilmanpaine 1009 hPa',
    ]);
    expect(d.main.other).toEqual([]);
  });

  it('decodes fog, runway visual range and a TEMPO trend', () => {
    const d = decodeMetar('METAR EKCH 050749Z 25005KT 0500 R22L/0350N R04L/0200N R12/0300N FG VV002 03/03 Q1033 TEMPO 1200 SCT020', 'en', { icao: 'EKCH', now });
    expect(d.time).toBe('08:49');
    expect(d.main.items).toEqual([
      'West wind 3 m/s',
      'Visibility 500 m',
      'Runway visual range 22L: 350 m, 04L: 200 m, 12: 300 m',
      'Fog',
      'Sky obscured, vertical visibility 60 m',
      'Temperature +3°, dew point +3°',
      'Pressure 1033 hPa',
    ]);
    expect(d.trend).toEqual([{ head: 'Temporarily', items: ['Visibility 1.2 km', 'Scattered clouds at 610 m'], other: [] }]);
  });

  it('handles calm wind, NOSIG and drops remarks', () => {
    const d = decodeMetar('METAR ENBR 050750Z 00000KT 9999 VCFG FEW044 03/03 Q1035 NOSIG RMK WIND 1200FT 36012KT', 'fi', { icao: 'ENBR', now });
    expect(d.main.items.slice(0, 4)).toEqual(['Tyyntä', 'Näkyvyys yli 10 km', 'Sumua lähistöllä', 'Muutamia pilviä 1 300 metrissä']);
    expect(d.trend).toEqual([{ head: null, items: ['Ei merkittäviä muutoksia odotettavissa'], other: [] }]);
  });

  it('keeps unknown groups verbatim', () => {
    const d = decodeMetar('METAR EFHK 050820Z 29012KT 9999 FEW020 06/02 Q1018 R04L/290045', 'fi', { icao: 'EFHK', now });
    expect(d.main.other).toEqual(['R04L/290045']);
  });
});

describe('decodeTaf', () => {
  it('decodes validity, change groups and probabilities in Finnish', () => {
    const d = decodeTaf('TAF EFKU 050526Z 0506/0606 30014KT CAVOK TEMPO 0506/0511 31018G28KT TEMPO 0511/0516 7000 -SHRA SCT025CB PROB40 TEMPO 0511/0515 32018G28KT', 'fi', {
      icao: 'EFKU',
      from: '2026-11-05T06:00:00Z',
      now,
    });
    expect(d.valid).toBe('klo 8 – pe klo 8');
    expect(d.groups.map((g) => g.head)).toEqual([null, 'Ajoittain klo 8–13', 'Ajoittain klo 13–18', '40 %:n todennäköisyydellä ajoittain klo 13–17']);
    expect(d.groups[0].items).toEqual(['Luoteistuulta 7 m/s', 'Näkyvyys yli 10 km, ei merkittäviä pilviä']);
    expect(d.groups[2].items).toEqual(['Näkyvyys 7 km', 'Heikkoja vesikuuroja', 'Hajanaisia ukkospilviä 760 metrissä']);
    expect(d.groups[3].items).toEqual(['Luoteistuulta 9 m/s, puuskissa 14 m/s']);
  });

  it('decodes FM groups, BECMG and max/min temperatures in English', () => {
    const d = decodeTaf('TAF BIKF 050741Z 0509/0609 16023G33KT 9999 -RADZ BKN008 OVC015 TX09/0511Z TN04/0609Z BECMG 0516/0518 23012KT FM060300 VRB03KT 9999 NSC', 'en', {
      icao: 'BIKF',
      from: '2026-11-05T09:00:00Z',
      now,
    });
    expect(d.valid).toBe('09:00 – Fri 09:00');
    expect(d.groups[0].items).toContain('Maximum temperature +9° (11:00)');
    expect(d.groups[0].items).toContain('Light rain and drizzle');
    expect(d.groups[1].head).toBe('Becoming 16:00–18:00');
    expect(d.groups[2]).toEqual({ head: 'From Fri 03:00', items: ['Variable wind 2 m/s', 'Visibility 10+ km', 'No significant cloud'], other: [] });
  });

  it('flags cancelled forecasts', () => {
    expect(decodeTaf('TAF AMD EFHK 051200Z 0512/0612 CNL', 'fi', { icao: 'EFHK', now }).cancelled).toBe(true);
  });
});
