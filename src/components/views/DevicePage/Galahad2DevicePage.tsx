import { useCallback, useEffect, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { Placeholder } from '../Placeholder';
import { Select } from '../../common/Select/Select';
import { Slider } from '../../common/Slider/Slider';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import {
  getGalahad2State,
  getGalahad2Lighting,
  setGalahad2Lighting,
  type Galahad2State,
  type Galahad2Lighting,
  type Galahad2LightingPatch,
} from '../../../api/lianli-aio';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiDevicePage.module.scss';

const PERCENT_PER_LEVEL = 25;
const DEFAULT_COLOR = '#ffffff';
const DEFAULT_COLOR_SECONDARY = '#000000';
// Polling interval matches the service RpmPollMs.
const RPM_POLL_MS = 2000;

interface Galahad2DevicePageProps {
  onSectionNavigate?: (section: string) => void;
}

export function Galahad2DevicePage({ onSectionNavigate }: Galahad2DevicePageProps) {
  const { t } = useTranslation();
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [aioState, setAioState] = useState<Galahad2State | null>(null);
  const [lighting, setLighting] = useState<Galahad2Lighting | null>(null);
  const [saving, setSaving] = useState(false);
  const aliveRef = useRef(true);
  const connectedRef = useRef(false);

  const refresh = useCallback(async () => {
    const s = await getGalahad2State();
    if (!aliveRef.current) return;
    if (s === null) return;
    if (!s.isConnected) {
      connectedRef.current = false;
      setConnection('disconnected');
      setAioState(null);
      setLighting(null);
      return;
    }
    connectedRef.current = true;
    setConnection('connected');
    setAioState(s);
    const lt = await getGalahad2Lighting().catch(() => null);
    if (!aliveRef.current) return;
    if (lt) setLighting(lt);
  }, []);

  const refreshRpm = useCallback(async () => {
    if (!connectedRef.current) { void refresh(); return; }
    const s = await getGalahad2State();
    if (!aliveRef.current || s === null) return;
    if (!s.isConnected) {
      connectedRef.current = false;
      setConnection('disconnected');
      setAioState(null);
      setLighting(null);
      return;
    }
    setAioState(s);
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

  const commitLighting = useCallback(async (patch: Galahad2LightingPatch) => {
    setSaving(true);
    try {
      await setGalahad2Lighting(patch);
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, []);

  if (connection === 'disconnected') {
    return (
      <div className={styles.page}>
        {/* eslint-disable-next-line i18next/no-literal-string -- brand + model name */}
        <ViewHeader title="Lian Li Galahad II" />
        <div className={`${styles.pageBody} pageBody`}>
          <Placeholder title={t('devices.lianli-aio.notConnected')} />
        </div>
      </div>
    );
  }

  const stateLoaded = aioState !== null;
  const lightingLoaded = lighting !== null;

  const selectedMode = lighting
    ? (lighting.modes.find(m => m.key === lighting.mode) ?? null)
    : null;
  const isCanvasMode = lighting?.mode === 'canvas';

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="Lian Li Galahad II"
        actions={saving ? <span className={styles.savingBadge}>{t('devices.saving')}</span> : null}
      />
      <div className={`${styles.pageBody} pageBody`}>
        <SettingsSection
          title={t('devices.lianli-aio.statusSection')}
          boxClassName={styles.sectionBox}
        >
          <div className={`${styles.row} ${!stateLoaded ? styles.rowDisabled : ''}`}>
            <span className={styles.rowLabel}>{t('devices.lianli-aio.fan')}</span>
            <span className={styles.rowValue}>{stateLoaded ? `${aioState.fanRpm} RPM` : ''}</span>
            <span className={styles.rowValue}>{stateLoaded ? `${aioState.fanDuty}%` : ''}</span>
          </div>
          <div className={`${styles.row} ${!stateLoaded ? styles.rowDisabled : ''}`}>
            <span className={styles.rowLabel}>{t('devices.lianli-aio.pump')}</span>
            <span className={styles.rowValue}>{stateLoaded ? `${aioState.pumpRpm} RPM` : ''}</span>
            <span className={styles.rowValue}>{stateLoaded ? `${aioState.pumpDuty}%` : ''}</span>
          </div>
        </SettingsSection>

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

          {isCanvasMode ? (
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
              {selectedMode?.hasBrightness && (
                <Slider
                  // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
                  orientation="stacked"
                  editable
                  trackFill
                  label={t('devices.lianli.lightingBrightness')}
                  value={(lighting?.brightness ?? 0) * PERCENT_PER_LEVEL}
                  min={0}
                  max={100}
                  step={PERCENT_PER_LEVEL}
                  formatValue={v => `${v}%`}
                  ariaLabel={t('devices.lianli.lightingBrightnessAria')}
                  disabled={!lightingLoaded}
                  onChange={(v: number) => {
                    if (!lighting) return;
                    setLighting({ ...lighting, brightness: Math.round(v / PERCENT_PER_LEVEL) });
                  }}
                  onCommit={(v: number) => {
                    void commitLighting({ brightness: Math.round(v / PERCENT_PER_LEVEL) });
                  }}
                />
              )}

              {selectedMode?.hasSpeed && (
                <Slider
                  // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
                  orientation="stacked"
                  editable
                  trackFill
                  label={t('devices.lianli.lightingSpeed')}
                  value={(lighting?.speed ?? 0) * PERCENT_PER_LEVEL}
                  min={0}
                  max={100}
                  step={PERCENT_PER_LEVEL}
                  formatValue={v => `${v}%`}
                  ariaLabel={t('devices.lianli.lightingSpeedAria')}
                  disabled={!lightingLoaded}
                  onChange={(v: number) => {
                    if (!lighting) return;
                    setLighting({ ...lighting, speed: Math.round(v / PERCENT_PER_LEVEL) });
                  }}
                  onCommit={(v: number) => {
                    void commitLighting({ speed: Math.round(v / PERCENT_PER_LEVEL) });
                  }}
                />
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

              {lightingLoaded && lighting?.mode === 'staticColor' && (
                <div className={styles.colorBlock}>
                  <div className={styles.colorPairRow}>
                    <div className={styles.colorEntry}>
                      <span className={styles.colorLabel}>{t('devices.lianli-aio.innerColor')}</span>
                      <HsvPicker
                        value={lighting?.innerColor ?? DEFAULT_COLOR}
                        onPreview={(hex: string) => {
                          if (!lighting) return;
                          setLighting({ ...lighting, innerColor: hex });
                        }}
                        onCommit={(hex: string) => {
                          if (!lighting) return;
                          setLighting({ ...lighting, innerColor: hex });
                          void commitLighting({ innerColor: hex });
                        }}
                      />
                    </div>
                    <div className={styles.colorEntry}>
                      <span className={styles.colorLabel}>{t('devices.lianli-aio.outerColor')}</span>
                      <HsvPicker
                        value={lighting?.outerColor ?? DEFAULT_COLOR}
                        onPreview={(hex: string) => {
                          if (!lighting) return;
                          setLighting({ ...lighting, outerColor: hex });
                        }}
                        onCommit={(hex: string) => {
                          if (!lighting) return;
                          setLighting({ ...lighting, outerColor: hex });
                          void commitLighting({ outerColor: hex });
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </SettingsSection>
      </div>
    </div>
  );
}
