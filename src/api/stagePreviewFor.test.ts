import { describe, expect, it } from 'vitest';
import { stagePreviewFor } from './mediaLibrary';

describe('stagePreviewFor', () => {
  it('plays a video from the raw source', () => {
    expect(stagePreviewFor('video', '/raw', '/preview')).toEqual({ src: '/raw', kind: 'video' });
  });

  it('animates a gif as an image from the raw source', () => {
    expect(stagePreviewFor('gif', '/raw', '/preview')).toEqual({ src: '/raw', kind: 'image' });
  });

  it('shows the still preview for an image, and for a service that predates the field', () => {
    expect(stagePreviewFor('image', '/raw', '/preview')).toEqual({ src: '/preview', kind: 'image' });
    expect(stagePreviewFor(undefined, '/raw', '/preview')).toEqual({ src: '/preview', kind: 'image' });
  });
});
