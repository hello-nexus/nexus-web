// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Page tabs never scroll with the content. The dashboard's .content column is
// the scroller, so a page that renders a tabbed <ViewHeader> has to own the
// column height (`height: 100%` on its root) and scroll its body inside that
// root; otherwise the whole page scrolls and the tab bar leaves with it.
// Static check: for every `<ViewHeader ... tabs=` the root element of the
// `return (` it sits in must declare `height: 100%` in the page's styles
// module. The scroller half (overflow-y on the body) is a review item.

const SRC = resolve(__dirname, '../..');
const SKIP_DIRS = new Set(['__tests__', 'storybook', 'sandbox', 'site', 'node_modules']);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else if (name.endsWith('.tsx') && !name.includes('.test.')) {
      out.push(full);
    }
  }
  return out;
}

/** Start offsets of every `<ViewHeader` tag whose props include `tabs=`.
 *  Scans to the tag's real end with brace depth, so a JSX-valued prop before
 *  `tabs=` (`actions={<Button />}`, an arrow handler) cannot hide it. */
function tabbedHeaders(source: string): number[] {
  const hits: number[] = [];
  const tagRe = /<ViewHeader\b/g;
  for (const m of source.matchAll(tagRe)) {
    let depth = 0;
    let end = -1;
    for (let i = m.index + m[0].length; i < source.length; i++) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0) { end = i; break; }
    }
    if (end < 0) continue;
    if (/\btabs=/.test(source.slice(m.index, end))) hits.push(m.index);
  }
  return hits;
}

/** Class of the root element of the JSX `return (` a header sits in.
 *  `stylesVar` is the identifier the page imported its module under
 *  (`styles`, `pageStyles`). */
function rootClassFor(source: string, headerAt: number, stylesVar: string): string {
  const returns = [...source.slice(0, headerAt).matchAll(/return \(\s*</g)];
  if (returns.length === 0) return '(no JSX return before the header)';
  const returnAt = returns[returns.length - 1].index;
  const rootRe = new RegExp(`className=\\{(?:${stylesVar}\\.(\\w+)|\`\\$\\{${stylesVar}\\.(\\w+)\\}|classNames\\(\\s*${stylesVar}\\.(\\w+))`);
  const rootMatch = rootRe.exec(source.slice(returnAt, headerAt));
  return rootMatch ? (rootMatch[1] ?? rootMatch[2] ?? rootMatch[3]) : `(no ${stylesVar}.* root class)`;
}

function blockOf(scss: string, className: string): string | null {
  const start = scss.search(new RegExp(`^\\.${className}\\s*\\{`, 'm'));
  if (start < 0) return null;
  let depth = 0;
  for (let i = scss.indexOf('{', start); i < scss.length; i++) {
    if (scss[i] === '{') depth++;
    else if (scss[i] === '}' && --depth === 0) return scss.slice(start, i + 1);
  }
  return null;
}

/** Only the root's own declarations: nested rules are stripped so a child's
 *  `height: 100%` cannot stand in for the root's. */
function ownDeclarations(block: string): string {
  const inner = block.slice(block.indexOf('{') + 1, block.lastIndexOf('}'));
  let out = '';
  let depth = 0;
  for (const ch of inner) {
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (depth === 0) out += ch;
  }
  return out;
}

describe('page tabs stay docked', () => {
  const files = walk(SRC).filter(f => {
    const source = readFileSync(f, 'utf8');
    return source.includes('ViewHeader') && tabbedHeaders(source).length > 0;
  });

  it('finds the tabbed pages', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of files) {
    const rel = file.slice(SRC.length + 1);
    it(`${rel}: every tabbed root class sizes to the column (height: 100%)`, () => {
      const source = readFileSync(file, 'utf8');
      const stylesImport = /import (\w+) from '([^']+\.module\.scss)'/.exec(source);
      expect(stylesImport, 'tabbed page must import a styles module').not.toBeNull();
      const [, stylesVar, stylesPath] = stylesImport!;
      const scss = readFileSync(resolve(dirname(file), stylesPath), 'utf8');
      const roots = [...new Set(tabbedHeaders(source).map(at => rootClassFor(source, at, stylesVar)))];
      expect(roots.length).toBeGreaterThan(0);
      for (const root of roots) {
        const block = blockOf(scss, root);
        expect(block, `.${root} block in ${stylesPath}`).not.toBeNull();
        expect(ownDeclarations(block!), `.${root} must declare height: 100%`).toMatch(/(^|[^-\w])height:\s*100%/m);
      }
    });
  }
});
