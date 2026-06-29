import { useState, useEffect, useRef } from 'react';
import { AppWindow } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { fetchService, fetchServiceBlob } from '../../../api/service';
import { SearchInput } from '../../../components/common/SearchInput/SearchInput';
import styles from './AppPicker.module.scss';

// Cap concurrent icon fetches. A screenful of picker rows - or a deck full of
// launch buttons (each useAppIcon below) - would otherwise fire one fetch per
// item at once and occupy all 6 of the browser's per-origin connections. The
// panel's /ping health check shares that pool, so it queues behind the backlog
// and blows its 3s abort, reading "offline" and tearing down the editor. A
// first browse is the worst case: icon-less apps re-extract server-side every
// time, so the backlog drains slowly. The cap stays below the per-origin pool
// so /ping and live traffic always have a free connection; icons are lazy, so
// the slightly slower fill is unseen.
const ICON_FETCH_CONCURRENCY = 3;
let iconPermits = ICON_FETCH_CONCURRENCY;
const iconWaiters: Array<() => void> = [];

function withIconSlot<T>(run: () => Promise<T>): Promise<T> {
  const acquire = iconPermits > 0
    ? (iconPermits--, Promise.resolve())
    : new Promise<void>(resolve => iconWaiters.push(resolve));
  return acquire.then(async () => {
    try {
      return await run();
    } finally {
      const next = iconWaiters.shift();
      if (next) next();
      else iconPermits++;
    }
  });
}

interface Shortcut {
  id: string;
  name: string;
  path: string;
}

interface AppPickerProps {
  selectedId: string;
  onSelect: (app: { id: string; name: string }) => void;
}

export function AppPicker({ selectedId, onSelect }: AppPickerProps) {
  const { t } = useTranslation();
  const [apps, setApps] = useState<Shortcut[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');

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

  const filtered = query
    ? apps.filter(a => a.name.toLowerCase().includes(query.toLowerCase()))
    : apps;

  return (
    <div className={styles.picker}>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={t('panel.settings.searchApps')}
      />
      <div className={styles.list} data-panel-scrollable="true">
        {loading && <div className={styles.empty}>{t('panel.settings.loadingApps')}</div>}
        {!loading && filtered.length === 0 && (
          <div className={styles.empty}>
            {apps.length === 0 ? t('panel.settings.connectForApps') : t('panel.settings.noApps')}
          </div>
        )}
        {filtered.map(app => (
          <AppRow
            key={app.id}
            app={app}
            selected={app.id === selectedId}
            onSelect={() => onSelect({ id: app.id, name: app.name })}
          />
        ))}
      </div>
    </div>
  );
}

function AppRow({ app, selected, onSelect }: {
  app: Shortcut;
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
        const blob = await fetchServiceBlob(`/shortcuts/icon?targetId=${encodeURIComponent(app.id)}`);
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
  }, [app.id]);

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
