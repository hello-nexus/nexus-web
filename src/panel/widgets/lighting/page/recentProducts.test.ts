import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadRecentProducts, pushRecentProduct, RECENT_PRODUCTS_MAX } from './recentProducts';

const item = (key: string) => ({ key, name: key, brand: '', type: 'Fan', ledCount: 8, parametric: false });

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('recent products', () => {
  it('starts empty', () => {
    expect(loadRecentProducts()).toEqual([]);
  });

  it('puts the latest pick first and keeps one copy of a repeated key', () => {
    pushRecentProduct(item('a'));
    pushRecentProduct(item('b'));
    pushRecentProduct(item('a'));
    expect(loadRecentProducts().map(r => r.key)).toEqual(['a', 'b']);
  });

  it('caps the list at the newest three', () => {
    for (const k of ['a', 'b', 'c', 'd']) pushRecentProduct(item(k));
    expect(loadRecentProducts().map(r => r.key)).toEqual(['d', 'c', 'b']);
    expect(RECENT_PRODUCTS_MAX).toBe(3);
  });

  it('ignores a stored value that is not a product list', () => {
    localStorage.setItem('lighting.ledMap.recentProducts', '{"nope":1}');
    expect(loadRecentProducts()).toEqual([]);
    localStorage.setItem('lighting.ledMap.recentProducts', '[{"key":1},{"key":"ok","name":"Ok","ledCount":4}]');
    expect(loadRecentProducts().map(r => r.key)).toEqual(['ok']);
  });

  it('comes back empty, without throwing, when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('denied'); });
    expect(() => pushRecentProduct(item('a'))).not.toThrow();
    expect(loadRecentProducts()).toEqual([]);
  });
});
