import { useState, useEffect, useRef, useMemo } from 'react';
import { AppWindow } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { fetchService, fetchServiceBlob } from '../../../api/service';
import { processIconPath } from '../../../api/processIcon';
import { SearchInput } from '../../../components/common/SearchInput/SearchInput';
import { withMediaFetchSlot as withIconSlot } from '../../../lib/mediaFetchSlot';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import styles from './AppPicker.module.scss';

interface Shortcut {
  id: string;
  name: string;
  path: string;
  /** Resolved by the service; empty when it could not be. */
  processName?: string;
}

/** Id prefix for an app taken off the running list rather than the installed
 *  one - the suffix is the process name, which is what focus matching keys on.
 *  Mirrors RunningPrefix in the service's LightingDevicesRoutes. */
const RUNNING_APP_ID_PREFIX = 'proc:';

interface PickerEntry {
  id: string;
  name: string;
  iconPath: string;
  processName: string;
}

interface AppPickerProps {
  /** Single-select callers. Ignored when `selectedIds` is given. */
  selectedId?: string;
  /** Multi-select callers: every id in the list renders selected. */
  selectedIds?: string[];
  /** Carries the resolved process name so a caller can match this app against
   *  one bound under a different id (the running list vs the installed list). */
  onSelect: (app: { id: string; name: string; processName?: string }) => void;
  /** Prepends a "Running now" group of apps that currently own a window, for
   *  binding something the installed-app list does not carry. */
  showRunning?: boolean;
  /** Keys that are spoken for, mapped to a reason shown on the row. Matched
   *  against an entry's id AND its resolved process name, so the same app
   *  reads as taken whichever list it came from. They stay clickable so the
   *  caller can explain; they just do not read as selectable. */
  unavailableIds?: Record<string, string>;
}

export function AppPicker({ selectedId, selectedIds, onSelect, showRunning = false, unavailableIds }: AppPickerProps) {
  const { t } = useTranslation();
  const [apps, setApps] = useState<Shortcut[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [running, setRunning] = useState<string[]>([]);

  useTopicCallback('processes', showRunning, (data) => {
    const rows = (data as { processes?: { name: string; isApp?: boolean }[] }).processes ?? [];
    // Case-folded, matching how the service aggregates process names.
    const seen = new Map<string, string>();
    for (const r of rows) {
      if (r.isApp && r.name) seen.set(r.name.toLowerCase(), r.name);
    }
    const names = Array.from(seen.values());
    names.sort((a, b) => a.localeCompare(b));
    setRunning(prev => (prev.length === names.length && prev.every((n, i) => n === names[i]) ? prev : names));
  });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const res = await fetchService<{ shortcuts: Shortcut[] }>('/shortcuts');
      if (!cancelled) {
        setApps(res?.shortcuts ?? []);
        setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  // A running process that matches an installed app is shown once, under
  // Running now, but carries the installed entry's id and display name - the
  // stable id and the nicer label - instead of the bare process name.
  const installedByProcess = useMemo(() => {
    const out = new Map<string, Shortcut>();
    for (const a of apps) {
      const key = a.processName?.toLowerCase();
      if (key && !out.has(key)) out.set(key, a);
    }
    return out;
  }, [apps]);

  const runningEntries = useMemo<PickerEntry[]>(() => running.map(name => {
    const key = name.toLowerCase();
    const installed = installedByProcess.get(key);
    return installed
      ? {
        id: installed.id,
        name: installed.name,
        iconPath: `/shortcuts/icon?targetId=${encodeURIComponent(installed.id)}`,
        processName: key,
      }
      : {
        id: RUNNING_APP_ID_PREFIX + name,
        name,
        iconPath: processIconPath(name),
        processName: key,
      };
  }), [running, installedByProcess]);

  // Only the entry actually promoted into Running now is dropped, by id: two
  // shortcuts can target one exe, and the other must stay reachable.
  const promotedIds = useMemo(
    () => new Set(runningEntries.map(e => e.id)),
    [runningEntries],
  );

  const installedEntries = useMemo<PickerEntry[]>(() => apps
    .filter(a => !promotedIds.has(a.id))
    .map(a => ({
      id: a.id,
      name: a.name,
      iconPath: `/shortcuts/icon?targetId=${encodeURIComponent(a.id)}`,
      processName: a.processName?.toLowerCase() ?? '',
    })), [apps, promotedIds]);

  const matches = (e: PickerEntry) => e.name.toLowerCase().includes(query.toLowerCase());
  const filtered = query ? installedEntries.filter(matches) : installedEntries;
  const filteredRunning = query ? runningEntries.filter(matches) : runningEntries;

  const isSelected = (id: string) => (selectedIds ? selectedIds.includes(id) : id === selectedId);
  const unavailableReason = (entry: PickerEntry) =>
    unavailableIds?.[entry.id] ?? (entry.processName ? unavailableIds?.[entry.processName] : undefined);

  return (
    <div className={styles.picker}>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={t('panel.settings.searchApps')}
      />
      <div className={styles.list} data-panel-scrollable="true">
        {loading && <div className={styles.empty}>{t('panel.settings.loadingApps')}</div>}
        {!loading && filtered.length === 0 && filteredRunning.length === 0 && (
          <div className={styles.empty}>
            {apps.length === 0 ? t('panel.settings.connectForApps') : t('panel.settings.noApps')}
          </div>
        )}
        {filteredRunning.length > 0 && (
          <div className={styles.groupLabel}>{t('panel.settings.runningApps')}</div>
        )}
        {filteredRunning.map(app => (
          <AppRow
            key={app.id}
            app={app}
            selected={isSelected(app.id)}
            unavailable={unavailableReason(app)}
            onSelect={() => onSelect({ id: app.id, name: app.name, processName: app.processName })}
          />
        ))}
        {showRunning && filteredRunning.length > 0 && filtered.length > 0 && (
          <div className={styles.groupLabel}>{t('panel.settings.installedApps')}</div>
        )}
        {filtered.map(app => (
          <AppRow
            key={app.id}
            app={app}
            selected={isSelected(app.id)}
            unavailable={unavailableReason(app)}
            onSelect={() => onSelect({ id: app.id, name: app.name, processName: app.processName })}
          />
        ))}
      </div>
    </div>
  );
}

function AppRow({ app, selected, unavailable, onSelect }: {
  app: PickerEntry;
  selected: boolean;
  unavailable?: string;
  onSelect: () => void;
}) {
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const rowRef = useRef<HTMLButtonElement>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    const el = rowRef.current;
    if (!el) return;

    let cancelled = false;
    let revoke = '';
    const observer = new IntersectionObserver(entries => {
      if (!entries[0]?.isIntersecting) return;
      observer.disconnect();
      loadedRef.current = true;
      void withIconSlot(async () => {
        if (cancelled) return;
        const blob = await fetchServiceBlob(app.iconPath);
        if (!cancelled && blob && blob.size > 0) {
          const url = URL.createObjectURL(blob);
          revoke = url;
          setIconUrl(url);
        }
      });
    }, { rootMargin: '100px' });

    observer.observe(el);
    // Revoke on unmount: the IntersectionObserver callback's return value is
    // discarded, so the object URL must be freed from the effect cleanup.
    return () => {
      cancelled = true;
      observer.disconnect();
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [app.iconPath]);

  return (
    <button
      ref={rowRef}
      type="button"
      className={`${styles.appRow} ${selected ? styles.appRowSelected : ''} ${unavailable ? styles.appRowTaken : ''}`}
      onClick={onSelect}
      title={unavailable}
      aria-disabled={unavailable ? true : undefined}
    >
      {iconUrl
        ? <img src={iconUrl} className={styles.rowIcon} alt="" />
        : <AppWindow size={20} className={styles.rowIconFallback} />
      }
      <span className={styles.rowName}>{app.name}</span>
    </button>
  );
}

// Two consumers (the Deck widget, AppPicker.test) import useAppIcon from this
// module path; moving the hook to a sibling file would force changes in those
// files, so it stays here and accepts the loss of fast-refresh for AppPicker's
// component edits.
 
export function useAppIcon(appId: string | undefined): string | null {
  const [iconUrl, setIconUrl] = useState<string | null>(null);

  useEffect(() => {
    // Synchronise local icon state to the incoming appId prop. The reset
    // paths intentionally clear `iconUrl` so a stale icon from the
    // previous appId doesn't flash before the new blob resolves.
     
    if (!appId) { setIconUrl(null); return; }
    setIconUrl(null);
    let revoke = '';
    let cancelled = false;
    void withIconSlot(async () => {
      if (cancelled) return;
      const blob = await fetchServiceBlob(`/shortcuts/icon?targetId=${encodeURIComponent(appId)}`);
      if (!cancelled && blob && blob.size > 0) {
        const url = URL.createObjectURL(blob);
        revoke = url;
        setIconUrl(url);
      }
    });
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [appId]);

  return iconUrl;
}
