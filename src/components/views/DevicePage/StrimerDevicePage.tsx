import { useCallback, useEffect, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { Select } from '../../common/Select/Select';
import { Slider } from '../../common/Slider/Slider';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import {
  getStrimerLighting,
  setStrimerLighting,
  type StrimerLighting,
  type StrimerLightingPatch,
} from '../../../api/strimer';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiDevicePage.module.scss';

const PERCENT_PER_LEVEL = 25;
const DEFAULT_COLOR = '#ffffff';
const DEFAULT_COLOR_SECONDARY = '#000000';

interface StrimerDevicePageProps {
  onSectionNavigate?: (section: string) => void;
}

export function StrimerDevicePage({ onSectionNavigate }: StrimerDevicePageProps) {
  const { t } = useTranslation();
  const [lighting, setLighting] = useState<StrimerLighting | null>(null);
  const [saving, setSaving] = useState(false);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const lt = await getStrimerLighting();
    if (!aliveRef.current) return;
    if (lt) setLighting(lt);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const commitLighting = useCallback(async (patch: StrimerLightingPatch) => {
    setSaving(true);
    try {
      await setStrimerLighting(patch);
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, []);

  const lightingLoaded = lighting !== null;
  const selectedMode = lighting
    ? (lighting.modes.find(m => m.key === lighting.mode) ?? null)
    : null;
  const isCustomMode = lighting?.mode === 'custom';

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="Lian Li Strimer"
        actions={saving ? <span className={styles.savingBadge}>{t('devices.saving')}</span> : null}
      />
      <div className={`${styles.pageBody} pageBody`}>
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
            </>
          )}
        </SettingsSection>
      </div>
    </div>
  );
}
