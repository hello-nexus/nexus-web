import { useCallback, useEffect, useState } from 'react';
import { Download, Trash2, X } from 'lucide-react';
import type { WidgetCatalogEntry } from './types';
import { listAvailableWidgets, installWidget, uninstallWidget } from './marketplaceApi';
import { loadMarketplaceWidgets } from './marketplaceRegistry';
import { resolveHttp } from '../api/service';
import styles from './MarketplaceBrowser.module.scss';

export interface MarketplaceBrowserProps {
  open: boolean;
  onClose: () => void;
}

export function MarketplaceBrowser({ open, onClose }: MarketplaceBrowserProps) {
  const [entries, setEntries] = useState<WidgetCatalogEntry[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const list = await listAvailableWidgets();
      setEntries(list);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const onInstall = useCallback(async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const r = await installWidget(id);
      if (r?.error) setError(r.error);
      await refresh();
      await loadMarketplaceWidgets();
    } finally {
      setBusyId(null);
    }
  }, [refresh]);

  const onUninstall = useCallback(async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      const r = await uninstallWidget(id);
      if (r?.error) setError(r.error);
      await refresh();
      await loadMarketplaceWidgets();
    } finally {
      setBusyId(null);
    }
  }, [refresh]);

  if (!open) return null;

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Widget marketplace">
        <header className={styles.header}>
          <div>
            <h2>Marketplace</h2>
            <div className={styles.sub}>Browse and install widgets. First-party + dev widgets show here today; remote marketplace lands later.</div>
          </div>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <X size={16} />
          </button>
        </header>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.grid}>
          {entries === null && <div className={styles.empty}>Loading…</div>}
          {entries && entries.length === 0 && <div className={styles.empty}>No widgets available.</div>}
          {entries?.map((entry) => (
            <article key={entry.id} className={styles.card}>
              <div className={styles.iconWrap}>
                {entry.iconUrl ? (
                  <img src={resolveHttp(entry.iconUrl)} alt="" className={styles.icon} />
                ) : (
                  <div className={styles.iconPlaceholder}>{entry.name.slice(0, 2).toUpperCase()}</div>
                )}
              </div>
              <div className={styles.body}>
                <div className={styles.title}>{entry.name}</div>
                <div className={styles.meta}>v{entry.version} · {entry.source}</div>
                <p className={styles.description}>{entry.description || 'No description.'}</p>
              </div>
              <div className={styles.actions}>
                {entry.source === 'bundled' && !entry.installed ? (
                  <button
                    type="button"
                    className={styles.installButton}
                    onClick={() => void onInstall(entry.id)}
                    disabled={busyId === entry.id}
                  >
                    <Download size={14} />
                    {busyId === entry.id ? 'Installing…' : 'Install'}
                  </button>
                ) : null}
                {entry.installed ? (
                  <button
                    type="button"
                    className={styles.uninstallButton}
                    onClick={() => void onUninstall(entry.id)}
                    disabled={busyId === entry.id}
                  >
                    <Trash2 size={14} />
                    {busyId === entry.id ? 'Removing…' : 'Uninstall'}
                  </button>
                ) : null}
                {entry.source === 'dev' ? (
                  <span className={styles.devBadge}>DEV</span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
