import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  extractEntry,
  extractAssets,
  hasOneShotToken,
  loadedEntry,
  checkOnce,
  RELOAD_LOCK_MS,
  type CheckDeps,
} from './buildReloadWatcher';

const OLD = '/assets/index-AAAAAAAA.js';
const NEW = '/assets/index-BBBBBBBB.js';
// A realistic shell: entry script + a static-import modulepreload + stylesheet.
const html = (entry: string) =>
  `<!doctype html><html><head>` +
  `<link rel="stylesheet" crossorigin href="/assets/index-CCCCCCCC.css">` +
  `<link rel="modulepreload" crossorigin href="/assets/platform-DDDDDDDD.js">` +
  `<script type="module" crossorigin src="${entry}"></script>` +
  `</head></html>`;

function makeDeps(over: Partial<CheckDeps> = {}): CheckDeps {
  return {
    loaded: OLD,
    oneShotToken: false,
    now: 1_000_000,
    fetchText: vi.fn(async () => ({ ok: true, text: html(NEW) })),
    assetsOk: vi.fn(async () => true),
    readTarget: vi.fn(() => ({ target: null, at: 0 })),
    writeTarget: vi.fn(),
    reload: vi.fn(),
    log: vi.fn(),
    ...over,
  };
}

describe('extractEntry', () => {
  it('pulls the single hashed entry chunk out of an index.html', () => {
    expect(extractEntry(html(NEW))).toBe(NEW);
  });
  it('returns null when no entry chunk is present', () => {
    expect(extractEntry('<html><head></head></html>')).toBeNull();
  });
});

describe('extractAssets', () => {
  it('collects the entry, its modulepreloads, and the stylesheet (deduped)', () => {
    expect(extractAssets(html(NEW)).sort()).toEqual([
      '/assets/index-CCCCCCCC.css',
      NEW,
      '/assets/platform-DDDDDDDD.js',
    ].sort());
  });
  it('is empty when no assets are referenced', () => {
    expect(extractAssets('<html><head></head></html>')).toEqual([]);
  });
});

describe('hasOneShotToken', () => {
  it('is true for a pairing/consume token, false otherwise', () => {
    expect(hasOneShotToken('?pair=abc')).toBe(true);
    expect(hasOneShotToken('?foo=1&token=xyz')).toBe(true);
    expect(hasOneShotToken('')).toBe(false);
    expect(hasOneShotToken('?deviceId=q60-1')).toBe(false);
  });
});

describe('loadedEntry', () => {
  beforeEach(() => { document.head.innerHTML = ''; });
  it('reads the running document module script src', () => {
    document.head.innerHTML = `<script type="module" src="${OLD}"></script>`;
    expect(loadedEntry()).toBe(OLD);
  });
  it('is null on an unhashed dev-server graph (no matching script)', () => {
    document.head.innerHTML = `<script type="module" src="/src/main.tsx"></script>`;
    expect(loadedEntry()).toBeNull();
  });
});

describe('checkOnce', () => {
  it('no-ops when the running entry is unknown (dev server)', async () => {
    const deps = makeDeps({ loaded: null });
    expect(await checkOnce(deps)).toBe('noop');
    expect(deps.fetchText).not.toHaveBeenCalled();
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('no-ops (never reloads) while a one-shot pairing token is in the URL', async () => {
    const deps = makeDeps({ oneShotToken: true });
    expect(await checkOnce(deps)).toBe('noop');
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('no-ops when index.html cannot be fetched', async () => {
    const deps = makeDeps({ fetchText: vi.fn(async () => ({ ok: false, text: '' })) });
    expect(await checkOnce(deps)).toBe('noop');
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('no-ops when the index.html fetch throws (service mid-restart)', async () => {
    const deps = makeDeps({ fetchText: vi.fn(async () => { throw new Error('down'); }) });
    expect(await checkOnce(deps)).toBe('noop');
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('does not reload when the served entry equals the loaded one', async () => {
    const deps = makeDeps({ fetchText: vi.fn(async () => ({ ok: true, text: html(OLD) })) });
    expect(await checkOnce(deps)).toBe('same');
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('reloads once when a different entry is served and every asset is fetchable', async () => {
    const deps = makeDeps();
    expect(await checkOnce(deps)).toBe('reload');
    // Verifies the whole referenced asset set, not just the entry.
    expect(deps.assetsOk).toHaveBeenCalledWith(expect.arrayContaining([NEW, '/assets/platform-DDDDDDDD.js', '/assets/index-CCCCCCCC.css']));
    expect(deps.writeTarget).toHaveBeenCalledWith(NEW, 1_000_000);
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it('does NOT reload into a half-finished deploy (a referenced chunk not yet fetchable)', async () => {
    const deps = makeDeps({ assetsOk: vi.fn(async () => false) });
    expect(await checkOnce(deps)).toBe('unverified');
    expect(deps.writeTarget).not.toHaveBeenCalled();
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('loop cap: refuses to reload to the same target twice within the lock window', async () => {
    const deps = makeDeps({ readTarget: () => ({ target: NEW, at: 1_000_000 - (RELOAD_LOCK_MS - 1) }) });
    expect(await checkOnce(deps)).toBe('locked');
    expect(deps.reload).not.toHaveBeenCalled();
  });

  it('re-attempts the same target once the lock window elapses', async () => {
    const deps = makeDeps({ readTarget: () => ({ target: NEW, at: 1_000_000 - (RELOAD_LOCK_MS + 1) }) });
    expect(await checkOnce(deps)).toBe('reload');
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it('a stale lock for a DIFFERENT target never blocks a genuinely new deploy', async () => {
    const deps = makeDeps({ readTarget: () => ({ target: '/assets/index-OLDLOCK0.js', at: 1_000_000 }) });
    expect(await checkOnce(deps)).toBe('reload');
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });
});
