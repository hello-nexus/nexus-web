import { describe, expect, it } from 'vitest';
import { cropToSourceRect } from './avatarCrop';

describe('cropToSourceRect', () => {
  it('projects a full-frame crop onto the source dimensions', () => {
    expect(cropToSourceRect({ x: 0, y: 0, w: 1, h: 1 }, 800, 600)).toEqual({
      sx: 0, sy: 0, sw: 800, sh: 600,
    });
  });

  it('projects a centered square crop of a wide image', () => {
    expect(cropToSourceRect({ x: 0.25, y: 0, w: 0.5, h: 1 }, 800, 400)).toEqual({
      sx: 200, sy: 0, sw: 400, sh: 400,
    });
  });

  it('projects an off-center partial crop', () => {
    expect(cropToSourceRect({ x: 0.1, y: 0.2, w: 0.3, h: 0.4 }, 1000, 500)).toEqual({
      sx: 100, sy: 100, sw: 300, sh: 200,
    });
  });
});
