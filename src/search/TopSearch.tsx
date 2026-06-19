import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ArrowUpRight, Calculator, Search, Zap } from 'lucide-react';
import classNames from 'classnames';
import { useTranslation } from '../lib/i18n';
import { useUiSettings } from '../hooks/useUiSettings';
import { useUnifiedDevices } from '../hooks/useUnifiedDevices';
import { useProfiles } from '../hooks/useProfiles';
import { usePanelToggles } from './usePanelToggles';
import { useClickOutside } from '../hooks/useClickOutside';
import { useCommandPalette } from './CommandPaletteContext';
import { subscribeMarketplaceRegistry } from '../widgets/marketplaceRegistry';
import type { CommandContext, PaletteDevice, SearchEntry } from './types';
import { buildEntries } from './providers';
import { scoreEntry } from './match';
import { frecencyBoost, recordUse, snapshotFrecency, type FrecencyMap } from './frecency';
import { tryCalc } from './calc';
import { metaKeyLabel } from './platform';
import styles from './TopSearch.module.scss';

const MAX_RESULTS = 40;
// Beat after an action fires so the row flash / switch flip is seen before close.
const CLOSE_DELAY = 280;
const MAX_SUGGESTIONS = 8;
const MAX_RECENTS = 5;

/**
 * The top-bar search pill. Resting, it shows the page name and opens on click
 * or ⌘K. Active, it turns into an input with a results box docked directly
 * beneath it - no full-screen scrim, the app stays visible behind. Esc or a
 * click outside restores the page title.
 */
export function TopSearch({ pageTitle, online }: { pageTitle: string; online: boolean }) {
  const { isOpen, open, close, host } = useCommandPalette();
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();
  const { unified } = useUnifiedDevices(isOpen);
  const { profiles, activeId, switchProfile } = useProfiles(isOpen);
  const panel = usePanelToggles(isOpen);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  // Optimistic toggle states (id → on/off), so a switch reflects clicks without
  // waiting for a refetch - and clicking the switch keeps search open.
  const [optimistic, setOptimistic] = useState<Record<string, boolean>>({});
  // The action row whose ⚡ is flashing just before close, for tactile feedback.
  const [triggered, setTriggered] = useState<string | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useClickOutside(dockRef, close, isOpen);

  // Rebuild entries when the marketplace registry refreshes (install/uninstall):
  // the installed-apps source reads a module-level cache React can't observe.
  const [marketTick, bumpMarket] = useReducer((n: number) => n + 1, 0);
  useEffect(() => subscribeMarketplaceRegistry(bumpMarket), []);

  // Snapshot frecency + clock when search opens (Date.now() in an effect, never
  // during render). Reset the query and focus the input.
  const [snap, setSnap] = useState<{ map: FrecencyMap; now: number }>({ map: {}, now: 0 });
  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setActive(0);
    setOptimistic({});
    setTriggered(null);
    setSnap({ map: snapshotFrecency(), now: Date.now() });
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [isOpen]);

  const devices = useMemo<PaletteDevice[]>(
    () => unified
      .filter((d) => d.navigable && d.connected)
      .map((d) => ({ key: d.key, name: d.shortName || d.name, subtitle: d.subtitle, iconSrc: d.iconSrc })),
    [unified],
  );

  const ctx = useMemo<CommandContext>(() => ({
    t, online, devices, settings, updateSettings: update, host, close, panel,
    profiles: profiles.map((p) => ({ id: p.id, name: p.name })),
    activeProfileId: activeId,
    switchProfile: (id) => { void switchProfile(id); },
  }), [t, online, devices, settings, update, host, close, panel, profiles, activeId, switchProfile]);

  // marketTick busts the memo when the marketplace registry refreshes (the
  // installed-apps source reads a module cache that isn't part of ctx).
  const entries = useMemo(() => { void marketTick; return buildEntries(ctx); }, [ctx, marketTick]);
  const calc = useMemo(() => tryCalc(query), [query]);

  const results = useMemo<SearchEntry[]>(() => {
    const q = query.trim();
    let list: SearchEntry[];
    if (!q) {
      const recents = entries
        .filter((e) => snap.map[e.id])
        .sort((a, b) => frecencyBoost(b.id, snap.map, snap.now) - frecencyBoost(a.id, snap.map, snap.now))
        .slice(0, MAX_RECENTS);
      const seen = new Set(recents.map((e) => e.id));
      const suggest = entries.filter((e) => e.suggest && !seen.has(e.id));
      list = [...recents, ...suggest].slice(0, MAX_SUGGESTIONS);
    } else {
      // Relevance first (the band already prioritizes title > keyword); then a
      // direct action above a navigation for the same match (search "tray" → the
      // toggle before "Settings › General"); then frecency as the final tiebreak.
      const kindRank = (e: SearchEntry) => (e.kind === 'action' ? 0 : 1);
      list = entries
        .map((e) => ({ e, s: scoreEntry(q, e) }))
        .filter((x): x is { e: SearchEntry; s: number } => x.s != null)
        .sort((a, b) =>
          b.s - a.s
          || kindRank(a.e) - kindRank(b.e)
          || frecencyBoost(b.e.id, snap.map, snap.now) - frecencyBoost(a.e.id, snap.map, snap.now))
        .slice(0, MAX_RESULTS)
        .map((x) => x.e);
    }
    if (calc) {
      const compute: SearchEntry = {
        id: 'compute', title: calc.value, subtitle: `${calc.expr} =`, kind: 'action',
        icon: <Calculator size={18} />, hint: t('search.calc.copy'),
        run: () => { try { void navigator.clipboard?.writeText(calc.value); } catch { /* clipboard blocked */ } },
      };
      return [compute, ...list];
    }
    return list;
  }, [query, entries, snap, calc, t]);

  useEffect(() => { setActive((i) => (i >= results.length ? 0 : i)); }, [results.length]);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  // Current displayed state of a toggle (optimistic override wins until refetch).
  const toggleState = useCallback(
    (entry: SearchEntry) => optimistic[entry.id] ?? !!entry.toggle,
    [optimistic],
  );

  const applyToggle = useCallback((entry: SearchEntry) => {
    const next = !toggleState(entry);
    entry.setToggle?.(next);
    setOptimistic((m) => ({ ...m, [entry.id]: next }));
  }, [toggleState]);

  // Select a result (row click outside the switch, or Enter). Actions flash the
  // row briefly so the change registers, then close; navigations close at once.
  const runEntry = useCallback((entry: SearchEntry) => {
    recordUse(entry.id);
    if (entry.kind === 'action') {
      setTriggered(entry.id);
      if (entry.toggle !== undefined) applyToggle(entry);
      else entry.run();
      window.setTimeout(close, CLOSE_DELAY);
    } else {
      entry.run();
      close();
    }
  }, [close, applyToggle]);

  // Mouse directly on the switch: flip in place, no flash, search stays open.
  const switchToggle = useCallback((entry: SearchEntry) => {
    recordUse(entry.id);
    applyToggle(entry);
  }, [applyToggle]);

  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const entry = results[active];
      if (entry) runEntry(entry);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Home') {
      setActive(0);
    } else if (e.key === 'End') {
      setActive(Math.max(0, results.length - 1));
    }
  }, [results, active, runEntry, close]);

  const isSuggestions = query.trim() === '' && !calc;
  const sectionLabel = isSuggestions
    ? (results.some((e) => snap.map[e.id]) ? t('search.section.recent') : t('search.section.suggestions'))
    : null;
  const metaKey = useMemo(() => metaKeyLabel(), []);

  return (
    <div className={styles.dock} ref={dockRef} data-no-window-drag>
      {isOpen ? (
        <div className={classNames(styles.pill, styles.pillActive)}>
          <Search size={15} className={styles.glyph} aria-hidden />
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            autoComplete="off"
            spellCheck={false}
            role="combobox"
            aria-expanded
            aria-controls="top-search-list"
          />
          {/* eslint-disable-next-line i18next/no-literal-string -- keyboard keycap label */}
          <kbd className={styles.escHint}>esc</kbd>
        </div>
      ) : (
        <button
          type="button"
          className={classNames(styles.pill, styles.pillButton)}
          onClick={open}
          aria-label={t('search.placeholder')}
          aria-keyshortcuts="Meta+K Control+K"
        >
          <Search size={15} className={styles.glyph} aria-hidden />
          <h1 className={styles.title}>{pageTitle}</h1>
          <span className={styles.kbdHint} aria-hidden>
            <kbd>{metaKey}</kbd><kbd>K</kbd>
          </span>
        </button>
      )}

      {isOpen && (
        <div className={styles.dropdown} role="listbox" id="top-search-list" ref={listRef}>
          {sectionLabel && <div className={styles.sectionLabel}>{sectionLabel}</div>}
          {results.length === 0 ? (
            <div className={styles.empty}>{t('search.noresults', { query })}</div>
          ) : (
            results.map((entry, idx) => (
              <button
                key={entry.id}
                type="button"
                data-idx={idx}
                role="option"
                aria-selected={idx === active}
                className={classNames(styles.row, {
                  [styles.rowActive]: idx === active,
                  [styles.rowFlash]: triggered === entry.id,
                })}
                onMouseMove={() => setActive(idx)}
                onClick={(e) => {
                  // Clicking the switch itself flips it and keeps search open (no
                  // flash); anywhere else on the row selects (flash + close).
                  if (entry.toggle !== undefined && (e.target as HTMLElement).closest('[data-switch]')) {
                    switchToggle(entry);
                  } else {
                    runEntry(entry);
                  }
                }}
              >
                <span className={styles.rowIcon}>{entry.icon}</span>
                <span className={styles.rowText}>
                  <span className={styles.rowTitle}>{entry.title}</span>
                  {entry.subtitle && <span className={styles.rowSubtitle}>{entry.subtitle}</span>}
                </span>
                {entry.toggle !== undefined ? (
                  // The on/off control itself: a switch in the current state.
                  // Clicking it flips in place (search stays open).
                  <span
                    data-switch
                    role="switch"
                    aria-checked={toggleState(entry)}
                    className={classNames(styles.switch, { [styles.switchOn]: toggleState(entry) })}
                  >
                    <span className={styles.switchKnob} />
                  </span>
                ) : (
                  <>
                    {entry.hint && <span className={styles.rowHint}>{entry.hint}</span>}
                    {/* Action vs navigation cue: ⚡ applies now, ↗ opens a page.
                        The focused row spells it out with a verb. */}
                    <span className={classNames(styles.rowKind, {
                      [styles.rowKindAction]: entry.kind === 'action',
                      [styles.rowKindShown]: idx === active,
                    })}>
                      {idx === active && (
                        <span className={styles.rowVerb}>
                          {entry.kind === 'action' ? t('search.kind.apply') : t('search.kind.open')}
                        </span>
                      )}
                      {entry.kind === 'action'
                        ? <Zap size={14} aria-hidden />
                        : <ArrowUpRight size={14} aria-hidden />}
                    </span>
                  </>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
