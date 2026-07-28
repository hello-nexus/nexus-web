// StableDigits renders every digit beside a hidden sizer glyph, so a numeric
// readout has no element whose direct text is the full number and raw
// textContent includes the sizers.

// Text as a reader sees it, with the hidden sizer glyphs dropped.
export function visibleText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
  return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

// Every reading a gauge rendered, from GaugeValue's accessible name (the
// whole formatted string, unsplit). Hidden subtrees have no accessible name,
// so a design that stacks a decorative copy contributes one reading.
export function gaugeReadings(root: Element = document.body): string[] {
  return Array.from(root.querySelectorAll('[role="img"][aria-label]'))
    .filter((el) => !el.closest('[aria-hidden="true"]'))
    .map((el) => el.getAttribute('aria-label') ?? '');
}

// A gauge rendered exactly this reading, unit included when the caller gives one.
export function hasGaugeReading(root: Element, reading: string): boolean {
  return gaugeReadings(root).some((r) => r === reading);
}
