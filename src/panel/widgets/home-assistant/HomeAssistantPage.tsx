import { useCallback, useEffect, useRef, useState } from 'react';
import { House, LayoutDashboard, Sun, ToggleRight } from 'lucide-react';
import { Button } from '../../../components/common/Button/Button';
import { CollapsibleSection } from '../../../components/common/CollapsibleSection/CollapsibleSection';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { SearchInput } from '../../../components/common/SearchInput/SearchInput';
import { Select } from '../../../components/common/Select/Select';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { useTranslation } from '../../../lib/i18n';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { usePersistentIdSet } from '../../../hooks/usePersistentState';
import {
  fetchHaEntities,
  getHaConfig,
  setHaConfig,
  setHaEntity,
  type HaConfig,
  type HaEntity,
  type HaEntityAction,
} from '../../../api/homeAssistant';
import { isRoomEntity } from './haDomains';
import { HaEntityTile, HaMoreInfoDialog } from './HaEntityTile';
import {
  dashboardTitle,
  HaDashboardMessage,
  HaDashboardViewBody,
  useHaDashboard,
  useHaDashboards,
  viewTitle,
} from './HomeAssistantDashboard';
import { pickView } from './lovelaceLayout';
import styles from './HomeAssistantPage.module.scss';

export interface HomeAssistantController {
  config: HaConfig | null;
  entities: HaEntity[];
  connected: boolean;
  configured: boolean;
  error: string | null;
  loading: boolean;
  showSetup: boolean;
  url: string;
  token: string;
  connecting: boolean;
  connectError: string | null;
  setUrl: (v: string) => void;
  setToken: (v: string) => void;
  handleConnect: () => void;
  handleToggle: (entityId: string, on: boolean) => void;
  handleAction: (entityId: string, action: HaEntityAction) => void;
  previewBrightness: (entityId: string, brightnessPct: number) => void;
  handleBrightness: (entityId: string, brightnessPct: number) => void;
  previewColor: (entityId: string, rgb: [number, number, number]) => void;
  handleColor: (entityId: string, rgb: [number, number, number]) => void;
  previewColorTemp: (entityId: string, colorTempK: number) => void;
  handleColorTemp: (entityId: string, colorTempK: number) => void;
  refetch: () => void;
}

// Same technical URL across all locales; not translated.
const DEFAULT_HA_URL = 'http://localhost:8123';

// showingDashboard: also refetch when only dashboard-watched entities changed;
// the room view skips those frames.
export function useHomeAssistant(showingDashboard = false): HomeAssistantController {
  const { t } = useTranslation();
  const [config, setConfig] = useState<HaConfig | null>(null);
  const [entities, setEntities] = useState<HaEntity[]>([]);
  // Latest entities for optimistic-rollback snapshots without an impure updater.
  const entitiesRef = useRef<HaEntity[]>([]);
  entitiesRef.current = entities;
  // Pre-edit entity captured at a drag's first preview tick, so a failed commit
  // rolls back to the value before the drag, not the previewed one.
  const editBaselineRef = useRef<Map<string, HaEntity>>(new Map());
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState(DEFAULT_HA_URL);
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const res = await fetchHaEntities();
    if (!res) return;
    if (res.entities) setEntities(res.entities);
    // Sync connectivity so showSetup flips correctly if HA goes offline.
    setConfig(prev => prev ? { ...prev, connected: res.connected, configured: res.configured } : null);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [cfg, ents] = await Promise.all([getHaConfig(), fetchHaEntities()]);
        if (cancelled) return;
        if (cfg) {
          setConfig(cfg);
          if (cfg.url) setUrl(cfg.url);
        }
        if (ents?.entities) setEntities(ents.entities);
      } catch {
        // Service unreachable: degrade to the setup form, never a blank page.
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  useTopicCallback('homeAssistant', true, (data: unknown) => {
    // A frame without the flag is from a service that predates it: always refetch.
    const roomsChanged = (data as { roomsChanged?: unknown } | null)?.roomsChanged;
    if (roomsChanged !== false || showingDashboard) void refetch();
  });

  const handleConnect = useCallback(async () => {
    setConnecting(true);
    setConnectError(null);
    const res = await setHaConfig({ url: url.trim(), token: token.trim() });
    setConnecting(false);
    if (!res) {
      setConnectError(t('homeAssistant.requestFailed'));
      return;
    }
    if (res.ok) {
      const cfg = await getHaConfig();
      if (cfg) setConfig(cfg);
      void refetch();
    } else {
      setConnectError(res.error ?? t('homeAssistant.connectionFailed'));
    }
  }, [url, token, refetch, t]);

  const handleToggle = useCallback(async (entityId: string, on: boolean) => {
    const snapshot = entitiesRef.current;
    setEntities(prev => prev.map(e => e.id === entityId ? { ...e, on, state: on ? 'on' : 'off' } : e));
    const res = await setHaEntity({ entityId, on });
    if (res) {
      setEntities(prev => prev.map(e => e.id === entityId ? res : e));
    } else {
      setEntities(snapshot);
      void refetch();
    }
  }, [refetch]);

  const handleAction = useCallback(async (entityId: string, action: HaEntityAction) => {
    const res = await setHaEntity({ entityId, action });
    if (res) setEntities(prev => prev.map(e => e.id === entityId ? res : e));
    else void refetch();
  }, [refetch]);

  const captureBaseline = useCallback((entityId: string) => {
    if (editBaselineRef.current.has(entityId)) return;
    const cur = entitiesRef.current.find(e => e.id === entityId);
    if (cur) editBaselineRef.current.set(entityId, cur);
  }, []);

  // Live drag feedback: optimistic local update only, no network write.
  const previewBrightness = useCallback((entityId: string, brightnessPct: number) => {
    captureBaseline(entityId);
    setEntities(prev => prev.map(e => e.id === entityId ? { ...e, brightnessPct } : e));
  }, [captureBaseline]);

  const handleBrightness = useCallback(async (entityId: string, brightnessPct: number) => {
    const baseline = editBaselineRef.current.get(entityId) ?? entitiesRef.current.find(e => e.id === entityId);
    editBaselineRef.current.delete(entityId);
    setEntities(prev => prev.map(e => e.id === entityId ? { ...e, brightnessPct } : e));
    const res = await setHaEntity({ entityId, brightnessPct });
    if (res) {
      setEntities(prev => prev.map(e => e.id === entityId ? res : e));
    } else {
      if (baseline) setEntities(prev => prev.map(e => e.id === entityId ? baseline : e));
      void refetch();
    }
  }, [refetch]);

  const previewColor = useCallback((entityId: string, rgb: [number, number, number]) => {
    captureBaseline(entityId);
    setEntities(prev => prev.map(e => e.id === entityId ? { ...e, rgb } : e));
  }, [captureBaseline]);

  const handleColor = useCallback(async (entityId: string, rgb: [number, number, number]) => {
    const baseline = editBaselineRef.current.get(entityId) ?? entitiesRef.current.find(e => e.id === entityId);
    editBaselineRef.current.delete(entityId);
    setEntities(prev => prev.map(e => e.id === entityId ? { ...e, rgb } : e));
    const res = await setHaEntity({ entityId, rgb });
    if (res) {
      setEntities(prev => prev.map(e => e.id === entityId ? res : e));
    } else {
      if (baseline) setEntities(prev => prev.map(e => e.id === entityId ? baseline : e));
      void refetch();
    }
  }, [refetch]);

  const previewColorTemp = useCallback((entityId: string, colorTempK: number) => {
    captureBaseline(entityId);
    setEntities(prev => prev.map(e => e.id === entityId ? { ...e, colorTempK } : e));
  }, [captureBaseline]);

  const handleColorTemp = useCallback(async (entityId: string, colorTempK: number) => {
    const baseline = editBaselineRef.current.get(entityId) ?? entitiesRef.current.find(e => e.id === entityId);
    editBaselineRef.current.delete(entityId);
    setEntities(prev => prev.map(e => e.id === entityId ? { ...e, colorTempK } : e));
    const res = await setHaEntity({ entityId, colorTempK });
    if (res) {
      setEntities(prev => prev.map(e => e.id === entityId ? res : e));
    } else {
      if (baseline) setEntities(prev => prev.map(e => e.id === entityId ? baseline : e));
      void refetch();
    }
  }, [refetch]);

  const connected = config?.connected ?? false;
  const configured = config?.configured ?? false;
  const error = config?.error ?? null;

  return {
    config,
    entities,
    connected,
    configured,
    error,
    loading,
    showSetup: !loading && (!configured || (config !== null && !connected)),
    url,
    token,
    connecting,
    connectError,
    setUrl,
    setToken,
    handleConnect: () => { void handleConnect(); },
    handleToggle: (id, on) => { void handleToggle(id, on); },
    handleAction: (id, action) => { void handleAction(id, action); },
    previewBrightness,
    handleBrightness: (id, pct) => { void handleBrightness(id, pct); },
    previewColor,
    handleColor: (id, rgb) => { void handleColor(id, rgb); },
    previewColorTemp,
    handleColorTemp: (id, k) => { void handleColorTemp(id, k); },
    refetch: () => { void refetch(); },
  };
}

// When any entity has an area, group by area (ungrouped -> 'other', listed last).
// When no entity has an area, group by domain ('light' / 'switch').
function groupEntities(entities: HaEntity[]): Map<string, HaEntity[]> {
  const hasAreas = entities.some(e => e.area);
  const map = new Map<string, HaEntity[]>();
  for (const e of entities) {
    const key = hasAreas ? (e.area || 'other') : e.domain;
    const arr = map.get(key);
    if (arr) arr.push(e);
    else map.set(key, [e]);
  }
  const other = map.get('other');
  if (other) {
    map.delete('other');
    map.set('other', other);
  }
  return map;
}

function AreaSection({
  area,
  entities,
  open,
  onToggleOpen,
  ctrl,
  onOpenDetail,
}: {
  area: string;
  entities: HaEntity[];
  open: boolean;
  onToggleOpen: () => void;
  ctrl: HomeAssistantController;
  onOpenDetail: (entity: HaEntity) => void;
}) {
  return (
    <CollapsibleSection
      title={area}
      open={open}
      onToggle={onToggleOpen}
      right={<span className={styles.categoryCount}>{entities.length}</span>}
    >
      <div className={styles.tileGrid}>
        {entities.map(e => (
          <HaEntityTile
            key={e.id}
            entity={e}
            onToggle={ctrl.handleToggle}
            onAction={ctrl.handleAction}
            onOpenDetail={onOpenDetail}
          />
        ))}
      </div>
    </CollapsibleSection>
  );
}

export function HomeAssistantSetupForm({
  ctrl,
  immersive,
}: {
  ctrl: HomeAssistantController;
  immersive?: boolean;
}) {
  const { t } = useTranslation();
  const { url, token, connecting, connectError, configured } = ctrl;
  // The intro is for first-time setup; a configured instance that went offline
  // keeps the one-line prompt.
  const showIntro = !immersive && !configured;
  const parsedUrl = (() => { try { return new URL(url.trim()); } catch { return null; } })();
  const tokenPageUrl = parsedUrl && (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:')
    ? `${parsedUrl.origin}/profile/security`
    : null;
  return (
    <div className={immersive ? styles.bodyImmersive : styles.setupIntro}>
      {showIntro && (
        <EmptyState
          hero
          icon={<House />}
          title={t('homeAssistant.intro.title')}
          hint={t('homeAssistant.intro.body')}
          points={[
            { icon: <ToggleRight />, text: t('homeAssistant.intro.pointToggle') },
            { icon: <Sun />, text: t('homeAssistant.intro.pointColor') },
            { icon: <LayoutDashboard />, text: t('homeAssistant.intro.pointWidget') },
            { icon: <LayoutDashboard />, text: t('homeAssistant.intro.pointDashboards') },
          ]}
        />
      )}
      <div className={styles.setupCard}>
        {!showIntro && <p className={styles.setupPrompt}>{t('homeAssistant.setupPrompt')}</p>}
        <ol className={styles.guideList}>
          <li>{t('homeAssistant.guideStep1')}</li>
          <li>{t('homeAssistant.guideStep2')}</li>
          <li>{t('homeAssistant.guideStep3')}</li>
        </ol>
        {tokenPageUrl && (
          <a className={styles.guideLink} href={tokenPageUrl} target="_blank" rel="noreferrer">
            {t('homeAssistant.guideLink')}
          </a>
        )}
        <div className={styles.formRow}>
          <label className={styles.formLabel} htmlFor="ha-url">{t('homeAssistant.urlLabel')}</label>
          <input
            id="ha-url"
            type="text"
            className={styles.formInput}
            value={url}
            onChange={e => ctrl.setUrl(e.target.value)}
            placeholder={DEFAULT_HA_URL}
            autoComplete="url"
          />
        </div>
        <div className={styles.formRow}>
          <label className={styles.formLabel} htmlFor="ha-token">{t('homeAssistant.tokenLabel')}</label>
          <input
            id="ha-token"
            type="password"
            className={styles.formInput}
            value={token}
            onChange={e => ctrl.setToken(e.target.value)}
            autoComplete="new-password"
          />
        </div>
        <div className={styles.connectRow}>
          <Button
            size="sm"
            tone="accent"
            loading={connecting}
            disabled={!url.trim() || !token.trim()}
            onClick={ctrl.handleConnect}
          >
            {t('homeAssistant.connect')}
          </Button>
          {connectError && <span className={styles.error}>{connectError}</span>}
        </div>
      </div>
    </div>
  );
}

export function HomeAssistantEntityList({
  ctrl,
  immersive,
}: {
  ctrl: HomeAssistantController;
  immersive?: boolean;
}) {
  const { t } = useTranslation();
  const { entities, connected } = ctrl;
  const [query, setQuery] = useState('');
  const [showUnavailable, setShowUnavailable] = useState(false);
  const [collapsed, setCollapsed] = usePersistentIdSet('nexus.homeAssistant.collapsedRooms');
  // Track by entity ID so the dialog always sees live optimistic state.
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailEntity = detailId ? entities.find(e => e.id === detailId) ?? null : null;

  if (!connected) return null;

  const roomEntities = entities.filter(isRoomEntity);
  const q = query.trim().toLowerCase();
  const matching = q
    ? roomEntities.filter(e => e.name.toLowerCase().includes(q) || e.id.includes(q))
    : roomEntities;
  const unavailableCount = matching.filter(e => !e.reachable).length;
  const visible = showUnavailable ? matching : matching.filter(e => e.reachable);
  const grouped = groupEntities(visible);
  const toggleRoom = (key: string) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <div className={immersive ? styles.bodyImmersive : styles.entityList}>
      {!immersive && roomEntities.length > 0 && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t('homeAssistant.search')}
          ariaLabel={t('homeAssistant.search')}
          className={styles.search}
        />
      )}
      {roomEntities.length === 0 ? (
        <EmptyState icon={<House size={28} />} title={t('homeAssistant.noEntities')} compact />
      ) : visible.length === 0 && q ? (
        <EmptyState icon={<House size={28} />} title={t('homeAssistant.noMatches')} compact />
      ) : (
        Array.from(grouped.entries()).map(([key, list]) => {
          // Domain keys are translated; 'other' is translated; area names are server data.
          const areaLabel = key === 'light'
            ? t('homeAssistant.lights')
            : key === 'switch'
              ? t('homeAssistant.switches')
              : key === 'other'
                ? t('homeAssistant.other')
                : key;
          return (
            <AreaSection
              key={key}
              area={areaLabel}
              entities={list}
              // A search shows every match, collapsed rooms included.
              open={q !== '' || !collapsed.has(key)}
              onToggleOpen={() => { if (!q) toggleRoom(key); }}
              ctrl={ctrl}
              onOpenDetail={e => setDetailId(e.id)}
            />
          );
        })
      )}
      {unavailableCount > 0 && (
        <Button
          size="sm"
          tone="ghost"
          className={styles.unavailableToggle}
          onClick={() => setShowUnavailable(v => !v)}
        >
          {showUnavailable
            ? t('homeAssistant.hideUnavailable')
            : t('homeAssistant.showUnavailable', { count: unavailableCount })}
        </Button>
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

// `tab` is the routed subtab: '' for the room view, else a dashboard id.
export function HomeAssistantPage({ tab, onTabChange }: { tab?: string | null; onTabChange?: (tab: string) => void }) {
  const { t } = useTranslation();
  const [localSource, setLocalSource] = useState('');
  const source = tab ?? localSource;
  const ctrl = useHomeAssistant(source !== '');
  const live = !ctrl.showSetup && ctrl.connected;
  const dashboards = useHaDashboards(live);
  const dashboard = useHaDashboard(source, live && source !== '', ctrl.refetch);
  const [viewKey, setViewKey] = useState('');
  const view = source && dashboard.status === 'ready' ? pickView(dashboard.views, viewKey) : null;

  const sourceOptions = [
    { value: '', label: t('homeAssistant.source.rooms') },
    ...(dashboards ?? []).map(d => ({ value: d.id, label: dashboardTitle(d, t) })),
  ];
  // A routed id whose dashboard is gone still has to render as a valid option.
  if (source && !sourceOptions.some(o => o.value === source)) sourceOptions.push({ value: source, label: source });

  const viewTabs = view && dashboard.views.length > 1
    ? dashboard.views.map((v, i) => ({ key: v.key, label: viewTitle(v, i, t) }))
    : undefined;

  const selectSource = (next: string) => {
    setViewKey('');
    if (onTabChange) onTabChange(next);
    else setLocalSource(next);
  };

  return (
    <div className={styles.page}>
      <ViewHeader
        title={t('homeAssistant.title')}
        tabs={viewTabs}
        activeTab={view?.key}
        onTabChange={setViewKey}
        tabActions={live ? (
          <Select
            value={source}
            options={sourceOptions}
            onChange={selectSource}
            ariaLabel={t('homeAssistant.source')}
          />
        ) : undefined}
      />
      <div className={`${styles.body} pageBody`} data-panel-scrollable="true">
        {ctrl.showSetup ? (
          <HomeAssistantSetupForm ctrl={ctrl} />
        ) : !source ? (
          <HomeAssistantEntityList ctrl={ctrl} />
        ) : view ? (
          <HaDashboardViewBody ctrl={ctrl} view={view} />
        ) : (
          <HaDashboardMessage status={dashboard.status} empty />
        )}
      </div>
    </div>
  );
}

export default HomeAssistantPage;
