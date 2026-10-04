import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { SectionHeader } from '../../../components/common/SectionHeader/SectionHeader';
import { useTranslation } from '../../../lib/i18n';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import {
  fetchHaDashboard,
  fetchHaDashboards,
  HA_DEFAULT_DASHBOARD_ID,
  type HaDashboard,
  type HaEntity,
} from '../../../api/homeAssistant';
import { parseLovelaceConfig, type HaLayoutView } from './lovelaceLayout';
import { isSupportedEntityId } from './haDomains';
import { HaEntityTile, HaMoreInfoDialog } from './HaEntityTile';
import type { HomeAssistantController } from './HomeAssistantPage';
import styles from './HomeAssistantPage.module.scss';

export type HaDashboardStatus = 'loading' | 'ready' | 'generated' | 'not_found' | 'failed';

export interface HaDashboardState {
  status: HaDashboardStatus;
  views: HaLayoutView[];
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

export function dashboardTitle(d: HaDashboard, t: Translate): string {
  return d.title || (d.id === HA_DEFAULT_DASHBOARD_ID ? t('homeAssistant.dashboard.overview') : d.id);
}

export function viewTitle(view: HaLayoutView, index: number, t: Translate): string {
  return view.title || t('homeAssistant.dashboard.view', { n: index + 1 });
}

// HA's dashboard list; null until the first response.
export function useHaDashboards(enabled: boolean): HaDashboard[] | null {
  const [dashboards, setDashboards] = useState<HaDashboard[] | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchHaDashboards().then(res => {
      if (!cancelled) setDashboards(res?.connected ? res.dashboards : []);
    });
    return () => { cancelled = true; };
  }, [enabled]);
  return dashboards;
}

// Loads one dashboard's layout and reloads it when HA reports a saved edit.
// onLoaded runs after each load: the service starts tracking the dashboard's
// entities while serving it, so the caller refetches its entity list then.
export function useHaDashboard(id: string, enabled: boolean, onLoaded: () => void): HaDashboardState {
  // Tagged with the id it belongs to, so a switch never shows the previous dashboard.
  const [state, setState] = useState<HaDashboardState & { id: string }>({ id, status: 'loading', views: [] });
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => { onLoadedRef.current = onLoaded; }, [onLoaded]);
  const revisionRef = useRef<number | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    const seq = ++loadSeq.current;
    const res = await fetchHaDashboard(id);
    if (seq !== loadSeq.current) return;
    // Without a revision (older service) the next frame reloads once to catch up.
    revisionRef.current = typeof res?.revision === 'number' ? res.revision : null;
    if (!res || res.error === 'failed' || res.error === 'not_connected') {
      setState({ id, status: 'failed', views: [] });
      return;
    }
    if (res.error === 'not_found') {
      // HA answers "not found" for its default dashboard while it is auto-generated.
      setState({ id, status: id === HA_DEFAULT_DASHBOARD_ID ? 'generated' : 'not_found', views: [] });
      return;
    }
    const layout = parseLovelaceConfig(res.config);
    setState(layout.kind === 'generated'
      ? { id, status: 'generated', views: [] }
      : { id, status: 'ready', views: layout.views });
    onLoadedRef.current();
  }, [id]);

  useEffect(() => {
    if (!enabled || !id) return;
    setState({ id, status: 'loading', views: [] });
    void load();
  }, [enabled, id, load]);

  useTopicCallback('homeAssistant', enabled && !!id, (data: unknown) => {
    const rev = (data as { dashboardsRevision?: unknown } | null)?.dashboardsRevision;
    if (typeof rev !== 'number') return;
    const changed = rev !== revisionRef.current;
    revisionRef.current = rev;
    if (changed) void load();
  });

  return state.id === id ? { status: state.status, views: state.views } : { status: 'loading', views: [] };
}

export function HaDashboardMessage({ status, empty }: { status: HaDashboardStatus; empty?: boolean }) {
  const { t } = useTranslation();
  if (status === 'loading') return null;
  const title = status === 'generated'
    ? t('homeAssistant.dashboard.generatedTitle')
    : status === 'not_found'
      ? t('homeAssistant.dashboard.notFound')
      : status === 'failed'
        ? t('homeAssistant.dashboard.loadFailed')
        : empty ? t('homeAssistant.dashboard.empty') : null;
  if (!title) return null;
  const hint = status === 'generated' ? t('homeAssistant.dashboard.generated') : undefined;
  return <EmptyState hero icon={<LayoutDashboard />} title={title} hint={hint} />;
}

export function HaDashboardViewBody({
  ctrl,
  view,
  immersive,
}: {
  ctrl: HomeAssistantController;
  view: HaLayoutView;
  immersive?: boolean;
}) {
  const { t } = useTranslation();
  // Track by entity ID so the dialog always sees live optimistic state.
  const [detailId, setDetailId] = useState<string | null>(null);
  const byId = new Map(ctrl.entities.map(e => [e.id, e]));
  const detailEntity = detailId ? byId.get(detailId) ?? null : null;

  let unsupported = view.skippedCards;
  const groups = view.groups
    .map(g => {
      const tiles: { entity: HaEntity; name?: string }[] = [];
      for (const item of g.items) {
        if (!isSupportedEntityId(item.entityId)) { unsupported++; continue; }
        const entity = byId.get(item.entityId);
        // Not in HA (renamed or removed): HA's own frontend shows a warning card, Nexus omits it.
        if (entity) tiles.push({ entity, name: item.name });
      }
      return { title: g.title, tiles };
    })
    .filter(g => g.tiles.length > 0);

  return (
    <div className={immersive ? styles.bodyImmersive : styles.entityList}>
      {groups.length === 0 ? (
        // eslint-disable-next-line i18next/no-literal-string -- status enum
        <HaDashboardMessage status="ready" empty />
      ) : (
        groups.map((g, i) => (
          <section key={`${i}:${g.title}`} className={styles.dashboardGroup}>
            {g.title && <SectionHeader>{g.title}</SectionHeader>}
            <div className={styles.tileGrid}>
              {g.tiles.map(({ entity, name }) => (
                <HaEntityTile
                  key={entity.id}
                  entity={entity}
                  name={name}
                  onToggle={ctrl.handleToggle}
                  onAction={ctrl.handleAction}
                  onOpenDetail={e => setDetailId(e.id)}
                />
              ))}
            </div>
          </section>
        ))
      )}
      {unsupported > 0 && groups.length > 0 && (
        <p className={styles.dashboardNote}>{t('homeAssistant.dashboard.skipped')}</p>
      )}
      <HaMoreInfoDialog
        entity={detailEntity}
        onClose={() => setDetailId(null)}
        onToggle={ctrl.handleToggle}
        onAction={ctrl.handleAction}
        onPreviewBrightness={ctrl.previewBrightness}
        onBrightness={ctrl.handleBrightness}
        onPreviewColor={ctrl.previewColor}
        onColor={ctrl.handleColor}
        onPreviewColorTemp={ctrl.previewColorTemp}
        onColorTemp={ctrl.handleColorTemp}
      />
    </div>
  );
}
