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
}

/** Id prefix for an app taken off the running list rather than the installed
 *  one - the suffix is the process name, which is what focus matching keys on. */
export const RUNNING_APP_ID_PREFIX = 'proc:';

interface PickerEntry {
  id: string;
  name: string;
  iconPath: string;
}

interface AppPickerProps {
  /** Single-select callers. Ignored when `selectedIds` is given. */
  selectedId?: string;
  /** Multi-select callers: every id in the list renders selected. */
  selectedIds?: string[];
  onSelect: (app: { id: string; name: string }) => void;
  /** Prepends a "Running now" group of apps that currently own a window, for
   *  binding something the installed-app list does not carry. */
  showRunning?: boolean;
}

export function AppPicker({ selectedId, selectedIds, onSelect, showRunning = false }: AppPickerProps) {
  const { t } = useTranslation();
  const [apps, setApps] = useState<Shortcut[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [running, setRunning] = useState<string[]>([]);

  useTopicCallback('processes', showRunning, (data) => {
    const rows = (data as { processes?: { name: string; isApp?: boolean }[] }).processes ?? [];
    const names = Array.from(new Set(rows.filter(r => r.isApp && r.name).map(r => r.name)));
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

  const installedEntries = useMemo<PickerEntry[]>(() => apps.map(a => ({
    id: a.id,
    name: a.name,
    iconPath: `/shortcuts/icon?targetId=${encodeURIComponent(a.id)}`,
  })), [apps]);

  const runningEntries = useMemo<PickerEntry[]>(() => running.map(name => ({
    id: RUNNING_APP_ID_PREFIX + name,
    name,
    iconPath: processIconPath(name),
  })), [running]);

  const matches = (e: PickerEntry) => e.name.toLowerCase().includes(query.toLowerCase());
  const filtered = query ? installedEntries.filter(matches) : installedEntries;
  const filteredRunning = query ? runningEntries.filter(matches) : runningEntries;

  const isSelected = (id: string) => (selectedIds ? selectedIds.includes(id) : id === selectedId);

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
            onSelect={() => onSelect({ id: app.id, name: app.name })}
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
            onSelect={() => onSelect({ id: app.id, name: app.name })}
          />
        ))}
      </div>
    </div>
  );
}

function AppRow({ app, selected, onSelect }: {
  app: PickerEntry;
  selected: boolean;
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
      className={`${styles.appRow} ${selected ? styles.appRowSelected : ''}`}
      onClick={onSelect}
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
