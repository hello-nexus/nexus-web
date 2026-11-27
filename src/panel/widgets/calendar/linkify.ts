export interface TextPart {
  text: string;
  // Set only for an http(s) URL.
  href?: string;
}

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const TRAILING = /[.,;:!?)\]}]+$/;

/** Splits text into plain runs and http(s) links. Trailing punctuation stays outside the link; an unbalanced `)` only is trimmed. */
export function linkify(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    let url = match[0];
    const start = match.index ?? 0;
    let trimmed = url.replace(TRAILING, '');
    // A closing bracket that balances an opening one inside the URL belongs to it.
    for (const [open, close] of [['(', ')'], ['[', ']']] as const) {
      while (trimmed.length < url.length && url[trimmed.length] === close && trimmed.split(open).length > trimmed.split(close).length) {
        trimmed += close;
      }
    }
    url = trimmed;
    if (!isSafeHttpUrl(url)) continue;
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: url, href: url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname !== '';
  } catch {
    return false;
  }
}

const SHORT_URL_MAX = 56;

/** One-line label for a long URL: host plus the start of the path, with an ellipsis. The href is never altered. */
export function shortenUrl(url: string, max: number = SHORT_URL_MAX): string {
  let label = url.replace(/^https?:\/\//i, '');
  if (label.endsWith('/') && label.indexOf('/') === label.length - 1) label = label.slice(0, -1);
  return label.length <= max ? label : `${label.slice(0, max - 1)}\u2026`;
}

/** Notes keep their line breaks, but a run of three or more blank lines becomes one. */
export function collapseBlankLines(text: string): string {
  return text.replace(/(?:\r?\n[ \t]*){4,}/g, '\n\n');
}
