import { useCallback, useEffect, useRef, useState } from 'react';
import { Fan, Lightbulb, Unplug } from 'lucide-react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { CoolingPageLink } from './CoolingPageLink';
import { SettingSelect, SettingSlider } from '../../common/SettingRow/SettingRow';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import {
  getLianLiTlLighting,
  getLianLiTlState,
  setLianLiTlLighting,
  type LianLiTlLighting,
  type LianLiTlLightingPatch,
  type LianLiTlScope,
  type LianLiTlState,
} from '../../../api/lianli-tl';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useTranslation } from '../../../lib/i18n';
import { formatNumber, localizeNumbers } from '../../../lib/units';
import styles from './LianLiDevicePage.module.scss';

// Polling interval matches the service RpmPollMs.
const RPM_POLL_MS = 2000;

// Brightness and speed are firmware levels; the slider presents them as a percentage.
const PERCENT_PER_LEVEL = 25;

const DEFAULT_COLOR = '#FFFFFF';

const SCOPES: LianLiTlScope[] = ['all', 'top', 'bottom'];

interface LianLiTlDevicePageProps {
  onSectionNavigate?: (section: string) => void;
}

export function LianLiTlDevicePage({ onSectionNavigate }: LianLiTlDevicePageProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'lighting' | 'cooling'>('lighting');
  const { numberFormat } = useUnitPrefs();
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [tlState, setTlState] = useState<LianLiTlState | null>(null);
  const [lighting, setLighting] = useState<LianLiTlLighting | null>(null);
  const aliveRef = useRef(true);
  const connectedRef = useRef(false);
  const lightingRef = useRef<LianLiTlLighting | null>(null);

  const applyLocal = useCallback((next: LianLiTlLighting) => {
    lightingRef.current = next;
    setLighting(next);
  }, []);

  const commitLighting = useCallback(async (patch: LianLiTlLightingPatch) => {
    await setLianLiTlLighting(patch).catch(() => null);
  }, []);

  const refresh = useCallback(async () => {
    const s = await getLianLiTlState();
    if (!aliveRef.current) return;
    if (s === null) return;
    if (!s.isConnected) {
      connectedRef.current = false;
      setConnection('disconnected');
      setTlState(null);
      lightingRef.current = null;
      setLighting(null);
      return;
    }
    connectedRef.current = true;
    setConnection('connected');
    setTlState(s);
    // Only when we hold no look: a refetch racing an in-flight edit reverts the control.
    if (lightingRef.current !== null) return;
    const l = await getLianLiTlLighting().catch(() => null);
    if (!aliveRef.current || l === null) return;
    lightingRef.current = l;
    setLighting(l);
  }, []);

  const refreshRpm = useCallback(async () => {
    if (!connectedRef.current) { void refresh(); return; }
    const s = await getLianLiTlState();
    if (!aliveRef.current || s === null) return;
    if (!s.isConnected) {
      connectedRef.current = false;
      setConnection('disconnected');
      setTlState(null);
      lightingRef.current = null;
      setLighting(null);
      return;
    }
    setTlState(s);
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

  if (connection === 'disconnected') {
    return (
      <div className={styles.page}>
        {/* eslint-disable-next-line i18next/no-literal-string -- brand + model name */}
        <ViewHeader title="Lian Li Uni Fan TL" />
        <div className={`${styles.pageBody} pageBody`}>
          <EmptyState icon={<Unplug size={40} />} title={t('devices.lianli-tl.notConnected')} />
        </div>
      </div>
    );
  }

  const stateLoaded = tlState !== null;
  const lightingLoaded = lighting !== null;
  // "Off" is the payload's disable flag; the look fields it would carry are ignored.
  const lightsOff = lighting?.mode === 'off';

  const hasCooling = stateLoaded && tlState.fans.length > 0;
  const tab = hasCooling ? activeTab : 'lighting';
  const tabs = hasCooling
    ? [
        { key: 'lighting', label: t('lighting.title'), icon: <Lightbulb size={14} /> },
        { key: 'cooling', label: t('cooling.title'), icon: <Fan size={14} /> },
      ]
    : undefined;

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="Lian Li Uni Fan TL"
        tabs={tabs}
        activeTab={tab}
        onTabChange={key => setActiveTab(key as 'lighting' | 'cooling')}
      />
      <div className={`${styles.pageBody} pageBody`}>
        {tab === 'cooling' ? (
          <SettingsSection
            title={t('devices.lianli-tl.fansSection')}
            boxClassName={styles.sectionBox}
          >
            {stateLoaded
              ? tlState.fans.map((fan, i) => (
                  <div key={i} className={styles.row}>
                    <span className={styles.rowLabel}>
                      {t('devices.lianli-tl.fanLabel', { port: fan.port, n: fan.fanIndex })}
                    </span>
                    <span className={styles.rowValue}>{`${formatNumber(fan.rpm, numberFormat)} RPM`}</span>
                    <span className={styles.rowValue}>{localizeNumbers(`${fan.duty}%`, numberFormat)}</span>
                  </div>
                ))
              : <div className={`${styles.row} ${styles.rowDisabled}`} />
            }
            <CoolingPageLink hint={t('devices.coolingPage.speedHint')} onSectionNavigate={onSectionNavigate} />
          </SettingsSection>
        ) : (
          <SettingsSection
            title={t('devices.lianli-tl.lightingSection')}
            boxClassName={styles.sectionBox}
          >
            <SettingSelect
              label={t('devices.lianli-tl.lightingMode')}
              value={lighting?.mode ?? ''}
              onChange={v => {
                if (!lighting) return;
                applyLocal({ ...lighting, mode: v });
                void commitLighting({ mode: v });
              }}
              options={(lighting?.modes ?? []).map(m => ({ value: m.key, label: m.label }))}
              disabled={!lightingLoaded}
            />

            {!lightsOff && (
            <SettingSelect
              label={t('devices.lianli-tl.lightingScope')}
              value={lighting?.scope ?? 'all'}
              onChange={v => {
                if (!lighting) return;
                const scope = v as LianLiTlScope;
                applyLocal({ ...lighting, scope });
                void commitLighting({ scope });
              }}
              options={SCOPES.map(s => ({ value: s, label: t(`devices.lianli-tl.scopes.${s}`) }))}
              disabled={!lightingLoaded}
            />
            )}

            {!lightsOff && (
            <SettingSlider
              editable
              trackFill
              label={t('devices.lianli-tl.lightingBrightness')}
              value={(lighting?.brightness ?? 0) * PERCENT_PER_LEVEL}
              min={0}
              max={100}
              step={PERCENT_PER_LEVEL}
              formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
              ariaLabel={t('devices.lianli-tl.lightingBrightnessAria')}
              disabled={!lightingLoaded}
              onChange={(v: number, commit?: boolean) => {
                if (!lighting) return;
                const level = Math.round(v / PERCENT_PER_LEVEL);
                applyLocal({ ...lighting, brightness: level });
                if (commit) void commitLighting({ brightness: level });
              }}
              onCommit={(v: number) => {
                void commitLighting({ brightness: Math.round(v / PERCENT_PER_LEVEL) });
              }}
            />
            )}

            {!lightsOff && (
            <SettingSlider
              editable
              trackFill
              label={t('devices.lianli-tl.lightingSpeed')}
              value={(lighting?.speed ?? 0) * PERCENT_PER_LEVEL}
              min={0}
              max={100}
              step={PERCENT_PER_LEVEL}
              formatValue={v => localizeNumbers(`${v}%`, numberFormat)}
              ariaLabel={t('devices.lianli-tl.lightingSpeedAria')}
              disabled={!lightingLoaded}
              onChange={(v: number, commit?: boolean) => {
                if (!lighting) return;
                const level = Math.round(v / PERCENT_PER_LEVEL);
                applyLocal({ ...lighting, speed: level });
                if (commit) void commitLighting({ speed: level });
              }}
              onCommit={(v: number) => {
                void commitLighting({ speed: Math.round(v / PERCENT_PER_LEVEL) });
              }}
            />
            )}

            {!lightsOff && (
            <SettingSelect
              label={t('devices.lianli-tl.lightingDirection')}
              value={String(lighting?.direction ?? 0)}
              onChange={v => {
                if (!lighting) return;
                const d = Number(v);
                applyLocal({ ...lighting, direction: d });
                void commitLighting({ direction: d });
              }}
              options={[0, 1, 2, 3, 4, 5].map(d => ({
                value: String(d),
                label: t('devices.lianli-tl.directionN', { n: d + 1 }),
              }))}
              disabled={!lightingLoaded}
            />
            )}

            {lightingLoaded && !lightsOff && (
              <div className={styles.colorBlock} data-settings-aside="true">
                {(lighting?.colors ?? []).map((color, i) => (
                  <div key={i} className={styles.colorEntry}>
                    <HsvPicker
                      value={color}
                      onPreview={(hex: string) => {
                        if (!lighting) return;
                        const next = [...lighting.colors];
                        next[i] = hex;
                        applyLocal({ ...lighting, colors: next });
                      }}
                      onCommit={(hex: string) => {
                        if (!lighting) return;
                        const next = [...lighting.colors];
                        next[i] = hex;
                        applyLocal({ ...lighting, colors: next });
                        void commitLighting({ colors: next });
                      }}
                    />
                    <div className={styles.colorActions}>
                      <Button
                        size="sm"
                        tone="neutral"
                        onClick={() => {
                          if (!lighting) return;
                          const next = lighting.colors.filter((_, idx) => idx !== i);
                          applyLocal({ ...lighting, colors: next });
                          void commitLighting({ colors: next });
                        }}
                      >
                        {t('devices.lianli-tl.removeColor')}
                      </Button>
                    </div>
                  </div>
                ))}
                {(lighting?.colors.length ?? 0) < (lighting?.maxColors ?? 0) && (
                  <Button
                    size="sm"
                    tone="neutral"
                    onClick={() => {
                      if (!lighting) return;
                      const next = [...lighting.colors, DEFAULT_COLOR];
                      applyLocal({ ...lighting, colors: next });
                      void commitLighting({ colors: next });
                    }}
                  >
                    {t('devices.lianli-tl.addColor')}
                  </Button>
                )}
                <p className={styles.customNote} data-settings-aside="true">
                  {t('devices.lianli-tl.colorsNote')}
                </p>
              </div>
            )}
          </SettingsSection>
        )}
      </div>
    </div>
  );
}
