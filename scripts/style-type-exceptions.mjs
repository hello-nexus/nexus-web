// Shared by audit-styles.mjs and audit-text-styles.mjs so the two gates can't
// disagree on what counts as sanctioned type.
//
// Sanctioned: a single-declaration line whose metric value rides the central
// scale (font-size from --type-*, font-weight from --weight-*, line-height
// from --leading-*). Retuning a token propagates, so these are not drift.
// Mixins stay the preferred form.
//
// line-height earns its own tier because the em-scaled panel widgets set it
// alone: their font-size is deliberately off the rem scale (see the em-tier
// note in styles/_text.scss), so a text-* mixin would drag the size with it.
// Property-paired and line-anchored on purpose: a wrong-axis use
// (font-size: var(--weight-display)) or a compound line that leads with a
// token but trails a raw declaration stays flagged.
export const TOKENED_TYPE_LINE =
  /^\s*(font-size:\s*var\(--type-[\w-]+\)|font-weight:\s*var\(--weight-[\w-]+\)|line-height:\s*var\(--leading-[\w-]+\))\s*(!important)?\s*;?\s*(\/\/.*)?$/;
