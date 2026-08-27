// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CITY_BY_ID, cityMatches } from './cities';

const london = CITY_BY_ID.get('london')!;
const newYork = CITY_BY_ID.get('new-york')!;

describe('cityMatches', () => {
  it('matches by city name (case-insensitive)', () => {
    expect(cityMatches(london, 'LOND')).toBe(true);
    expect(cityMatches(london, 'paris')).toBe(false);
  });

  it('matches the displayed short country form', () => {
    expect(cityMatches(london, 'uk')).toBe(true);
    expect(cityMatches(newYork, 'usa')).toBe(true);
  });

  it('matches full country names via aliases', () => {
    expect(cityMatches(london, 'united kingdom')).toBe(true);
    expect(cityMatches(london, 'britain')).toBe(true);
    expect(cityMatches(newYork, 'united states')).toBe(true);
    expect(cityMatches(newYork, 'america')).toBe(true);
  });

  it('treats an empty/whitespace query as match-all', () => {
    expect(cityMatches(london, '')).toBe(true);
    expect(cityMatches(london, '   ')).toBe(true);
  });
});
