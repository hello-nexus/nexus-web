import { useCallback, useEffect, useRef, useState } from 'react';
import { House } from 'lucide-react';
import { Button } from '../../../components/common/Button/Button';
import { CollapsibleSection } from '../../../components/common/CollapsibleSection/CollapsibleSection';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
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
  handleBrightness: (entityId: string, brightnessPct: number) => void;
  handleColor: (entityId: string, rgb: [number, number, number]) => void;
  refetch: () => void;
}

// Same technical URL across all locales; not translated.
const DEFAULT_HA_URL = 'http://localhost:8123';

export function useHomeAssistant(): HomeAssistantController {
  const { t } = useTranslation();
  const [config, setConfig] = useState<HaConfig | null>(null);
  const [entities, setEntities] = useState<HaEntity[]>([]);
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
      const [cfg, ents] = await Promise.all([getHaConfig(), fetchHaEntities()]);
      if (cancelled) return;
      if (cfg) {
        setConfig(cfg);
        if (cfg.url) setUrl(cfg.url);
      }
      if (ents?.entities) setEntities(ents.entities);
      setLoading(false);
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
    let snapshot: HaEntity[] = [];
    setEntities(prev => { snapshot = prev; return prev.map(e => e.id === entityId ? { ...e, on, state: on ? 'on' : 'off' } : e); });
    const res = await setHaEntity({ entityId, on });
    if (res) {
      setEntities(prev => prev.map(e => e.id === entityId ? res : e));
    } else {
      setEntities(snapshot);
      void refetch();
    }
  }, [refetch]);

  const handleBrightness = useCallback(async (entityId: string, brightnessPct: number) => {
    let snapshot: HaEntity[] = [];
    setEntities(prev => { snapshot = prev; return prev.map(e => e.id === entityId ? { ...e, brightnessPct } : e); });
    const res = await setHaEntity({ entityId, brightnessPct });
    if (res) {
      setEntities(prev => prev.map(e => e.id === entityId ? res : e));
    } else {
      setEntities(snapshot);
      void refetch();
    }
  }, [refetch]);

  const handleColor = useCallback(async (entityId: string, rgb: [number, number, number]) => {
    let snapshot: HaEntity[] = [];
    setEntities(prev => { snapshot = prev; return prev.map(e => e.id === entityId ? { ...e, rgb } : e); });
    const res = await setHaEntity({ entityId, rgb });
    if (res) {
      setEntities(prev => prev.map(e => e.id === entityId ? res : e));
    } else {
      setEntities(snapshot);
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
    handleBrightness: (id, pct) => { void handleBrightness(id, pct); },
    handleColor: (id, rgb) => { void handleColor(id, rgb); },
    refetch: () => { void refetch(); },
  };
}

function groupEntities(entities: HaEntity[]): Map<string, HaEntity[]> {
  const map = new Map<string, HaEntity[]>();
  for (const e of entities) {
    const key = e.area || e.domain;
    const arr = map.get(key);
    if (arr) arr.push(e);
    else map.set(key, [e]);
  }
  return map;
}

function EntityRow({
  entity,
  onToggle,
  onBrightness,
  onColor,
}: {
  entity: HaEntity;
  onToggle: (id: string, on: boolean) => void;
  onBrightness: (id: string, pct: number) => void;
  onColor: (id: string, rgb: [number, number, number]) => void;
}) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const swatchRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
        swatchRef.current && !swatchRef.current.contains(e.target as Node)
      ) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  const hexColor = entity.rgb ? rgbToHex(entity.rgb) : '#ffffff';
  const unreachable = !entity.reachable;

  return (
    <div className={styles.entityRow} data-unreachable={unreachable ? 'true' : 'false'}>
      <div className={styles.entityInfo}>
        <div className={styles.entityName}>{entity.name}</div>
        {unreachable && (
          <div className={styles.entityMeta}>{t('homeAssistant.unreachable')}</div>
        )}
      </div>
      <div className={styles.entityControls}>
        <Toggle
          checked={entity.on}
          onChange={on => onToggle(entity.id, on)}
          ariaLabel={entity.name}
          disabled={unreachable}
        />
        {entity.supportsBrightness && (
          <div className={styles.sliderWrap}>
            <Slider
              label={t('homeAssistant.brightness')}
              value={entity.brightnessPct}
              min={0}
              max={100}
              step={1}
              formatValue={v => `${v}%`}
              onChange={pct => onBrightness(entity.id, pct)}
              onCommit={pct => onBrightness(entity.id, pct)}
              disabled={unreachable || !entity.on}
            />
          </div>
        )}
        {entity.supportsColor && (
          <div className={styles.colorWrap}>
            <button
              ref={swatchRef}
              type="button"
              className={styles.colorSwatch}
              style={{ background: hexColor }}
              aria-label={t('homeAssistant.color')}
              aria-expanded={pickerOpen}
              disabled={unreachable || !entity.on}
              onClick={() => setPickerOpen(v => !v)}
            />
            {pickerOpen && (
              <div
                ref={pickerRef}
                className={styles.colorPickerPopup}
              >
                <HsvPicker
                  value={hexColor}
                  onPreview={hex => onColor(entity.id, hexToRgb(hex))}
                  onCommit={hex => {
                    onColor(entity.id, hexToRgb(hex));
                    setPickerOpen(false);
                  }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AreaSection({
  area,
  entities,
  onToggle,
  onBrightness,
  onColor,
}: {
  area: string;
  entities: HaEntity[];
  onToggle: (id: string, on: boolean) => void;
  onBrightness: (id: string, pct: number) => void;
  onColor: (id: string, rgb: [number, number, number]) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <CollapsibleSection
      title={area}
      open={open}
      onToggle={() => setOpen(o => !o)}
      right={<span className={styles.categoryCount}>{entities.length}</span>}
    >
      <div className={styles.entityGrid}>
        {entities.map(e => (
          <EntityRow
            key={e.id}
            entity={e}
            onToggle={onToggle}
            onBrightness={onBrightness}
            onColor={onColor}
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
  const { url, token, connecting, connectError } = ctrl;
  return (
    <div className={immersive ? styles.bodyImmersive : undefined}>
      <div className={styles.setupCard}>
        <p className={styles.setupPrompt}>{t('homeAssistant.setupPrompt')}</p>
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

  if (!connected) return null;

  const grouped = groupEntities(entities);

  return (
    <div className={immersive ? styles.bodyImmersive : styles.entityList}>
      {entities.length === 0 ? (
        <EmptyState icon={<House size={28} />} title={t('homeAssistant.noEntities')} compact />
      ) : (
        Array.from(grouped.entries()).map(([key, list]) => {
          // Domain keys are translated; area names are server-provided data.
          const areaLabel = key === 'light'
            ? t('homeAssistant.lights')
            : key === 'switch'
              ? t('homeAssistant.switches')
              : key;
          return (
            <AreaSection
              key={key}
              area={areaLabel}
              entities={list}
              onToggle={ctrl.handleToggle}
              onBrightness={ctrl.handleBrightness}
              onColor={ctrl.handleColor}
            />
          );
        })
      )}
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
