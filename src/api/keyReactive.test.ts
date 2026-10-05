import { beforeEach, describe, expect, it, vi } from 'vitest';

const svc = vi.hoisted(() => ({
  fetchService: vi.fn(),
  putService: vi.fn(),
  postService: vi.fn(),
}));
vi.mock('./service', () => svc);

import {
  DEFAULT_KEY_REACTION,
  fetchKeyReactionPreview,
  fetchKeyReactive,
  pressKeyReaction,
  putKeyReaction,
} from './keyReactive';

describe('key reactive api', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    svc.fetchService.mockResolvedValue(null);
    svc.putService.mockResolvedValue(null);
    svc.postService.mockResolvedValue(null);
  });

  it('lists the per-key keyboards with a GET', async () => {
    await fetchKeyReactive();
    expect(svc.fetchService).toHaveBeenCalledWith('/lighting/key-reactive');
  });

  it('saves a config with a PUT to the encoded device id', async () => {
    await putKeyReaction('hyte keeb/1', DEFAULT_KEY_REACTION);
    expect(svc.putService).toHaveBeenCalledWith('/lighting/key-reactive/hyte%20keeb%2F1', DEFAULT_KEY_REACTION);
  });

  it('posts a press body as given', async () => {
    await pressKeyReaction('k1', { led: 4 });
    expect(svc.postService).toHaveBeenCalledWith('/lighting/key-reactive/k1/press', { led: 4 });
    await pressKeyReaction('k1', {});
    expect(svc.postService).toHaveBeenLastCalledWith('/lighting/key-reactive/k1/press', {});
  });

  it('posts the config to preview and forwards the abort signal', async () => {
    const ctl = new AbortController();
    await fetchKeyReactionPreview('k1', DEFAULT_KEY_REACTION, ctl.signal);
    expect(svc.postService).toHaveBeenCalledWith('/lighting/key-reactive/k1/preview', DEFAULT_KEY_REACTION, ctl.signal);
  });
});
