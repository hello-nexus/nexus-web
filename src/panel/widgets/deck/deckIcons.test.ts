import { describe, it, expect } from 'vitest';
import { slotAppId, slotSiteUrl } from './deckIcons';
import type { DeckAction } from './types';

describe('slotAppId', () => {
  it('takes a launchApp binding', () => {
    expect(slotAppId(undefined, { type: 'launchApp', appId: 'Steam' })).toBe('Steam');
  });

  it('takes an openFile path only when it points at an executable', () => {
    const exe: DeckAction = { type: 'openFile', path: 'C:\\Games\\Hades\\Hades.exe' };
    expect(slotAppId(undefined, exe)).toBe('C:\\Games\\Hades\\Hades.exe');
    expect(slotAppId(undefined, { type: 'openFile', path: 'C:\\docs\\notes.txt' })).toBeUndefined();
  });

  it('keeps the action ahead of an explicit app icon, as the inline expression did', () => {
    expect(slotAppId({ kind: 'app', value: 'Discord' }, { type: 'launchApp', appId: 'Steam' })).toBe('Steam');
    expect(slotAppId({ kind: 'app', value: 'Discord' }, undefined)).toBe('Discord');
  });

  it('has no target for an unbound app or a non-file action', () => {
    expect(slotAppId(undefined, { type: 'launchApp', appId: '' })).toBeUndefined();
    expect(slotAppId(undefined, { type: 'openUrl', url: 'https://example.com' })).toBeUndefined();
    expect(slotAppId(undefined, undefined)).toBeUndefined();
  });
});

describe('slotSiteUrl', () => {
  it('takes an openUrl action', () => {
    expect(slotSiteUrl({ type: 'openUrl', url: 'https://example.com' })).toBe('https://example.com');
  });

  it('has no url for a blank or non-url action', () => {
    expect(slotSiteUrl({ type: 'openUrl', url: '  ' })).toBeUndefined();
    expect(slotSiteUrl({ type: 'launchApp', appId: 'Steam' })).toBeUndefined();
    expect(slotSiteUrl(undefined)).toBeUndefined();
  });

  it('rejects a half-typed url so the inspector cannot fetch per keystroke', () => {
    for (const partial of ['h', 'http', 'https:/', 'example', 'example.com']) {
      expect(slotSiteUrl({ type: 'openUrl', url: partial })).toBeUndefined();
    }
  });

  it('rejects a non-http scheme', () => {
    expect(slotSiteUrl({ type: 'openUrl', url: 'steam://rungameid/440' })).toBeUndefined();
    expect(slotSiteUrl({ type: 'openUrl', url: 'file:///c:/x.html' })).toBeUndefined();
  });

  it('trims surrounding whitespace off the url it returns', () => {
    expect(slotSiteUrl({ type: 'openUrl', url: '  https://example.com  ' })).toBe('https://example.com');
  });
});
