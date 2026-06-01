// Minimal JSONPath evaluator for declarative data extraction.
//
// Supported subset:
//   $          - root
//   .key       - field access
//   .key.sub   - nested field access
//   [0]        - integer array index
//   ["key"]    - bracket field access (lets keys contain dots/spaces)
//   [-1]       - last element / negative indexing
//
// Anything outside this subset returns undefined; widgets needing a full
// dialect move to Tier 2 and parse with their own library.

// Defense-in-depth: refuse to walk into prototype-chain keys. See the matching
// guard in bindings.ts for the rationale.
const FORBIDDEN_JSONPATH_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export function jsonPath(root: unknown, path: string): unknown {
  if (!path) return undefined;
  let trimmed = path.trim();
  if (trimmed.startsWith('$')) trimmed = trimmed.slice(1);
  if (trimmed.length === 0) return root;
  // Insert a leading dot if path begins with a bracket so the tokenizer
  // sees the bracket as a segment, not as part of a key.
  if (trimmed.startsWith('[')) trimmed = '.' + trimmed;
  if (!trimmed.startsWith('.')) return undefined;
  trimmed = trimmed.slice(1);

  let cur: unknown = root;
  let i = 0;
  while (i < trimmed.length) {
    if (trimmed[i] === '[') {
      const end = trimmed.indexOf(']', i);
      if (end < 0) return undefined;
      const inner = trimmed.slice(i + 1, end);
      if (cur === null || cur === undefined) return undefined;
      if (inner.startsWith('"') || inner.startsWith("'")) {
        const key = inner.slice(1, -1);
        if (FORBIDDEN_JSONPATH_KEYS.has(key)) return undefined;
        cur = (cur as Record<string, unknown>)[key];
      } else {
        const idx = parseInt(inner, 10);
        if (!Number.isFinite(idx)) return undefined;
        if (!Array.isArray(cur)) return undefined;
        cur = idx < 0 ? cur[cur.length + idx] : cur[idx];
      }
      i = end + 1;
      if (i < trimmed.length && trimmed[i] === '.') i++;
      continue;
    }
    // Read until next dot or bracket.
    let next = i;
    while (next < trimmed.length && trimmed[next] !== '.' && trimmed[next] !== '[') next++;
    const key = trimmed.slice(i, next);
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    if (FORBIDDEN_JSONPATH_KEYS.has(key)) return undefined;
    cur = (cur as Record<string, unknown>)[key];
    i = next;
    if (trimmed[i] === '.') i++;
  }
  return cur;
}
