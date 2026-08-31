import type { AtRule, Plugin } from 'postcss'

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
// the exact weight and order they were authored with. That costs the panel
// bundle, whose floor is Chromium 83 (:where() arrived in 88) and which would
// drop the whole rule - so files under src/panel/ are left alone. They render
// on touch screens, where nothing hovers in the first place. The one other
// blind spot is src/styles/editable.module.scss: vite reaches it through
// `composes: ... from`, which resolves outside this pipeline. Its single
// :hover sits on a label that turns into an input on click, so the stale
// highlight it would leave is never on screen.
const GUARD = ':where(html:not([data-nx-hover="off"]))'

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
        // Inside @keyframes a "selector" is a percentage step, never a :hover.
        const parent = rule.parent as AtRule | undefined
        if (parent?.type === 'atrule' && /keyframes$/.test(parent.name)) return

        rule.selectors = splitSelectors(rule.selector).map(part => {
          const one = part.trim()
          return one.includes(':hover') ? `${GUARD} ${one}` : one
        })
      })
    },
  }
}
hoverGuard.postcss = true
