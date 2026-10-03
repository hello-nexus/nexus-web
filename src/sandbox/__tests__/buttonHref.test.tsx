// `ui-button` href: the press opens the link through the service, tagged with
// the app id of the tree it renders in so the click is attributed.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';

const postService = vi.fn(async () => ({ error: false }));
vi.mock('../../api/auth', () => ({ getToken: async () => 'tok', getTokenSync: () => 'tok' }));
vi.mock('../../api/service', () => ({ postService: (...a: unknown[]) => postService(...(a as [])) }));

import { Button } from '../ui/components';
import { SdkAppIdContext } from '../appIdContext';

afterEach(() => { cleanup(); postService.mockClear(); });

describe('ui-button href', () => {
  it('posts the app id with the url', async () => {
    const { container } = render(
      <SdkAppIdContext.Provider value="com.example.app">
        <Button label="Go" href="https://example.com/?utm_content=banner" />
      </SdkAppIdContext.Provider>,
    );
    fireEvent.click(container.querySelector('button')!);
    await waitFor(() => expect(postService).toHaveBeenCalledWith('/system/open-url', { url: 'https://example.com/?utm_content=banner', appId: 'com.example.app' }));
  });

  it('sends the url alone outside an app tree', async () => {
    const { container } = render(<Button label="Go" href="https://example.com/" />);
    fireEvent.click(container.querySelector('button')!);
    await waitFor(() => expect(postService).toHaveBeenCalledWith('/system/open-url', { url: 'https://example.com/' }));
  });
});
