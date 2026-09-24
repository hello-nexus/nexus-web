import { useCallback, useEffect, useRef, useState } from 'react';
import { House, LayoutDashboard, Lightbulb, Sun, ToggleRight, Zap } from 'lucide-react';
import { Button } from '../../../components/common/Button/Button';
import { Card } from '../../../components/common/Card/Card';
import { CollapsibleSection } from '../../../components/common/CollapsibleSection/CollapsibleSection';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { Overlay } from '../../../components/common/Overlay/Overlay';
import { Slider } from '../../../components/common/Slider/Slider';
import { Toggle } from '../../../components/common/Toggle/Toggle';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { HsvPicker } from '../../../components/common/HsvPicker/HsvPicker';
import { useTranslation } from '../../../lib/i18n';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import {
  fetchHaEntities,
  getHaConfig,
  setHaConfig,
  setHaEntity,
  type HaConfig,
  type HaEntity,
} from '../../../api/homeAssistant';
import styles from './HomeAssistantPage.module.scss';

// Color-temperature slider span in Kelvin, warm to daylight.
const COLOR_TEMP_MIN = 2000;
const COLOR_TEMP_MAX = 6500;

function rgbToHex(rgb: [number, number, number]): string {
  return `#${rgb.map(c => c.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return [r, g, b];
}

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

export function useHomeAssistant(): HomeAssistantController {
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

  useTopicCallback('homeAssistant', true, () => { void refetch(); });

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
    previewBrightness,
    handleBrightness: (id, pct) => { void handleBrightness(id, pct); },
    previewColor,
    handleColor: (id, rgb) => { void handleColor(id, rgb); },
    previewColorTemp,
    handleColorTemp: (id, k) => { void handleColorTemp(id, k); },
    refetch: () => { void refetch(); },
  };
}

// When any entity has an area, group by area (ungrouped -> 'other').
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
  return map;
}

function HaTileCard({
  entity,
  onToggle,
  onOpenDetail,
}: {
  entity: HaEntity;
  onToggle: (id: string, on: boolean) => void;
  onOpenDetail: (entity: HaEntity) => void;
}) {
  const { t } = useTranslation();
  const Icon = entity.domain === 'light' ? Lightbulb : Zap;
  const badgeStyle = entity.on
    ? entity.rgb
      ? { background: `rgb(${entity.rgb.join(',')})` }
      : { background: 'var(--accent)' }
    : {};
  const stateLabel = !entity.reachable
    ? t('homeAssistant.unreachable')
    : entity.on && entity.supportsBrightness && entity.brightnessPct > 0
      ? `${entity.brightnessPct}%`
      : entity.on
        ? t('homeAssistant.on')
        : t('homeAssistant.off');

  // disableInteractiveRole: the tile's own toggle button is the focusable
  // control; role="button" here would nest a focusable descendant inside a
  // button role.
  return (
    <Card interactive compact disableInteractiveRole onClick={() => onOpenDetail(entity)}>
      <div className={styles.tileInner} data-unreachable={!entity.reachable ? 'true' : 'false'}>
        <button
          type="button"
          className={styles.tileBadge}
          style={badgeStyle}
          data-on={entity.on ? 'true' : 'false'}
          aria-label={entity.name}
          aria-pressed={entity.on}
          disabled={!entity.reachable}
          onClick={e => {
            e.stopPropagation();
            onToggle(entity.id, !entity.on);
          }}
        >
          <Icon size={20} />
        </button>
        <div className={styles.tileInfo}>
          <div className={styles.tileName}>{entity.name}</div>
          <div className={styles.tileState}>{stateLabel}</div>
        </div>
      </div>
    </Card>
  );
}

function HaMoreInfoDialog({
  entity,
  onClose,
  onToggle,
  onPreviewBrightness,
  onBrightness,
  onPreviewColor,
  onColor,
  onPreviewColorTemp,
  onColorTemp,
}: {
  entity: HaEntity | null;
  onClose: () => void;
  onToggle: (id: string, on: boolean) => void;
  onPreviewBrightness: (id: string, pct: number) => void;
  onBrightness: (id: string, pct: number) => void;
  onPreviewColor: (id: string, rgb: [number, number, number]) => void;
  onColor: (id: string, rgb: [number, number, number]) => void;
  onPreviewColorTemp: (id: string, k: number) => void;
  onColorTemp: (id: string, k: number) => void;
}) {
  const { t } = useTranslation();
  const open = entity !== null;
  if (!entity) return null;

  const hexColor = entity.rgb ? rgbToHex(entity.rgb) : '#ffffff';
  const hasControls = entity.supportsBrightness || entity.supportsColor || entity.supportsColorTemp;

  return (
    <Overlay open={open} onClose={onClose} variant="dialog" className={styles.moreInfoDialog} ariaLabel={entity.name}>
      <div className={styles.moreInfoHeader}>
        <h3 className={styles.moreInfoTitle}>{entity.name}</h3>
        <Toggle
          checked={entity.on}
          onChange={on => onToggle(entity.id, on)}
          ariaLabel={entity.name}
          disabled={!entity.reachable}
        />
      </div>
      {hasControls && (
        <div className={styles.moreInfoBody}>
          {entity.supportsBrightness && (
            <Slider
              // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
              orientation="stacked"
              editable
              trackFill
              label={t('homeAssistant.brightness')}
              value={entity.brightnessPct}
              min={0}
              max={100}
              step={1}
              formatValue={v => `${v}%`}
              onChange={(pct, commit) => { onPreviewBrightness(entity.id, pct); if (commit) onBrightness(entity.id, pct); }}
              onCommit={pct => onBrightness(entity.id, pct)}
              disabled={!entity.reachable || !entity.on}
            />
          )}
          {entity.supportsColorTemp && (
            <Slider
              // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
              orientation="stacked"
              editable
              trackFill
              label={t('homeAssistant.colorTemp')}
              value={entity.colorTempK}
              min={COLOR_TEMP_MIN}
              max={COLOR_TEMP_MAX}
              step={100}
              formatValue={v => `${v}K`}
              onChange={(k, commit) => { onPreviewColorTemp(entity.id, k); if (commit) onColorTemp(entity.id, k); }}
              onCommit={k => onColorTemp(entity.id, k)}
              disabled={!entity.reachable || !entity.on}
            />
          )}
          {entity.supportsColor && (
            <HsvPicker
              value={hexColor}
              onPreview={hex => onPreviewColor(entity.id, hexToRgb(hex))}
              onCommit={hex => onColor(entity.id, hexToRgb(hex))}
            />
          )}
        </div>
      )}
    </Overlay>
  );
}

function AreaSection({
  area,
  entities,
  onToggle,
  onOpenDetail,
}: {
  area: string;
  entities: HaEntity[];
  onToggle: (id: string, on: boolean) => void;
  onOpenDetail: (entity: HaEntity) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <CollapsibleSection
      title={area}
      open={open}
      onToggle={() => setOpen(o => !o)}
      right={<span className={styles.categoryCount}>{entities.length}</span>}
    >
      <div className={styles.tileGrid}>
        {entities.map(e => (
          <HaTileCard
            key={e.id}
            entity={e}
            onToggle={onToggle}
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
  // Track by entity ID so the dialog always sees live optimistic state.
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailEntity = detailId ? entities.find(e => e.id === detailId) ?? null : null;

  if (!connected) return null;

  const grouped = groupEntities(entities);

  return (
    <div className={immersive ? styles.bodyImmersive : styles.entityList}>
      {entities.length === 0 ? (
        <EmptyState icon={<House size={28} />} title={t('homeAssistant.noEntities')} compact />
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
              onToggle={ctrl.handleToggle}
              onOpenDetail={e => setDetailId(e.id)}
            />
          );
        })
      )}
      <HaMoreInfoDialog
        entity={detailEntity}
        onClose={() => setDetailId(null)}
        onToggle={ctrl.handleToggle}
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

export function HomeAssistantPage() {
  const { t } = useTranslation();
  const ctrl = useHomeAssistant();

  return (
    <div className={styles.page}>
      <ViewHeader title={t('homeAssistant.title')} />
      <div className={`${styles.body} pageBody`} data-panel-scrollable="true">
        {ctrl.showSetup ? (
          <HomeAssistantSetupForm ctrl={ctrl} />
        ) : (
          <HomeAssistantEntityList ctrl={ctrl} />
        )}
      </div>
    </div>
  );
}

export default HomeAssistantPage;
