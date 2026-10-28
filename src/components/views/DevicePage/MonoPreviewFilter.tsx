import { MONO_FILTER_ID, MONO_LUMA_OFFSET as O, MONO_LUMA_WEIGHTS as W, MONO_STEP_INTERCEPT, MONO_STEP_SLOPE } from './monoPreview';

/** SVG filter the preview stage references to show a 1-bit glass as it will light. */
export function MonoPreviewFilter() {
  const step = { type: 'linear', slope: MONO_STEP_SLOPE, intercept: MONO_STEP_INTERCEPT } as const;
  return (
    <svg width="0" height="0" aria-hidden="true" focusable="false" style={{ position: 'absolute' }} data-testid="mono-preview-filter">
      <filter id={MONO_FILTER_ID} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={`${W.r} ${W.g} ${W.b} 0 ${O} ${W.r} ${W.g} ${W.b} 0 ${O} ${W.r} ${W.g} ${W.b} 0 ${O} 0 0 0 1 0`} />
        <feComponentTransfer>
          <feFuncR {...step} />
          <feFuncG {...step} />
          <feFuncB {...step} />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}
