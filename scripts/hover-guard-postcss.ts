import type { Plugin } from 'postcss'

// Clears :hover the moment a mouse press lands, app-wide.
//
// CSS keeps a rule matched for as long as the pointer sits over the element,
// so every button in the app stays lit after it is clicked - a dropdown
// trigger still looks hovered while its menu is open. There is no CSS-only
// way to express "until the pointer moves again", so the runtime in
// src/lib/hoverGuard.ts marks the root element and every :hover rule is
// rewritten here to stand down while that mark is present. The mark is an
// attribute, not a class: CSS modules scopes every class it sees, including
// one inside :not(), and a hashed name is unreachable from the runtime.
//
// The guard rides in :where() so it contributes zero specificity: rules keep
// the exact weight and order they were authored with. :where() is Chrome 88 and
// the panel's floor is Chromium 83, which drops a rule it cannot parse, so
// src/panel/ files are skipped. Shared component CSS the panel also loads still
// carries the guard and loses those :hover rules on a Q60 - harmless on a touch
// screen, where nothing hovers. The one other
// blind spot is src/styles/editable.module.scss: vite reaches it through
// `composes: ... from`, which resolves outside this pipeline. Its single
// :hover sits on a label that turns into an input on click, so the stale
// highlight it would leave is never on screen.
const GUARD = ':where(html:not([data-nx-hover="off"]))'

/**
 * True when :hover applies to the element the rule selects, rather than sitting
 * inside a functional pseudo-class argument. `x:not(:hover)` matches the
 * UNhovered element, so guarding it inverts the rule: standing the guard down
 * would drop the resting style instead of the hovered one.
 */
function hasTopLevelHover(selector: string): boolean {
  let depth = 0
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (depth === 0 && selector.startsWith(':hover', i)) return true
  }
  return false
}

/** Splits a selector list on commas that are not inside brackets. */
function splitSelectors(selector: string): string[] {
  const out: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i]
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    else if (ch === ',' && depth === 0) {
      out.push(selector.slice(start, i))
      start = i + 1
    }
  }
  out.push(selector.slice(start))
  return out
}

export default function hoverGuard(): Plugin {
  return {
    postcssPlugin: 'nexus-hover-guard',
    Once(root, { result }) {
      const from = result.opts.from ?? ''
      if (from.includes('/src/panel/') || from.includes('\\src\\panel\\')) return

      root.walkRules(rule => {
        if (!rule.selector.includes(':hover')) return

        rule.selectors = splitSelectors(rule.selector).map(part => {
          const one = part.trim()
          return hasTopLevelHover(one) ? `${GUARD} ${one}` : one
        })
      })
    },
  }
}
hoverGuard.postcss = true
