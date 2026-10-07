import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearDevSims, fetchDevSimEvents, startDevSim, stopDevSim,
  type DevSimCatalogEntry, type DevSimEvents,
} from '../../api/devSim';
import { useTranslation } from '../../lib/i18n';
import { Button } from '../common/Button/Button';
import { Card } from '../common/Card/Card';
import { SettingToggle } from '../common/SettingRow/SettingRow';
import styles from './ToolsView.module.scss';

// Display order of the service's categories; one it does not list follows, under its raw name.
const CATEGORY_ORDER = ['guard', 'health', 'incident', 'device'];

interface DevSimEventsViewProps {
  catalog: DevSimCatalogEntry[];
  activeIds: ReadonlySet<string>;
  /** A request is in flight; the switches and Clear all disable. */
  busy: boolean;
  error: string | null;
  onToggle: (id: string, on: boolean) => void;
  onClear: () => void;
}

/** The card's content apart from the service wiring. */
export function DevSimEventsView({ catalog, activeIds, busy, error, onToggle, onClear }: DevSimEventsViewProps) {
  const { t } = useTranslation();

  const groups = useMemo(() => {
    const byCategory = new Map<string, DevSimCatalogEntry[]>();
    for (const entry of catalog) {
      const list = byCategory.get(entry.category) ?? [];
      list.push(entry);
      byCategory.set(entry.category, list);
    }
    const known = CATEGORY_ORDER.filter(c => byCategory.has(c));
    const extra = [...byCategory.keys()].filter(c => !CATEGORY_ORDER.includes(c));
    return [...known, ...extra].map(category => ({ category, entries: byCategory.get(category)! }));
  }, [catalog]);

  // Labels are localized by id; an id this build has no string for keeps the service's own label.
  const localized = (key: string, fallback: string): string => {
    const text = t(key);
    return text === key ? fallback : text;
  };

  return (
    <Card title={t('tools.simEvents.title')}>
      <span className={styles.dim}>{t('tools.simEvents.description')}</span>
      {groups.map(({ category, entries }) => (
        <section key={category} aria-label={localized(`tools.simEvents.category.${category}`, category)}>
          <h4>{localized(`tools.simEvents.category.${category}`, category)}</h4>
          {entries.map(entry => (
            <SettingToggle
              key={entry.id}
              label={localized(`tools.simEvents.event.${entry.id}`, entry.label)}
              checked={activeIds.has(entry.id)}
              disabled={busy}
              onChange={on => onToggle(entry.id, on)}
            />
          ))}
        </section>
      ))}
      <div className={styles.actionsRow}>
        <Button tone="danger" size="sm" disabled={busy || activeIds.size === 0} onClick={onClear}>
          {t('tools.simEvents.clearAll')}
        </Button>
      </div>
      {error && <span role="alert" className={styles.dim}>{error}</span>}
    </Card>
  );
}

/** Dev-tools-only card on the Tools page: switch simulated events on and off. */
export function DevSimEventsCard() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<DevSimEvents | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await fetchDevSimEvents();
    if (next) setEvents(next);
    return next !== null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchDevSimEvents().then(next => {
      if (cancelled) return;
      if (next) setEvents(next);
      else setError(t('tools.simEvents.loadError'));
    });
    return () => { cancelled = true; };
  // Loads once on mount; t only supplies the failure text.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One request at a time, then a refetch so the switches show what the service holds.
  const run = useCallback(async (send: () => Promise<{ error?: boolean } | null>) => {
    setBusy(true);
    try {
      const res = await send();
      if (!res || res.error) setError(t('tools.simEvents.error'));
      else setError(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh, t]);

  const activeIds = useMemo(() => new Set((events?.active ?? []).map(a => a.id)), [events]);

  if (!events && !error) return null;
  return (
    <DevSimEventsView
      catalog={events?.catalog ?? []}
      activeIds={activeIds}
      busy={busy}
      error={error}
      onToggle={(id, on) => { void run(() => (on ? startDevSim(id) : stopDevSim(id))); }}
      onClear={() => { void run(clearDevSims); }}
    />
  );
}
