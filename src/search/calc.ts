// Inline calculator: type "12*8" or "(1920/2)+40" and get an answer to copy.
// A real tokenizer + shunting-yard evaluator - never eval() - so arbitrary
// input can't execute. Supports + - * / % ( ), unary minus, and decimals.

type Tok = { t: 'num'; v: number } | { t: 'op'; v: string } | { t: 'lp' } | { t: 'rp' };

const PREC: Record<string, number> = { '+': 1, '-': 1, '*': 2, '/': 2, '%': 2 };

function tokenize(src: string): Tok[] | null {
  const toks: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') { i++; continue; }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const num = Number(src.slice(i, j));
      if (!isFinite(num)) return null;
      toks.push({ t: 'num', v: num });
      i = j;
      continue;
    }
    if (c === '(') { toks.push({ t: 'lp' }); i++; continue; }
    if (c === ')') { toks.push({ t: 'rp' }); i++; continue; }
    if (c in PREC) { toks.push({ t: 'op', v: c }); i++; continue; }
    return null; // unknown char
  }
  return toks;
}

function toRpn(toks: Tok[]): Tok[] | null {
  const out: Tok[] = [];
  const ops: Tok[] = [];
  let prev: Tok | null = null;
  for (let k = 0; k < toks.length; k++) {
    const tok = toks[k];
    // Unary minus/plus: an operator with no value before it binds to the number.
    if (tok.t === 'op' && (tok.v === '-' || tok.v === '+') &&
        (prev === null || prev.t === 'op' || prev.t === 'lp')) {
      if (tok.v === '-') {
        const next = toks[k + 1];
        if (next && next.t === 'num') { out.push({ t: 'num', v: -next.v }); k++; prev = next; continue; }
      } else { prev = tok; continue; } // unary plus is a no-op
    }
    if (tok.t === 'num') out.push(tok);
    else if (tok.t === 'op') {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t === 'op' && PREC[top.v] >= PREC[tok.v]) out.push(ops.pop()!);
        else break;
      }
      ops.push(tok);
    } else if (tok.t === 'lp') ops.push(tok);
    else { // rp
      let matched = false;
      while (ops.length) {
        const top = ops.pop()!;
        if (top.t === 'lp') { matched = true; break; }
        out.push(top);
      }
      if (!matched) return null;
    }
    prev = tok;
  }
  while (ops.length) {
    const top = ops.pop()!;
    if (top.t === 'lp') return null; // unbalanced
    out.push(top);
  }
  return out;
}

function evalRpn(rpn: Tok[]): number | null {
  const st: number[] = [];
  for (const tok of rpn) {
    if (tok.t === 'num') { st.push(tok.v); continue; }
    if (tok.t !== 'op') return null;
    const b = st.pop();
    const a = st.pop();
    if (a === undefined || b === undefined) return null;
    switch (tok.v) {
      case '+': st.push(a + b); break;
      case '-': st.push(a - b); break;
      case '*': st.push(a * b); break;
      case '/': st.push(a / b); break;
      case '%': st.push(a % b); break;
      default: return null;
    }
  }
  return st.length === 1 ? st[0] : null;
}

function formatNum(n: number): string {
  if (!isFinite(n)) return String(n);
  const r = Math.round(n * 1e10) / 1e10; // kill float dust
  return r.toLocaleString(undefined, { maximumFractionDigits: 10 });
}

/**
 * Parse `query` as arithmetic. Returns null unless it looks like a real
 * expression (has an operator and a digit) and evaluates finitely - so plain
 * words never spuriously show a calculator row.
 */
export function tryCalc(query: string): { expr: string; value: string } | null {
  const s = query.trim();
  if (s.length < 2) return null;
  if (!/^[\d\s+\-*/%.()]+$/.test(s)) return null;
  if (!/[+\-*/%]/.test(s)) return null;
  if (!/\d/.test(s)) return null;
  const toks = tokenize(s);
  if (!toks) return null;
  const rpn = toRpn(toks);
  if (!rpn) return null;
  const v = evalRpn(rpn);
  if (v == null || !isFinite(v)) return null;
  return { expr: s, value: formatNum(v) };
}
