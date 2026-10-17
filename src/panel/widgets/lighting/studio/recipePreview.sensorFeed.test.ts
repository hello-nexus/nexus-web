import { describe, expect, it } from 'vitest';
import { activePreviewSensorFeed, registerPreviewSensorFeed } from './recipePreview';

describe('registerPreviewSensorFeed', () => {
  const ref = () => ({ current: () => 0.5 });

  it('keeps a registered feed active whichever one unmounts first', () => {
    const [a, b, c] = [ref(), ref(), ref()];
    const offA = registerPreviewSensorFeed(a);
    const offB = registerPreviewSensorFeed(b);
    const offC = registerPreviewSensorFeed(c);
    expect(activePreviewSensorFeed()).toBe(c);
    // The newest leaves while two remain: the previews must not freeze on the gone one.
    offC();
    expect(activePreviewSensorFeed()).toBe(b);
    offA();
    expect(activePreviewSensorFeed()).toBe(b);
    offB();
    expect(activePreviewSensorFeed()).toBeNull();
  });

  it('ignores the unregister of a feed that was not the active one', () => {
    const [a, b] = [ref(), ref()];
    const offA = registerPreviewSensorFeed(a);
    const offB = registerPreviewSensorFeed(b);
    offA();
    expect(activePreviewSensorFeed()).toBe(b);
    offB();
    expect(activePreviewSensorFeed()).toBeNull();
  });
});
