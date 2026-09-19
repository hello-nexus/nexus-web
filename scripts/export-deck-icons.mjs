#!/usr/bin/env node
/**
 * Renders every DECK_ICONS lucide icon (src/panel/widgets/deck/deckIcons.ts)
 * to a 128px white-on-transparent PNG for the service's physical-key
 * renderer (DeckKeyRenderer, nexus-service data/deck-icons/<Name>.png).
 *
 * Reads each icon's raw SVG path data straight from lucide-react's ESM icon
 * modules (no bundler needed) and rasterizes with Playwright's bundled
 * Chromium - neither `sharp` nor `@resvg/resvg-js` is a dependency here, and
 * @playwright/test already is.
 *
 * Usage: node scripts/export-deck-icons.mjs [outDir]
 * outDir defaults to ../nexus-service/data/deck-icons (the normal sibling-
 * checkout layout); pass an absolute path to target a different worktree.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DECK_ICONS_SOURCE = resolve(REPO_ROOT, 'src/panel/widgets/deck/deckIcons.ts');
const ICON_SIZE = 128;

function toKebabCase(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Za-z])([0-9])/g, '$1-$2')
    .toLowerCase();
}

/** Parses the DECK_ICON_NAMES straight out of the DECK_ICONS object literal, so this script never drifts from the curated set. */
function readDeckIconNames() {
  const source = readFileSync(DECK_ICONS_SOURCE, 'utf8');
  const match = source.match(/export const DECK_ICONS: Record<string, LucideIcon> = \{([\s\S]*?)\n\};/);
  if (!match) throw new Error(`DECK_ICONS object literal not found in ${DECK_ICONS_SOURCE}`);
  return match[1]
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

function svgAttrString(attrs) {
  return Object.entries(attrs)
    .filter(([key]) => key !== 'key')
    .map(([key, value]) => `${key.replace(/([A-Z])/g, '-$1').toLowerCase()}="${value}"`)
    .join(' ');
}

/**
 * The [tag, attrs][] node list lucide-react's createLucideIcon renders,
 * straight from the icon's own ESM module. Some DECK_ICONS names (Home,
 * Sliders) are lucide aliases whose module only re-exports another icon's
 * default (e.g. `export { default } from './house.js'`) with no __iconNode
 * of its own - follow that re-export to the real icon module.
 */
async function loadIconNode(name, seen = new Set()) {
  const kebab = toKebabCase(name);
  if (seen.has(kebab)) throw new Error(`alias cycle detected resolving icon "${name}"`);
  seen.add(kebab);
  const modulePath = resolve(REPO_ROOT, `node_modules/lucide-react/dist/esm/icons/${kebab}.js`);
  if (!existsSync(modulePath)) throw new Error(`no lucide-react icon module for "${name}" (expected ${modulePath})`);
  const mod = await import(pathToFileURL(modulePath).href);
  if (mod.__iconNode) return mod.__iconNode;
  const alias = readFileSync(modulePath, 'utf8').match(/export \{ default \} from '\.\/(.+)\.js'/);
  if (!alias) throw new Error(`icon module "${kebab}.js" has neither __iconNode nor a recognized alias re-export`);
  return loadIconNode(alias[1], seen);
}

function buildSvg(iconNode) {
  const inner = iconNode.map(([tag, attrs]) => `<${tag} ${svgAttrString(attrs)}/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 24 24" `
    + `fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

async function main() {
  const outDir = resolve(process.cwd(), process.argv[2] ?? resolve(REPO_ROOT, '../nexus-service/data/deck-icons'));
  mkdirSync(outDir, { recursive: true });

  const names = readDeckIconNames();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: ICON_SIZE, height: ICON_SIZE } });
    for (const name of names) {
      const iconNode = await loadIconNode(name);
      const svg = buildSvg(iconNode);
      await page.setContent(`<!doctype html><html><head><style>html,body{margin:0;padding:0;background:transparent;}</style></head><body>${svg}</body></html>`);
      const png = await page.screenshot({ omitBackground: true });
      writeFileSync(resolve(outDir, `${name}.png`), png);
    }
    await page.close();
  } finally {
    await browser.close();
  }

  console.log(`Exported ${names.length} deck icons to ${outDir}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
