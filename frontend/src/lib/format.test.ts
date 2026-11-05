import { describe, expect, it } from 'vitest';
import { duration, num, visibility } from './format';

describe('duration', () => {
  it('never shows 60 minutes', () => {
    expect(duration(299.6)).toBe('5 h 00 min');
    expect(duration(134.2)).toBe('2 h 14 min');
    expect(duration(1440)).toBe('24 h 00 min');
  });
});

describe('num', () => {
  it('uses a decimal comma in Finnish and a point in English', () => {
    expect(num('fi', 1.67, 1)).toBe('1,7');
    expect(num('en', 1.67, 1)).toBe('1.7');
    expect(num('fi', 12)).toBe('12');
    expect(num('fi', -3.24, 1)).toBe('−3,2');
    expect(num('fi', -0.04, 1)).toBe('0,0');
    expect(num('en', null)).toBe('–');
  });
  it('formats visibility with the same rule', () => {
    expect(visibility('fi', 2500)).toBe('2,5 km');
    expect(visibility('en', 2500)).toBe('2.5 km');
  });
});
