import { describe, expect, it } from 'vitest';
import { duration } from './format';

describe('duration', () => {
  it('never shows 60 minutes', () => {
    expect(duration(299.6)).toBe('5 h 00 min');
    expect(duration(134.2)).toBe('2 h 14 min');
    expect(duration(1440)).toBe('24 h 00 min');
  });
});
