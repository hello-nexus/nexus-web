// SVG filter defs for the skins' post-process layer. Mount once next to the
// panel root; skins reference them through `filter: url(#skin-filter-*)`.
// Each ramp maps every drawn pixel (text, images, canvas, video) by luminance.
export function SkinFilters() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
      <defs>
        {/* Fill patterns for skins that draw areas as line work instead of solid colour. */}
        <pattern id="skin-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="1" height="4" fill="#fff" />
        </pattern>
        <pattern id="skin-hatch-ink" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="1.4" height="4" fill="#111" />
        </pattern>
        <pattern id="skin-dither" width="2" height="2" patternUnits="userSpaceOnUse">
          <rect width="1" height="1" fill="#111" />
          <rect x="1" y="1" width="1" height="1" fill="#111" />
        </pattern>
        {/* LCD: luminance to a dark-green ink over a grey-green backplane. */}
        <filter id="skin-filter-lcd" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="linear" slope="1.5" intercept="-0.2" />
            <feFuncG type="linear" slope="1.5" intercept="-0.2" />
            <feFuncB type="linear" slope="1.5" intercept="-0.2" />
          </feComponentTransfer>
          <feComponentTransfer>
            <feFuncR type="table" tableValues="0.09 0.71" />
            <feFuncG type="table" tableValues="0.13 0.76" />
            <feFuncB type="table" tableValues="0.07 0.55" />
          </feComponentTransfer>
        </filter>

        {/* Phosphor green. */}
        <filter id="skin-filter-crt" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          <feColorMatrix type="matrix" values="0 0 0 0 0  0.4 0.9 0.2 0 0  0.05 0.2 0.05 0 0  0 0 0 1 0" />
        </filter>
        <filter id="skin-filter-crt-bloom" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          <feColorMatrix type="matrix" values="0 0 0 0 0  0.4 0.9 0.2 0 0  0.05 0.2 0.05 0 0  0 0 0 1 0" result="ink" />
          <feGaussianBlur in="ink" stdDeviation="2.2" result="glow" />
          <feComposite in="ink" in2="glow" operator="arithmetic" k1="0" k2="1" k3="0.9" k4="0" />
        </filter>

        {/* Phosphor amber. */}
        <filter id="skin-filter-crt-amber" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          <feColorMatrix type="matrix" values="0.45 0.95 0.2 0 0  0.28 0.6 0.12 0 0  0 0 0 0 0  0 0 0 1 0" />
        </filter>
        <filter id="skin-filter-crt-amber-bloom" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          <feColorMatrix type="matrix" values="0.45 0.95 0.2 0 0  0.28 0.6 0.12 0 0  0 0 0 0 0  0 0 0 1 0" result="ink" />
          <feGaussianBlur in="ink" stdDeviation="2.2" result="glow" />
          <feComposite in="ink" in2="glow" operator="arithmetic" k1="0" k2="1" k3="0.9" k4="0" />
        </filter>

        {/* VFD cyan-teal. */}
        <filter id="skin-filter-vfd" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          <feColorMatrix type="matrix" values="0.1 0.2 0.05 0 0  0.35 0.75 0.15 0 0  0.3 0.65 0.15 0 0  0 0 0 1 0" />
        </filter>
        <filter id="skin-filter-vfd-bloom" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          <feColorMatrix type="matrix" values="0.1 0.2 0.05 0 0  0.35 0.75 0.15 0 0  0.3 0.65 0.15 0 0  0 0 0 1 0" result="ink" />
          <feGaussianBlur in="ink" stdDeviation="2" result="glow" />
          <feComposite in="ink" in2="glow" operator="arithmetic" k1="0" k2="1" k3="0.8" k4="0" />
        </filter>

        {/* E-ink: four grey levels, warm paper white. */}
        <filter id="skin-filter-eink" colorInterpolationFilters="sRGB" x="0" y="0" width="100%" height="100%">
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncR type="discrete" tableValues="0.07 0.38 0.68 0.93" />
            <feFuncG type="discrete" tableValues="0.07 0.38 0.68 0.92" />
            <feFuncB type="discrete" tableValues="0.07 0.36 0.64 0.86" />
          </feComponentTransfer>
        </filter>

        {/* Pixelate: one sample per 3x3 block, grown back to the block. */}
        <filter id="skin-filter-pixelate" x="0" y="0" width="100%" height="100%">
          <feFlood x="1" y="1" width="1" height="1" />
          <feComposite width="3" height="3" />
          <feTile result="grid" />
          <feComposite in="SourceGraphic" in2="grid" operator="in" />
          <feMorphology operator="dilate" radius="1" />
        </filter>
      </defs>
    </svg>
  );
}
