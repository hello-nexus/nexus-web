import { useCallback, useEffect, useRef, useState } from 'react';
import { Lightbulb, Unplug } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Select } from '../../common/Select/Select';
import { SettingRow, SettingSelect, SettingSlider } from '../../common/SettingRow/SettingRow';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import {
  getLianLiState,
  getLianLiLighting,
  setLianLiFanCount,
  setLianLiLighting,
  type LianLiState,
  type LianLiLighting,
  type LianLiLightingPatch,
} from '../../../api/lianli';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { formatNumber, localizeNumbers } from '../../../lib/units';
import styles from './LianLiDevicePage.module.scss';

const PORT_COUNT = 4;
const FAN_COUNT_OPTIONS = [0, 1, 2, 3, 4] as const;
// Firmware brightness/speed are 5 discrete levels (0..4) presented as a percent.
const PERCENT_PER_LEVEL = 25;
const DEFAULT_COLOR = '#ffffff';
const DEFAULT_COLOR_SECONDARY = '#000000';
// Polling interval matches the service RpmPollMs.
const RPM_POLL_MS = 2000;

interface LianLiDevicePageProps {
  onSectionNavigate?: (section: string) => void;
}

export function LianLiDevicePage({ onSectionNavigate }: LianLiDevicePageProps) {
  const { t } = useTranslation();
  const { numberFormat } = useUnitPrefs();
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [lianliState, setLianliState] = useState<LianLiState | null>(null);
  const [lighting, setLighting] = useState<LianLiLighting | null>(null);
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
      return;
    }
    connectedRef.current = true;
    setConnection('connected');
    setLianliState(s);
    const lt = await getLianLiLighting().catch(() => null);
    if (!aliveRef.current) return;
    if (lt) setLighting(lt);
  }, []);

  // Steady-state telemetry tick: refresh only the read-only RPM so a poll
  // never overwrites an in-progress lighting/fan-count edit. While
  // disconnected, defer to the full refresh so a reconnect repopulates state.
  const refreshRpm = useCallback(async () => {
    if (!connectedRef.current) { void refresh(); return; }
    const s = await getLianLiState();
    if (!aliveRef.current || s === null) return;
    if (!s.isConnected) {
      connectedRef.current = false;
      setConnection('disconnected');
      setLianliState(null);
      setLighting(null);
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

  if (connection === 'disconnected') {
    return (
      <div className={styles.page}>
        {/* eslint-disable-next-line i18next/no-literal-string -- brand + model name */}
        <ViewHeader title="Lian Li Uni Hub" />
        <div className={`${styles.pageBody} pageBody`}>
          <EmptyState icon={<Unplug size={40} />} title={t('devices.lianli.notConnected')} />
        </div>
      </div>
    );
  }

  const stateLoaded = lianliState !== null;
  const lightingLoaded = lighting !== null;

  const selectedMode = lighting
    ? (lighting.modes.find(m => m.key === lighting.mode) ?? null)
    : null;
  const isCustomMode = lighting?.mode === 'custom';

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="Lian Li Uni Hub"
        actions={saving ? <span className={styles.savingBadge}>{t('devices.saving')}</span> : null}
      />
      <div className={`${styles.pageBody} pageBody`}>
        <SettingsSection
          title={t('devices.lianli.portsSection')}
          boxClassName={styles.sectionBox}
        >
          {Array.from({ length: PORT_COUNT }, (_, port) => (
            <SettingRow
              key={port}
              label={t('devices.lianli.port', { n: port + 1 })}
              disabled={!stateLoaded}
            >
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
                {stateLoaded ? `${formatNumber(lianliState.rpm[port] ?? 0, numberFormat)} RPM` : ''}
              </span>
            </SettingRow>
          ))}
        </SettingsSection>

        <SettingsSection
          title={t('devices.lianli.lightingSection')}
          boxClassName={styles.sectionBox}
        >
          <SettingSelect
            label={t('devices.lianli.lightingMode')}
            value={lighting?.mode ?? ''}
            onChange={v => {
              if (!lighting) return;
              setLighting({ ...lighting, mode: v });
              void commitLighting({ mode: v });
            }}
            options={(lighting?.modes ?? []).map(m => ({ value: m.key, label: m.label }))}
            disabled={!lightingLoaded}
          />

          {isCustomMode ? (
            <>
              <p className={styles.customNote} data-settings-aside="true">{t('devices.lianli.customModeNote')}</p>
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
              {selectedMode?.hasBrightness && (
                <SettingSlider
                  editable
                  trackFill
                  label={t('devices.lianli.lightingBrightness')}
                  value={(lighting?.brightness ?? 0) * PERCENT_PER_LEVEL}
                  min={0}
                  max={100}
                  step={PERCENT_PER_LEVEL}
                  formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
                  ariaLabel={t('devices.lianli.lightingBrightnessAria')}
                  disabled={!lightingLoaded}
                  onChange={(v: number, commit?: boolean) => {
                    if (!lighting) return;
                    const level = Math.round(v / PERCENT_PER_LEVEL);
                    setLighting({ ...lighting, brightness: level });
                    if (commit) void commitLighting({ brightness: level });
                  }}
                  onCommit={(v: number) => {
                    void commitLighting({ brightness: Math.round(v / PERCENT_PER_LEVEL) });
                  }}
                />
              )}

              {selectedMode?.hasSpeed && (
                <SettingSlider
                  editable
                  trackFill
                  label={t('devices.lianli.lightingSpeed')}
                  value={(lighting?.speed ?? 0) * PERCENT_PER_LEVEL}
                  min={0}
                  max={100}
                  step={PERCENT_PER_LEVEL}
                  formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
                  ariaLabel={t('devices.lianli.lightingSpeedAria')}
                  disabled={!lightingLoaded}
                  onChange={(v: number, commit?: boolean) => {
                    if (!lighting) return;
                    const level = Math.round(v / PERCENT_PER_LEVEL);
                    setLighting({ ...lighting, speed: level });
                    if (commit) void commitLighting({ speed: level });
                  }}
                  onCommit={(v: number) => {
                    void commitLighting({ speed: Math.round(v / PERCENT_PER_LEVEL) });
                  }}
                />
              )}

              {selectedMode?.hasDirection && (
                <SettingSelect
                  label={t('devices.lianli.lightingDirection')}
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
                />
              )}

              {selectedMode && selectedMode.colorsMax > 0 && lightingLoaded && (
                <div className={styles.colorBlock} data-settings-aside="true">
                  {selectedMode.colorsMax === 2 ? (
                    <div className={styles.colorPairRow}>
                      {([0, 1] as const).map(i => {
                        const color = lighting?.colors[i] ?? DEFAULT_COLOR_SECONDARY;
                        return (
                          <div key={i} className={styles.colorEntry}>
                            <span className={styles.colorLabel}>
                              {t('devices.lianli.colorN', { n: i + 1 })}
                            </span>
                            <HsvPicker
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
                          </div>
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
      </div>
    </div>
  );
}
