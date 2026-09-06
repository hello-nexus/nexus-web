import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { REGISTRY } from '../../storybook/registry';

const REPO_ROOT = join(__dirname, '..', '..', '..');

/*
 * Keeps the Storybook registry honest:
 *  - every filePath points at a real file (no stale paths after moves/renames)
 *  - every shared component dir is cataloged or explicitly excluded
 *  - every Preview renders without throwing (a render canary for the whole
 *    primitives catalogue - most of these components have no other test)
 */

// Non-visual utilities that live under components/common but are not catalog
// material. Add here only with a reason.
const COMMON_EXCLUSIONS: Record<string, string> = {
  ContextMenu: 'side-effect contextmenu suppressor, renders null; has its own unit test',
  ErrorBoundary: 'render-time error catcher, nothing to preview',
  PairRemote: 'live-state pairing orchestration (QR mint, sessions poll, socket); not stub-renderable',
};

// panel/widgets/common modules that are not components.
const PANEL_KIT_EXCLUSIONS: Record<string, string> = {
  PanelPreviewContext: 'context provider for catalog preview mode, nothing to preview',
  PanelImmersiveContext: 'context provider for the fullscreen immersive view, nothing to preview',
};

// First path segment under the prefix, .tsx stripped - so a dir entry
// (Foo/Foo.tsx) and a flat file entry (Foo.tsx) both register as "Foo".
function registeredUnder(prefix: string): Set<string> {
  const hits = new Set<string>();
  for (const entry of REGISTRY) {
    if (entry.filePath.startsWith(prefix)) {
      hits.add(entry.filePath.slice(prefix.length).split('/')[0].replace(/\.tsx$/, ''));
    }
  }
  return hits;
}

// Component dirs plus flat .tsx components (tests excluded) in a dir.
function componentNames(dir: string): string[] {
  return readdirSync(dir)
    .filter(name => !name.includes('.test.'))
    .filter(name => name.endsWith('.tsx') || statSync(join(dir, name)).isDirectory())
    .map(name => name.replace(/\.tsx$/, ''));
}

describe('storybook registry', () => {
  it('every filePath exists and is a plain repo-relative path', () => {
    const bad: string[] = [];
    for (const entry of REGISTRY) {
      if (/:\d+$/.test(entry.filePath) || !existsSync(join(REPO_ROOT, entry.filePath))) {
        bad.push(`${entry.name} -> ${entry.filePath}`);
      }
    }
    expect(bad, `stale or malformed filePath(s):\n${bad.join('\n')}`).toEqual([]);
  });

  it('has no duplicate entry names', () => {
    const names = REGISTRY.map(e => e.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('covers every component under src/components/common', () => {
    const registered = registeredUnder('src/components/common/');
    const missing = componentNames(join(REPO_ROOT, 'src/components/common'))
      .filter(name => !registered.has(name) && !(name in COMMON_EXCLUSIONS));
    expect(
      missing,
      `unregistered components/common entries (register in src/storybook/registry.tsx or exclude with a reason):\n${missing.join('\n')}`,
    ).toEqual([]);
  });

  it('covers every panel-kit module under src/panel/widgets/common', () => {
    const registered = registeredUnder('src/panel/widgets/common/');
    const missing = componentNames(join(REPO_ROOT, 'src/panel/widgets/common'))
      .filter(name => !registered.has(name) && !(name in PANEL_KIT_EXCLUSIONS));
    expect(
      missing,
      `unregistered panel-kit modules (register in src/storybook/registry.tsx or exclude with a reason):\n${missing.join('\n')}`,
    ).toEqual([]);
  });
});

describe('storybook previews', () => {
  afterEach(cleanup);

  const previewable = REGISTRY.filter(e => e.Preview);

  it.each(previewable.map(e => [e.name, e] as const))('renders %s', (_name, entry) => {
    const Preview = entry.Preview!;
    expect(() => render(<Preview />)).not.toThrow();
  });
});
