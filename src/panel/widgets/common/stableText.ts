// Test matcher for text drawn through StableDigits: each digit carries a hidden sizer glyph that pads textContent.
function visibleText(el: Element): string {
  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll('[aria-hidden="true"]').forEach(n => n.remove());
  return clone.textContent ?? '';
}

export function stableText(text: string) {
  return (_content: string, el: Element | null): boolean => {
    if (!el || visibleText(el) !== text) return false;
    return !Array.from(el.children).some(c => visibleText(c) === text);
  };
}
