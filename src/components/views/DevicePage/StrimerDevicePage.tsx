import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { SettingToggle } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { LightingPageSwitch } from './LightingPageSwitch';
import { LianLiEffectControls } from './LianLiEffectControls';
import {
  getStrimerLighting,
  setStrimerLighting,
  type StrimerLighting,
  type StrimerLightingPatch,
} from '../../../api/strimer';
import { useTranslation } from '../../../lib/i18n';
import styles from './LianLiDevicePage.module.scss';

// Mode key under which the Lighting page drives the device.
const LIGHTING_PAGE_MODE = 'custom';

interface StrimerDevicePageProps {
  onSectionNavigate?: (section: string) => void;
}

export function StrimerDevicePage({ onSectionNavigate }: StrimerDevicePageProps) {
  const { t } = useTranslation();
  const [lighting, setLighting] = useState<StrimerLighting | null>(null);
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

          <LianLiEffectControls
            modes={effectModes}
            effect={{
              mode: effectKey,
              speed: lighting?.speed ?? 0,
              direction: lighting?.direction ?? 0,
              brightness: lighting?.brightness ?? 0,
              colors: lighting?.colors ?? [],
            }}
            disabled={!lightingLoaded || isCustomMode || argbSyncOn}
            loaded={lightingLoaded}
            onPreview={next => {
              if (!lighting) return;
              // Each mode keeps its own palette, so a switch shows the new mode's defaults until the service answers.
              const switched = next.mode !== effectKey;
              setLighting({
                ...lighting,
                ...next,
                colors: switched ? [] : next.colors,
                mode: switched ? next.mode : lighting.mode,
                effectMode: next.mode,
              });
            }}
            onCommit={patch => {
              void commitLighting(patch).then(() => (patch.mode ? refresh() : undefined));
            }}
          />
        </SettingsSection>
      </div>
    </div>
  );
}
