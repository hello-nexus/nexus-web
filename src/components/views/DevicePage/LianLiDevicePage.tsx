import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { Lightbulb, Wind } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { Placeholder } from '../Placeholder';
import { Select } from '../../common/Select/Select';
import { Slider } from '../../common/Slider/Slider';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import {
  getLianLiState,
  getLianLiLighting,
  getLianLiCooling,
  setLianLiFanCount,
  setLianLiLighting,
  setLianLiPortCooling,
  type LianLiState,
  type LianLiLighting,
  type LianLiCooling,
  type LianLiLightingPatch,
} from '../../../api/lianli';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiDevicePage.module.scss';

const PORT_COUNT = 4;
const FAN_COUNT_OPTIONS = [0, 1, 2, 3, 4] as const;
const FW_LEVEL_MAX = 4;
const DEFAULT_COLOR = '#ffffff';
const DEFAULT_COLOR_SECONDARY = '#000000';
// Polling interval matches the service RpmPollMs.
const RPM_POLL_MS = 2000;

type Tab = 'lighting' | 'cooling';

const TABS: readonly { key: Tab; labelKey: string }[] = [
  { key: 'lighting', labelKey: 'devices.lianli.tabLighting' },
  { key: 'cooling', labelKey: 'devices.lianli.tabCooling' },
];

interface LianLiDevicePageProps {
  onSectionNavigate?: (section: string) => void;
}

export function LianLiDevicePage({ onSectionNavigate }: LianLiDevicePageProps) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('lighting');
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [lianliState, setLianliState] = useState<LianLiState | null>(null);
  const [lighting, setLighting] = useState<LianLiLighting | null>(null);
  const [cooling, setCooling] = useState<LianLiCooling | null>(null);
  const [saving, setSaving] = useState(false);
  const aliveRef = useRef(true);
  const connectedRef = useRef(false);

  const refresh = useCallback(async () => {
    const s = await getLianLiState();
    if (!aliveRef.current) return;
    if (s === null) return;
    if (!s.isConnected) {
      connectedRef.current = false;
      setConnection('disconnected');
      setLianliState(null);
      setLighting(null);
      setCooling(null);
      return;
    }
    connectedRef.current = true;
    setConnection('connected');
    setLianliState(s);
    const [lt, cl] = await Promise.all([
      getLianLiLighting().catch(() => null),
      getLianLiCooling().catch(() => null),
    ]);
    if (!aliveRef.current) return;
    if (lt) setLighting(lt);
    if (cl) setCooling(cl);
  }, []);

  // Steady-state telemetry tick: refresh only the read-only RPM so a poll
  // never overwrites an in-progress lighting/cooling/fan-count edit. While
  // disconnected, defer to the full refresh so a reconnect repopulates
  // lighting and cooling.
  const refreshRpm = useCallback(async () => {
    if (!connectedRef.current) { void refresh(); return; }
    const s = await getLianLiState();
    if (!aliveRef.current || s === null) return;
    if (!s.isConnected) {
      connectedRef.current = false;
      setConnection('disconnected');
      setLianliState(null);
      setLighting(null);
      setCooling(null);
      return;
    }
    setLianliState(prev => (prev ? { ...prev, rpm: s.rpm } : s));
  }, [refresh]);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    const id = window.setInterval(() => { void refreshRpm(); }, RPM_POLL_MS);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
      window.clearInterval(id);
    };
  }, [refresh, refreshRpm]);

  const commitFanCount = useCallback(async (port: number, count: number) => {
    setLianliState(prev => {
      if (!prev) return prev;
      const next = { ...prev, fansPerPort: [...prev.fansPerPort] };
      next.fansPerPort[port] = count;
      return next;
    });
    setSaving(true);
    try {
      await setLianLiFanCount(port, count);
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, []);

  const commitLighting = useCallback(async (patch: LianLiLightingPatch) => {
    setSaving(true);
    try {
      await setLianLiLighting(patch);
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, []);

  const commitPortCooling = useCallback(async (
    port: number,
    mode: 'Manual' | 'Auto',
    dutyPercent?: number,
  ) => {
    setSaving(true);
    try {
      await setLianLiPortCooling(port, mode, dutyPercent);
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, []);

  if (connection === 'disconnected') {
    return (
      <div className={styles.page}>
        {/* eslint-disable-next-line i18next/no-literal-string -- brand + model name */}
        <ViewHeader title="Lian Li Uni Hub SL-Infinity" />
        <div className={`${styles.pageBody} pageBody`}>
          <Placeholder title={t('devices.lianli.notConnected')} />
        </div>
      </div>
    );
  }

  const stateLoaded = lianliState !== null;
  const lightingLoaded = lighting !== null;
  const coolingLoaded = cooling !== null;

  const selectedMode = lighting
    ? (lighting.modes.find(m => m.key === lighting.mode) ?? null)
    : null;
  const isCustomMode = lighting?.mode === 'custom';

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="Lian Li Uni Hub SL-Infinity"
        tabs={TABS.map(tb => ({ key: tb.key, label: t(tb.labelKey) }))}
        activeTab={tab}
        onTabChange={(k) => setTab(k as Tab)}
        actions={saving ? <span className={styles.savingBadge}>{t('devices.saving')}</span> : null}
      />
      <div className={`${styles.pageBody} pageBody`}>
        {tab === 'lighting' && (
          <SettingsSection
            title={t('devices.lianli.lightingSection')}
            boxClassName={styles.sectionBox}
          >
            <div className={`${styles.row} ${!lightingLoaded ? styles.rowDisabled : ''}`}>
              <span className={styles.rowLabel}>{t('devices.lianli.lightingMode')}</span>
              <Select
                value={lighting?.mode ?? ''}
                onChange={v => {
                  if (!lighting) return;
                  setLighting({ ...lighting, mode: v });
                  void commitLighting({ mode: v });
                }}
                options={(lighting?.modes ?? []).map(m => ({ value: m.key, label: m.label }))}
                disabled={!lightingLoaded}
                ariaLabel={t('devices.lianli.lightingModeAria')}
              />
            </div>

            {isCustomMode ? (
              <>
                <p className={styles.customNote}>{t('devices.lianli.customModeNote')}</p>
                {onSectionNavigate && (
                  <Button
                    className={styles.lightingLink}
                    size="sm"
                    tone="neutral"
                    icon={<Lightbulb size={14} />}
                    onClick={() => onSectionNavigate('lighting')}
                  >
                    {t('smartLights.colorOnLightingPage')}
                  </Button>
                )}
              </>
            ) : (
              <>
                {/* Brightness is always present in firmware modes and shown first. */}
                <div className={`${styles.row} ${!lightingLoaded ? styles.rowDisabled : ''}`}>
                  <span className={styles.rowLabel}>{t('devices.lianli.lightingBrightness')}</span>
                  <Slider
                    className={styles.slider}
                    value={lighting?.brightness ?? 0}
                    min={0}
                    max={FW_LEVEL_MAX}
                    step={1}
                    ariaLabel={t('devices.lianli.lightingBrightnessAria')}
                    onChange={(v: number) => {
                      if (!lighting) return;
                      setLighting({ ...lighting, brightness: Math.round(v) });
                    }}
                    onCommit={(v: number) => {
                      void commitLighting({ brightness: Math.round(v) });
                    }}
                  />
                  <span className={styles.rowValue}>
                    {`${Math.round(((lighting?.brightness ?? 0) / FW_LEVEL_MAX) * 100)}%`}
                  </span>
                </div>

                {selectedMode?.hasSpeed && (
                  <div className={`${styles.row} ${!lightingLoaded ? styles.rowDisabled : ''}`}>
                    <span className={styles.rowLabel}>{t('devices.lianli.lightingSpeed')}</span>
                    <Slider
                      className={styles.slider}
                      value={lighting?.speed ?? 0}
                      min={0}
                      max={FW_LEVEL_MAX}
                      step={1}
                      ariaLabel={t('devices.lianli.lightingSpeedAria')}
                      onChange={(v: number) => {
                        if (!lighting) return;
                        setLighting({ ...lighting, speed: Math.round(v) });
                      }}
                      onCommit={(v: number) => {
                        void commitLighting({ speed: Math.round(v) });
                      }}
                    />
                    <span className={styles.rowValue}>
                      {lighting?.speed === 0
                        ? t('devices.lianli.speedSlowest')
                        : lighting?.speed === FW_LEVEL_MAX
                          ? t('devices.lianli.speedFastest')
                          : String(lighting?.speed ?? 0)}
                    </span>
                  </div>
                )}

                {selectedMode?.hasDirection && (
                  <div className={`${styles.row} ${!lightingLoaded ? styles.rowDisabled : ''}`}>
                    <span className={styles.rowLabel}>{t('devices.lianli.lightingDirection')}</span>
                    <Select
                      value={String(lighting?.direction ?? 0)}
                      onChange={v => {
                        if (!lighting) return;
                        const d = Number(v);
                        setLighting({ ...lighting, direction: d });
                        void commitLighting({ direction: d });
                      }}
                      options={[
                        { value: '0', label: t('devices.lianli.directionLtr') },
                        { value: '1', label: t('devices.lianli.directionRtl') },
                      ]}
                      disabled={!lightingLoaded}
                      ariaLabel={t('devices.lianli.lightingDirectionAria')}
                    />
                  </div>
                )}

                {selectedMode && selectedMode.colorsMax > 0 && lightingLoaded && (
                  <div className={styles.colorBlock}>
                    {selectedMode.colorsMax === 2 ? (
                      <div className={styles.colorPairRow}>
                        {([0, 1] as const).map(i => {
                          const color = lighting?.colors[i] ?? DEFAULT_COLOR_SECONDARY;
                          return (
                            <HsvPicker
                              key={i}
                              value={color}
                              onPreview={(hex: string) => {
                                if (!lighting) return;
                                const next = [...lighting.colors];
                                while (next.length < 2) next.push(DEFAULT_COLOR_SECONDARY);
                                next[i] = hex;
                                setLighting({ ...lighting, colors: next });
                              }}
                              onCommit={(hex: string) => {
                                if (!lighting) return;
                                const next = [...lighting.colors];
                                while (next.length < 2) next.push(DEFAULT_COLOR_SECONDARY);
                                next[i] = hex;
                                setLighting({ ...lighting, colors: next });
                                void commitLighting({ colors: next });
                              }}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <>
                        {(lighting?.colors ?? []).map((color, i) => (
                          <div key={i} className={styles.colorEntry}>
                            <HsvPicker
                              value={color}
                              onPreview={(hex: string) => {
                                if (!lighting) return;
                                const next = [...lighting.colors];
                                next[i] = hex;
                                setLighting({ ...lighting, colors: next });
                              }}
                              onCommit={(hex: string) => {
                                if (!lighting) return;
                                const next = [...lighting.colors];
                                next[i] = hex;
                                setLighting({ ...lighting, colors: next });
                                void commitLighting({ colors: next });
                              }}
                            />
                            <div className={styles.colorActions}>
                              {(lighting?.colors.length ?? 0) > selectedMode.colorsMin && (
                                <Button
                                  size="sm"
                                  tone="neutral"
                                  onClick={() => {
                                    if (!lighting) return;
                                    const next = lighting.colors.filter((_, idx) => idx !== i);
                                    setLighting({ ...lighting, colors: next });
                                    void commitLighting({ colors: next });
                                  }}
                                >
                                  {t('devices.lianli.removeColor')}
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                        {(lighting?.colors.length ?? 0) < selectedMode.colorsMax && (
                          <div className={styles.colorActions}>
                            <Button
                              size="sm"
                              tone="neutral"
                              onClick={() => {
                                if (!lighting) return;
                                const next = [...lighting.colors, DEFAULT_COLOR];
                                setLighting({ ...lighting, colors: next });
                                void commitLighting({ colors: next });
                              }}
                            >
                              {t('devices.lianli.addColor')}
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </>
            )}
          </SettingsSection>
        )}

        {tab === 'cooling' && (
          <>
            <SettingsSection
              title={t('devices.lianli.coolingSection')}
              boxClassName={styles.sectionBox}
            >
              {Array.from({ length: PORT_COUNT }, (_, port) => {
                const portData = cooling?.ports.find(p => p.port === port) ?? null;
                return (
                  <Fragment key={port}>
                    <div className={`${styles.row} ${!stateLoaded ? styles.rowDisabled : ''}`}>
                      <span className={styles.rowLabel}>{t('devices.lianli.port', { n: port + 1 })}</span>
                      <span className={styles.rowValue}>
                        {stateLoaded ? `${lianliState.rpm[port] ?? 0} RPM` : ''}
                      </span>
                    </div>
                    <div className={`${styles.row} ${!coolingLoaded ? styles.rowDisabled : ''}`}>
                      <span className={styles.rowLabel}>{t('devices.lianli.dutyLabel')}</span>
                      <Slider
                        className={styles.slider}
                        value={portData?.dutyPercent ?? 0}
                        min={0}
                        max={100}
                        step={1}
                        ariaLabel={t('devices.lianli.dutyAria', { n: port + 1 })}
                        onChange={(v: number) => {
                          if (!cooling) return;
                          setCooling({
                            ...cooling,
                            ports: cooling.ports.map(p =>
                              p.port === port ? { ...p, dutyPercent: Math.round(v) } : p,
                            ),
                          });
                        }}
                        onCommit={(v: number) => {
                          void commitPortCooling(port, 'Manual', Math.round(v));
                        }}
                      />
                      <span className={styles.rowValue}>{portData?.dutyPercent ?? 0}%</span>
                    </div>
                  </Fragment>
                );
              })}
              {onSectionNavigate && (
                <Button
                  className={styles.lightingLink}
                  size="sm"
                  tone="neutral"
                  icon={<Wind size={14} />}
                  onClick={() => onSectionNavigate('cooling')}
                >
                  {t('devices.lianli.coolingPageLink')}
                </Button>
              )}
            </SettingsSection>

            <SettingsSection
              title={t('devices.lianli.portsSection')}
              boxClassName={styles.sectionBox}
            >
              {Array.from({ length: PORT_COUNT }, (_, port) => (
                <div key={port} className={`${styles.row} ${!stateLoaded ? styles.rowDisabled : ''}`}>
                  <span className={styles.rowLabel}>{t('devices.lianli.port', { n: port + 1 })}</span>
                  <Select
                    className={styles.portSelect}
                    value={String(lianliState?.fansPerPort[port] ?? 0)}
                    onChange={v => { void commitFanCount(port, Number(v)); }}
                    options={FAN_COUNT_OPTIONS.map(count => ({
                      value: String(count),
                      label: t(`devices.lianli.fanCount${count}` as Parameters<typeof t>[0]),
                    }))}
                    disabled={!stateLoaded}
                    ariaLabel={t('devices.lianli.fanCountAria', { n: port + 1 })}
                  />
                  <span className={styles.rowValue}>
                    {stateLoaded ? `${lianliState.rpm[port] ?? 0} RPM` : ''}
                  </span>
                </div>
              ))}
            </SettingsSection>
          </>
        )}
      </div>
    </div>
  );
}
