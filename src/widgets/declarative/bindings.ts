// Tiny binding + expression evaluator for the declarative widget format.
//
// What this supports (intentionally minimal):
//   - "{path}" interpolation inside strings: "{temp.formatted}".
//   - Numeric literals, string literals, boolean literals.
//   - Field access against a context object: foo.bar.baz.
//   - Binary ops: + - * / %, ==, !=, <, <=, >, >=, &&, ||.
//   - Conditional: if(cond, a, b).
//
// What this DOES NOT support:
//   - Statements, loops, side effects, function definitions.
//   - Property assignment.
//   - Bare identifiers that aren't on the context (returns undefined).
//
// The evaluator is intentionally small + readable; widget manifests are
// supposed to be expressive but not Turing-complete. If an author needs
// real logic they ship a Tier 2 `worker.js`.

export type BindingContext = Record<string, unknown>;

/** Evaluate a binding string. If it looks like a plain string (no `{...}` /
 *  no operators), returns it as-is. Otherwise interpolates `{...}` segments
 *  and returns the joined result, or — when the binding is a single
 *  `{expression}` — the raw expression value (number, bool, object, etc.). */
export function evaluateBinding(input: unknown, ctx: BindingContext): unknown {
  if (typeof input !== 'string') return input;
  // A single {...} returns the raw expression value (not coerced to string).
  const wholeMatch = input.match(/^\s*\{([^{}]+)\}\s*$/);
  if (wholeMatch) {
    return safeEval(wholeMatch[1], ctx);
  }
  // Otherwise treat the string as a template - interpolate each {...}
  // segment as its string representation.
  if (!input.includes('{')) return input;
  return input.replace(/\{([^{}]+)\}/g, (_, expr: string) => {
    const v = safeEval(expr, ctx);
    if (v === undefined || v === null) return '';
    return String(v);
  });
}

export function evaluateExpression(expr: string, ctx: BindingContext): unknown {
  return safeEval(expr, ctx);
}

// ---------------------------------------------------------------------------
// Parser / evaluator
// ---------------------------------------------------------------------------

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'ident'; value: string }
  | { kind: 'op'; value: string }
  | { kind: 'punct'; value: string };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
    if (c >= '0' && c <= '9') {
      const start = i;
      while (i < src.length && /[0-9.]/.test(src[i])) i++;
      tokens.push({ kind: 'num', value: parseFloat(src.slice(start, i)) });
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      i++;
      const start = i;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i += 2;
        else i++;
      }
      tokens.push({ kind: 'str', value: src.slice(start, i) });
      i++;
      continue;
    }
    if (/[a-zA-Z_$]/.test(c)) {
      const start = i;
      while (i < src.length && /[a-zA-Z0-9_$.\-]/.test(src[i])) i++;
      const ident = src.slice(start, i);
      if (ident === 'true' || ident === 'false') {
        tokens.push({ kind: 'ident', value: ident });
      } else {
        tokens.push({ kind: 'ident', value: ident });
      }
      continue;
    }
    if (c === '(' || c === ')' || c === ',') {
      tokens.push({ kind: 'punct', value: c });
      i++;
      continue;
    }
    // Two-char operators first.
    const two = src.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '&&' || two === '||') {
      tokens.push({ kind: 'op', value: two });
      i += 2;
      continue;
    }
    if ('+-*/%<>!'.includes(c)) {
      tokens.push({ kind: 'op', value: c });
      i++;
      continue;
    }
    // Unknown char - skip.
    i++;
  }
  return tokens;
}

function safeEval(expr: string, ctx: BindingContext): unknown {
  const tokens = tokenize(expr);
  if (tokens.length === 0) return undefined;
  const parser = { tokens, idx: 0 };
  try {
    const result = parseOr(parser, ctx);
    return result;
  } catch {
    return undefined;
  }
}

interface ParseState { tokens: Token[]; idx: number; }

function peek(p: ParseState): Token | undefined { return p.tokens[p.idx]; }
function consume(p: ParseState): Token { return p.tokens[p.idx++]; }
function match(p: ParseState, kind: Token['kind'], value?: string): boolean {
  const t = peek(p);
  if (!t || t.kind !== kind) return false;
  if (value !== undefined && t.value !== value) return false;
  p.idx++;
  return true;
}

function parseOr(p: ParseState, ctx: BindingContext): unknown {
  let left = parseAnd(p, ctx);
  while (peek(p)?.kind === 'op' && peek(p)?.value === '||') {
    consume(p);
    const right = parseAnd(p, ctx);
    left = truthy(left) ? left : right;
  }
  return left;
}

function parseAnd(p: ParseState, ctx: BindingContext): unknown {
  let left = parseEquality(p, ctx);
  while (peek(p)?.kind === 'op' && peek(p)?.value === '&&') {
    consume(p);
    const right = parseEquality(p, ctx);
    left = !truthy(left) ? left : right;
  }
  return left;
}

function parseEquality(p: ParseState, ctx: BindingContext): unknown {
  let left = parseCompare(p, ctx);
  while (peek(p)?.kind === 'op' && (peek(p)?.value === '==' || peek(p)?.value === '!=')) {
    const op = consume(p).value;
    const right = parseCompare(p, ctx);
    left = op === '==' ? eq(left, right) : !eq(left, right);
  }
  return left;
}

function parseCompare(p: ParseState, ctx: BindingContext): unknown {
  let left = parseAddSub(p, ctx);
  while (peek(p)?.kind === 'op' && ['<', '<=', '>', '>='].includes(String(peek(p)?.value))) {
    const op = consume(p).value;
    const right = parseAddSub(p, ctx);
    const l = num(left); const r = num(right);
    switch (op) {
      case '<': left = l < r; break;
      case '<=': left = l <= r; break;
      case '>': left = l > r; break;
      case '>=': left = l >= r; break;
    }
  }
  return left;
}

function parseAddSub(p: ParseState, ctx: BindingContext): unknown {
  let left = parseMulDiv(p, ctx);
  while (peek(p)?.kind === 'op' && (peek(p)?.value === '+' || peek(p)?.value === '-')) {
    const op = consume(p).value;
    const right = parseMulDiv(p, ctx);
    left = op === '+' ? num(left) + num(right) : num(left) - num(right);
  }
  return left;
}

function parseMulDiv(p: ParseState, ctx: BindingContext): unknown {
  let left = parseUnary(p, ctx);
  while (peek(p)?.kind === 'op' && (peek(p)?.value === '*' || peek(p)?.value === '/' || peek(p)?.value === '%')) {
    const op = consume(p).value;
    const right = parseUnary(p, ctx);
    if (op === '*') left = num(left) * num(right);
    else if (op === '/') left = num(left) / num(right);
    else left = num(left) % num(right);
  }
  return left;
}

function parseUnary(p: ParseState, ctx: BindingContext): unknown {
  if (peek(p)?.kind === 'op' && peek(p)?.value === '-') {
    consume(p);
    return -num(parseUnary(p, ctx));
  }
  if (peek(p)?.kind === 'op' && peek(p)?.value === '!') {
    consume(p);
    return !truthy(parseUnary(p, ctx));
  }
  return parsePrimary(p, ctx);
}

function parsePrimary(p: ParseState, ctx: BindingContext): unknown {
  const t = peek(p);
  if (!t) return undefined;
  if (t.kind === 'num') { consume(p); return t.value; }
  if (t.kind === 'str') { consume(p); return t.value; }
  if (t.kind === 'punct' && t.value === '(') {
    consume(p);
    const v = parseOr(p, ctx);
    match(p, 'punct', ')');
    return v;
  }
  if (t.kind === 'ident') {
    consume(p);
    if (t.value === 'true') return true;
    if (t.value === 'false') return false;
    if (t.value === 'null' || t.value === 'undefined') return null;
    // Function call?
    if (peek(p)?.kind === 'punct' && peek(p)?.value === '(') {
      consume(p);
      const args: unknown[] = [];
      while (peek(p) && !(peek(p)?.kind === 'punct' && peek(p)?.value === ')')) {
        args.push(parseOr(p, ctx));
        if (peek(p)?.kind === 'punct' && peek(p)?.value === ',') consume(p);
      }
      match(p, 'punct', ')');
      return callFn(t.value, args);
    }
    return resolvePath(t.value, ctx);
  }
  return undefined;
}

function callFn(name: string, args: unknown[]): unknown {
  switch (name) {
    case 'if':
      return truthy(args[0]) ? args[1] : args[2];
    case 'min':
      return Math.min(...args.map(num));
    case 'max':
      return Math.max(...args.map(num));
    case 'round':
      return Math.round(num(args[0]));
    case 'floor':
      return Math.floor(num(args[0]));
    case 'ceil':
      return Math.ceil(num(args[0]));
    case 'clamp': {
      const v = num(args[0]); const lo = num(args[1]); const hi = num(args[2]);
      return Math.max(lo, Math.min(hi, v));
    }
    case 'lerp': {
      const a = num(args[0]); const b = num(args[1]); const t = num(args[2]);
      return a + (b - a) * t;
    }
    case 'pct': {
      const v = num(args[0]); const lo = num(args[1]); const hi = num(args[2]);
      if (hi === lo) return 0;
      return (v - lo) / (hi - lo);
    }
    case 'isnum':
      return typeof args[0] === 'number' && Number.isFinite(args[0]);
    case 'isnull':
      return args[0] === null || args[0] === undefined;
    case 'weatherIcon':
      return weatherIconName(args[0]);
    case 'now':
      // Current wall-time in ms (epoch). Re-evaluates on every render.
      return Date.now();
    case 'formatDuration': {
      // ms → "HH:MM:SS" / "MM:SS" / "MM:SS.hh" depending on mode.
      const ms = num(args[0]);
      if (!Number.isFinite(ms) || ms < 0) return '00:00';
      const mode = typeof args[1] === 'string' ? args[1] : 'auto';
      return formatDurationMs(ms, mode);
    }
    case 'abs':
      return Math.abs(num(args[0]));
    case 'len':
      if (Array.isArray(args[0])) return args[0].length;
      if (typeof args[0] === 'string') return args[0].length;
      return 0;
    case 'first':
      return Array.isArray(args[0]) && args[0].length > 0 ? args[0][0] : undefined;
    case 'last':
      return Array.isArray(args[0]) && args[0].length > 0 ? args[0][args[0].length - 1] : undefined;
    case 'min_of':
      if (Array.isArray(args[0])) {
        const ns = args[0].filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];
        return ns.length > 0 ? Math.min(...ns) : undefined;
      }
      return undefined;
    case 'max_of':
      if (Array.isArray(args[0])) {
        const ns = args[0].filter((v) => typeof v === 'number' && Number.isFinite(v)) as number[];
        return ns.length > 0 ? Math.max(...ns) : undefined;
      }
      return undefined;
    default:
      return undefined;
  }
}

function formatDurationMs(ms: number, mode: string): string {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  if (mode === 'hms') return `${pad(h)}:${pad(m)}:${pad(s)}`;
  if (mode === 'ms') return `${pad(m)}:${pad(s)}`;
  if (mode === 'msHundredths') {
    const hundredths = Math.floor((ms % 1000) / 10);
    return `${pad(m)}:${pad(s)}.${pad(hundredths)}`;
  }
  // 'hundredths': just `.HH` (with leading dot). Pairs with another
  // formatDuration call rendered as a smaller text sibling so the
  // fractional digits float at the baseline like the legacy stopwatch.
  if (mode === 'hundredths') {
    const hundredths = Math.floor((ms % 1000) / 10);
    return `.${pad(hundredths)}`;
  }
  // 'hmsAuto': hours-conditional h:mm:ss / mm:ss with no hundredths.
  if (mode === 'hmsAuto') {
    if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
  }
  // 'auto' (default): show hours only when needed.
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

// WMO weather code → lucide icon name. Mirrors the original WeatherWidget
// dispatch so authors get the same visual without re-encoding the table
// in their manifest.
function weatherIconName(code: unknown): string {
  if (typeof code !== 'number') return 'help-circle';
  if (code === 0 || code === 1) return 'sun';
  if (code === 2) return 'cloud-sun';
  if (code === 3) return 'cloud';
  if (code === 45 || code === 48) return 'cloud-fog';
  if (code >= 51 && code <= 57) return 'cloud-drizzle';
  if (code >= 61 && code <= 67) return 'cloud-rain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'cloud-snow';
  if (code >= 80 && code <= 82) return 'cloud-rain-wind';
  if (code >= 95 && code <= 99) return 'cloud-lightning';
  return 'help-circle';
}

// Reject prototype-chain access. Defense-in-depth: the meter palette coerces
// results through String()/Number() today, but a future meter that hands a
// binding result to an attribute / event handler would let `__proto__.toString`
// surface a function reference. Block at the resolver instead.
const FORBIDDEN_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

export function resolvePath(path: string, ctx: BindingContext): unknown {
  const parts = path.split('.');
  let cur: unknown = ctx;
  for (const part of parts) {
    if (cur === null || cur === undefined) return undefined;
    if (typeof cur !== 'object') return undefined;
    if (FORBIDDEN_PATH_SEGMENTS.has(part)) return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = Number(v); return Number.isFinite(n) ? n : 0; }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return 0;
}

function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'number') return v !== 0 && !Number.isNaN(v);
  if (typeof v === 'string') return v.length > 0;
  if (typeof v === 'boolean') return v;
  return true;
}

function eq(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' || typeof b === 'number') return num(a) === num(b);
  return a === b;
}
