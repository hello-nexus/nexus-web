import { beforeEach, describe, expect, it, vi } from 'vitest';

const postForm = vi.fn();
vi.mock('./service', () => ({
  resolveHttp: (p: string) => `http://svc${p}`,
  fetchService: vi.fn(),
  postService: vi.fn(),
  putService: vi.fn(),
  postServiceForm: (...a: unknown[]) => postForm(...a),
}));

import { hydroShift2CurveMediaPreviewUrl, uploadHydroShift2CurveMedia } from './hydroshift2Curve';

beforeEach(() => postForm.mockReset());

describe('uploadHydroShift2CurveMedia', () => {
  it('posts the file and the serialized crop as multipart', async () => {
    postForm.mockResolvedValue({ error: false, msg: null, name: 'x' });
    const file = new File(['x'], 'clip.mp4');
    expect(await uploadHydroShift2CurveMedia(file, { x: 0.1, y: 0.2, w: 0.5, h: 0.4 })).toEqual({ name: 'x' });
    const [path, form] = postForm.mock.calls[0] as [string, FormData];
    expect(path).toBe('/devices/lianli-hydroshift2-curve/media');
    expect((form.get('file') as File).name).toBe('clip.mp4');
    expect(form.get('crop')).toBe('0.100000,0.200000,0.500000,0.400000');
  });

  it('reports failure on a refusal or no answer', async () => {
    const crop = { x: 0, y: 0, w: 1, h: 1 };
    postForm.mockResolvedValue({ error: true, msg: 'bad' });
    expect(await uploadHydroShift2CurveMedia(new File(['x'], 'c.mp4'), crop)).toBeNull();
    postForm.mockResolvedValue(null);
    expect(await uploadHydroShift2CurveMedia(new File(['x'], 'c.mp4'), crop)).toBeNull();
  });
});

describe('hydroShift2CurveMediaPreviewUrl', () => {
  it('points at the clip preview and encodes the name', () => {
    expect(hydroShift2CurveMediaPreviewUrl('a b.mp4')).toContain('/devices/lianli-hydroshift2-curve/media/a%20b.mp4/preview');
  });
});
