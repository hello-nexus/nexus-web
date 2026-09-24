// `ui-frame` image: an allowed source paints cover-fit over the tone; anything
// else, or a value that could break out of the CSS url(), leaves the plain tone.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('../../api/auth', () => ({ getToken: async () => 'tok', getTokenSync: () => 't k' }));
vi.mock('../../api/service', () => ({ postService: vi.fn(async () => ({ error: false })) }));

import { Frame } from '../ui/components';

afterEach(() => cleanup());

const background = (image?: string, tone?: string) =>
  (render(<Frame image={image} tone={tone} />).container.firstElementChild as HTMLElement).style.background;

describe('ui-frame image', () => {
  it('layers an allowed image over the tone', () => {
    const bg = background('data:image/svg+xml;base64,AAAA', 'accent');
    expect(bg).toContain('url("data:image/svg+xml;base64,AAAA")');
    expect(bg).toContain('cover');
    expect(bg).toContain('var(--accent');
  });

  it('attaches the session token to an app-asset image', () => {
    expect(background('/apps-api/installed/com.x.y/asset/assets/bg.png'))
      .toContain('url("/apps-api/installed/com.x.y/asset/assets/bg.png?token=t%20k")');
  });

  it('drops a disallowed scheme or a value that could escape url()', () => {
    const plain = background();
    expect(plain).not.toContain('url(');
    for (const src of ['http://x/y.png', 'javascript:alert(1)', '/api/x.png', 'https://x/a".png', 'https://x/a\\.png', 'https://x/a\n.png', 'https://x/a\f.png', 'https://x/a).png']) {
      expect(background(src)).toBe(plain);
      cleanup();
    }
  });
});
