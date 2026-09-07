// `ui-image` sources: https, data:image and blob pass through; the app's own
// asset route is allowed and gets the session token; anything else renders
// nothing.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('../../api/auth', () => ({ getToken: async () => 'tok', getTokenSync: () => 't k' }));
vi.mock('../../api/service', () => ({ postService: vi.fn(async () => ({ error: false })) }));

import { Image } from '../ui/components';

afterEach(() => cleanup());

describe('ui-image sources', () => {
  it('attaches the session token to an app-asset route and refuses other same-origin paths', () => {
    const a = render(<Image src="/apps-api/installed/com.x.y/asset/assets/s.png" />);
    expect(a.container.querySelector('img')?.getAttribute('src')).toBe('/apps-api/installed/com.x.y/asset/assets/s.png?token=t%20k');
    cleanup();
    expect(render(<Image src="/api/anything.png" />).container.querySelector('img')).toBeNull();
    cleanup();
    // A dot segment or an encoded one would normalise onto another route.
    expect(render(<Image src="/apps-api/installed/com.x.y/asset/../../../api/x.png" />).container.querySelector('img')).toBeNull();
    cleanup();
    expect(render(<Image src="/apps-api/installed/%2e%2e/api/x.png" />).container.querySelector('img')).toBeNull();
    cleanup();
    expect(render(<Image src="/apps-api/installed/..\\api/x.png" />).container.querySelector('img')).toBeNull();
    cleanup();
    expect(render(<Image src="https://cdn.example/x.png" />).container.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/x.png');
  });
});
