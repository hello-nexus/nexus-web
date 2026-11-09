import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { LightingPageSwitch } from './LightingPageSwitch';
import { LianLiEffectControls } from './LianLiEffectControls';
import {
  getStrimerLighting,
  setStrimerLighting,
  type StrimerLighting,
  type StrimerLook,
  type StrimerLightingPatch,
} from '../../../api/strimer';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiDevicePage.module.scss';

// Mode key under which the Lighting page drives the device.
const LIGHTING_PAGE_MODE = 'custom';
const ALL_TARGET = 'all';
const PORTS_PER_CABLE = 6;
const cableOf = (target: string) => (target.startsWith('ch') ? target : Number(target.slice(1)) < PORTS_PER_CABLE ? 'ch0' : 'ch1');

interface StrimerDevicePageProps {
  onSectionNavigate?: (section: string) => void;
}

export function StrimerDevicePage({ onSectionNavigate }: StrimerDevicePageProps) {
  const { t } = useTranslation();
  const [lighting, setLighting] = useState<StrimerLighting | null>(null);
  const [pickedTarget, setTarget] = useState(ALL_TARGET);
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
    await setStrimerLighting(patch);
  }, []);

  const lightingLoaded = lighting !== null;
  // The animation the device plays when the Lighting page is not driving it.
  const effectModes = (lighting?.modes ?? []).filter(m => m.key !== LIGHTING_PAGE_MODE);
  const effectKey = lighting
    ? (lighting.mode !== LIGHTING_PAGE_MODE ? lighting.mode : lighting.effectMode ?? effectModes[0]?.key ?? '')
    : '';
  const isCustomMode = lighting?.mode === LIGHTING_PAGE_MODE;
  const argbSyncOn = lighting?.argbSync === true;
  const controlsDisabled = !lightingLoaded || isCustomMode || argbSyncOn;

  const looks = lighting?.looks ?? [];
  const sharedLook: StrimerLook = {
    target: ALL_TARGET,
    mode: effectKey,
    speed: lighting?.speed ?? 0,
    direction: lighting?.direction ?? 0,
    brightness: lighting?.brightness ?? 0,
    colors: lighting?.colors ?? [],
  };
  const lookOf = (key: string) => looks.find(l => l.target === key);
  const modeOf = (key: string) => (lookOf(key) ?? sharedLook).mode;
  const isComplete = (modeKey: string) => effectModes.find(m => m.key === modeKey)?.complete === true;
  // Cables always take a target; a port only while its cable plays per-port effects.
  const cable24 = 'ch0';
  const cable8 = 'ch1';
  const gpuPorts = lighting?.gpuZones ?? PORTS_PER_CABLE;
  const portTargets = (cable: string, first: number, count: number) => (isComplete(modeOf(cable))
    ? []
    : Array.from({ length: count }, (_, i) => ({ value: `p${first + i}`, label: t('devices.lianli.port', { n: first + i + 1 }) })));
  const targetOptions = [
    { value: ALL_TARGET, label: t('devices.lianli.allPorts') },
    { value: cable24, label: t('devices.strimer.cable24') },
    ...portTargets(cable24, 0, PORTS_PER_CABLE),
    { value: cable8, label: t('devices.strimer.cable8') },
    ...portTargets(cable8, PORTS_PER_CABLE, gpuPorts),
  ];
  const target = targetOptions.some(o => o.value === pickedTarget) ? pickedTarget : ALL_TARGET;
  const ownLook = target === ALL_TARGET ? null : lookOf(target) ?? null;
  const shown: StrimerLook = target === ALL_TARGET
    ? sharedLook
    : ownLook ?? (target.startsWith('p') ? lookOf(cableOf(target)) : undefined) ?? sharedLook;

  return (
    <div className={styles.page}>
      <ViewHeader
        // eslint-disable-next-line i18next/no-literal-string -- brand + model name
        title="Lian Li Strimer Plus"
      />
      <div className={`${styles.pageBody} pageBody`}>
        <SettingsSection title={t('devices.lianli.argbSyncSection')} boxClassName={styles.sectionBox}>
          <SettingToggle
            label={t('devices.motherboardArgb.label')}
            description={t('devices.motherboardArgb.hint')}
            checked={argbSyncOn}
            disabled={!lightingLoaded}
            onChange={on => {
              if (!lighting) return;
              const previous = lighting;
              setLighting({ ...lighting, argbSync: on });
              // It decides which controls lock, so a refused save must not leave the page showing it.
              void setStrimerLighting({ argbSync: on }).catch(() => null).then(r => {
                if (!aliveRef.current) return;
                if (r === null) setLighting(previous);
              });
            }}
          />
        </SettingsSection>
        <SettingsSection
          title={t('devices.lianli.lightingSection')}
          boxClassName={styles.sectionBox}
        >
          <LightingPageSwitch
            on={isCustomMode}
            disabled={!lightingLoaded || argbSyncOn}
            onChange={on => {
              if (!lighting) return;
              const mode = on ? LIGHTING_PAGE_MODE : effectKey;
              setLighting({ ...lighting, mode });
              void commitLighting({ mode });
            }}
            onSectionNavigate={onSectionNavigate}
          />

          {lightingLoaded && targetOptions.length > 1 && (
            <SettingSelect
              label={t('devices.lianli.applyTo')}
              value={target}
              onChange={v => setTarget(v)}
              options={targetOptions}
              disabled={controlsDisabled}
            />
          )}

          {target !== ALL_TARGET && ownLook && (
            <div className={styles.colorActions}>
              <Button
                size="sm"
                tone="neutral"
                disabled={controlsDisabled}
                onClick={() => {
                  void commitLighting({ target, resetTarget: true }).then(refresh);
                }}
              >
                {t('devices.lianli.matchAllPorts')}
              </Button>
            </div>
          )}

          <LianLiEffectControls
            modes={target === ALL_TARGET || target.startsWith('ch') ? effectModes : effectModes.filter(m => !m.complete)}
            effect={shown}
            disabled={controlsDisabled}
            loaded={lightingLoaded}
            onPreview={next => {
              if (!lighting) return;
              // Each mode keeps its own palette, so a switch shows the new mode's defaults until the service answers.
              const switched = next.mode !== shown.mode;
              const colors = switched ? [] : next.colors;
              if (target === ALL_TARGET) {
                setLighting({
                  ...lighting,
                  ...next,
                  colors,
                  mode: switched ? next.mode : lighting.mode,
                  effectMode: next.mode,
                });
                return;
              }
              const own: StrimerLook = { ...next, colors, target };
              setLighting({ ...lighting, looks: [...looks.filter(l => l.target !== target), own] });
            }}
            onCommit={patch => {
              const sent = target === ALL_TARGET ? patch : { ...patch, target };
              void commitLighting(sent).then(() => (patch.mode || target !== ALL_TARGET ? refresh() : undefined));
            }}
          />
        </SettingsSection>
      </div>
    </div>
  );
}
