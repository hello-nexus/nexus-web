import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Calculator, CornerDownLeft, Search } from 'lucide-react';
import classNames from 'classnames';
import { Overlay } from '../components/common/Overlay/Overlay';
import { useTranslation } from '../lib/i18n';
import { useUiSettings } from '../hooks/useUiSettings';
import { useUnifiedDevices } from '../hooks/useUnifiedDevices';
import type { CommandContext, CommandHost, PaletteDevice, SearchEntry } from './types';
import { buildEntries } from './providers';
import { scoreEntry } from './match';
import { frecencyBoost, recordUse, snapshotFrecency, type FrecencyMap } from './frecency';
import { tryCalc } from './calc';
import { metaKeyLabel } from './platform';
import styles from './CommandPalette.module.scss';

const MAX_RESULTS = 40;
const MAX_SUGGESTIONS = 8;
const MAX_RECENTS = 5;

interface Props {
  open: boolean;
  onClose: () => void;
  host: CommandHost;
}

export function CommandPalette({ open, onClose, host }: Props) {
  const { t } = useTranslation();
  const { settings, update } = useUiSettings();
  // Only the open palette pays for device enumeration.
  const { unified } = useUnifiedDevices(open);

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Snapshot frecency + clock when the palette opens — Date.now() runs in an
  // effect, never during render. Resets the query and focuses the input too.
  const [snap, setSnap] = useState<{ map: FrecencyMap; now: number }>({ map: {}, now: 0 });
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setSnap({ map: snapshotFrecency(), now: Date.now() });
    // Overlay mounts the surface this tick; focus on the next.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  const devices = useMemo<PaletteDevice[]>(
    () => unified
      .filter((d) => d.navigable && d.connected)
      .map((d) => ({ key: d.key, name: d.shortName || d.name, subtitle: d.subtitle, iconSrc: d.iconSrc })),
    [unified],
  );

  const ctx = useMemo<CommandContext>(() => ({
    t,
    devices,
    settings: { themeMode: settings.themeMode, accentColor: settings.accentColor, language: settings.language },
    updateSettings: update,
    host,
    close: onClose,
  }), [t, devices, settings.themeMode, settings.accentColor, settings.language, update, host, onClose]);

  const entries = useMemo(() => buildEntries(ctx), [ctx]);

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
      const suggest = entries.filter((e) => e.group === 'navigate' && !seen.has(e.id));
      list = [...recents, ...suggest].slice(0, MAX_SUGGESTIONS);
    } else {
      list = entries
        .map((e) => ({ e, s: scoreEntry(q, e) }))
        .filter((x): x is { e: SearchEntry; s: number } => x.s != null)
        .map((x) => ({ e: x.e, s: x.s + frecencyBoost(x.e.id, snap.map, snap.now) * 0.12 }))
        .sort((a, b) => b.s - a.s)
        .slice(0, MAX_RESULTS)
        .map((x) => x.e);
    }
    if (calc) {
      const compute: SearchEntry = {
        id: 'compute', title: calc.value, subtitle: `${calc.expr} =`, group: 'compute',
        icon: <Calculator size={18} />, hint: t('search.calc.copy'),
        run: () => { try { void navigator.clipboard?.writeText(calc.value); } catch { /* clipboard blocked */ } },
      };
      return [compute, ...list];
    }
    return list;
  }, [query, entries, snap, calc, t]);

  // Keep the selection in range as the list changes.
  useEffect(() => { setActive((i) => (i >= results.length ? 0 : i)); }, [results.length]);
  useEffect(() => { setActive(0); }, [query]);

  // Scroll the active row into view on keyboard movement.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const runEntry = useCallback((entry: SearchEntry) => {
    recordUse(entry.id);
    entry.run();
    if (!entry.keepOpen) onClose();
  }, [onClose]);

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
    } else if (e.key === 'Home') {
      setActive(0);
    } else if (e.key === 'End') {
      setActive(Math.max(0, results.length - 1));
    }
  }, [results, active, runEntry]);

  const isSuggestions = query.trim() === '' && !calc;
  const sectionLabel = isSuggestions
    ? (results.some((e) => snap.map[e.id]) ? t('search.section.recent') : t('search.section.suggestions'))
    : null;

  const platformKey = useMemo(() => metaKeyLabel(), []);

  return (
    <Overlay open={open} onClose={onClose} ariaLabel={t('search.placeholder')} className={styles.palette}>
      <div className={styles.inputRow}>
        <Search size={18} className={styles.inputIcon} aria-hidden />
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
          aria-controls="command-palette-list"
        />
        <kbd className={styles.escHint}>esc</kbd>
      </div>

      <div className={styles.list} ref={listRef} id="command-palette-list" role="listbox">
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
              className={classNames(styles.row, { [styles.rowActive]: idx === active })}
              onMouseMove={() => setActive(idx)}
              onClick={() => runEntry(entry)}
            >
              <span className={styles.rowIcon}>{entry.icon}</span>
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{entry.title}</span>
                {entry.subtitle && <span className={styles.rowSubtitle}>{entry.subtitle}</span>}
              </span>
              {entry.hint && <span className={styles.rowHint}>{entry.hint}</span>}
              {idx === active && <CornerDownLeft size={14} className={styles.rowEnter} aria-hidden />}
            </button>
          ))
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.footerHints}>
          <kbd>↑</kbd><kbd>↓</kbd> {t('search.footer.navigate')}
          <span className={styles.footerSep} />
          <kbd>↵</kbd> {t('search.footer.select')}
        </span>
        <span className={styles.footerBrand}>
          <kbd>{platformKey}</kbd><kbd>K</kbd>
        </span>
      </div>
    </Overlay>
  );
}
