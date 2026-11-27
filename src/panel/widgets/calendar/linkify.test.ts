// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { collapseBlankLines, linkify, shortenUrl } from './linkify';

const links = (text: string) => linkify(text).filter(p => p.href).map(p => p.href);

describe('linkify', () => {
  it('leaves text without URLs as one plain part', () => {
    expect(linkify('Bring the mockups')).toEqual([{ text: 'Bring the mockups' }]);
    expect(linkify('')).toEqual([]);
  });

  it('splits text around a link', () => {
    expect(linkify('Join at https://meet.example.com/abc now')).toEqual([
      { text: 'Join at ' }, { text: 'https://meet.example.com/abc', href: 'https://meet.example.com/abc' }, { text: ' now' },
    ]);
  });

  it('keeps trailing punctuation out of the link', () => {
    expect(links('See https://a.test/x.')).toEqual(['https://a.test/x']);
    expect(links('(https://a.test/x), then https://b.test/y; or https://c.test/z!')).toEqual(['https://a.test/x', 'https://b.test/y', 'https://c.test/z']);
    expect(linkify('Go: https://a.test/x.').pop()).toEqual({ text: '.' });
  });

  it('keeps a balanced closing parenthesis that belongs to the URL', () => {
    expect(links('https://en.wikipedia.org/wiki/Foo_(bar)')).toEqual(['https://en.wikipedia.org/wiki/Foo_(bar)']);
    expect(links('(see https://en.wikipedia.org/wiki/Foo_(bar))')).toEqual(['https://en.wikipedia.org/wiki/Foo_(bar)']);
  });

  it('finds several URLs', () => {
    expect(links('https://a.test and http://b.test/p?q=1')).toEqual(['https://a.test', 'http://b.test/p?q=1']);
  });

  it('never links unsafe schemes or bare domains', () => {
    expect(links('javascript:alert(1) data:text/html,hi file:///etc/passwd ftp://a.test www.a.test a.test')).toEqual([]);
    expect(links('x javascript:alert(1)//https://a.test')).toEqual(['https://a.test']);
  });

  it('handles long Gmail-style query URLs whole', () => {
    const url = 'https://mail.google.com/mail/u/0/?tab=rm&ogbl#inbox/FMfcgzGxRXkLpNvq?projector=1&messagePartId=0.1';
    expect(links(`Details: ${url}`)).toEqual([url]);
    const meet = 'https://meet.google.com/abc-defg-hij?authuser=0&hs=122';
    expect(links(`${meet}\nPhone: +1 555`)).toEqual([meet]);
  });

  it('rebuilds the original text from its parts', () => {
    const text = 'a https://x.test/1, b (https://y.test/2). c';
    expect(linkify(text).map(p => p.text).join('')).toBe(text);
  });
});

describe('shortenUrl', () => {
  it('drops the scheme and keeps short URLs whole', () => {
    expect(shortenUrl('https://meet.example.com/abc')).toBe('meet.example.com/abc');
    expect(shortenUrl('https://a.test/')).toBe('a.test');
  });

  it('cuts a 400-character safelink to one line with an ellipsis, host first', () => {
    const url = `https://nam06.safelinks.protection.outlook.com/?url=${'a'.repeat(400)}&data=05`;
    const short = shortenUrl(url);
    expect(short.length).toBe(56);
    expect(short.startsWith('nam06.safelinks.protection.outlook.com/')).toBe(true);
    expect(short.endsWith('\u2026')).toBe(true);
  });
});

describe('collapseBlankLines', () => {
  it('turns three or more blank lines into one and keeps single and double breaks', () => {
    expect(collapseBlankLines('a\n\n\n\n\nb')).toBe('a\n\nb');
    expect(collapseBlankLines('a\n\n\nb')).toBe('a\n\n\nb');
    expect(collapseBlankLines('a\nb\n\nc')).toBe('a\nb\n\nc');
    expect(collapseBlankLines('a\r\n \r\n\t\r\n\r\n\r\nb')).toBe('a\n\nb');
  });
});
