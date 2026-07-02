// Pure coordinate math for the avatar crop-to-canvas step. No canvas/DOM
// polyfill exists in this project's test setup, so only this projection is
// unit-tested; the actual canvas draw + toBlob lives in
// AccountAuthenticationSection.tsx.

import type { NormalizedCrop } from '../../../common/MediaCropper/MediaCropper';

export interface SourceCropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Projects a 0..1 normalized crop rect onto the source image's natural pixel dimensions. */
export function cropToSourceRect(crop: NormalizedCrop, naturalWidth: number, naturalHeight: number): SourceCropRect {
  return {
    sx: crop.x * naturalWidth,
    sy: crop.y * naturalHeight,
    sw: crop.w * naturalWidth,
    sh: crop.h * naturalHeight,
  };
}
