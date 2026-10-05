import { useEffect, useState } from 'react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import {
  TypeReactiveEditor,
  useTypeReactiveConfig,
} from '../../common/TypeReactiveEditor/TypeReactiveEditor';
import { fetchKeyReactive, type KeyReactiveDevice, type KeyReactiveState } from '../../../api/keyReactive';
import { isTunnelActive } from '../../../api/service';
import { useLightingFrames } from '../../../hooks/useLightingFrames';
import { useTranslation } from '../../../lib/i18n';
import styles from './KeebSettingsView.module.scss';

/** The keyboard's Passive lighting section: the shared Type reactive editor
 *  bound to its per-key lighting card (the first card whose physical device is
 *  a keeb). The same config backs the editor on the lighting page. */
export function KeebTypeReactive() {
  const { t } = useTranslation();
  // undefined while the first fetch is in flight, null when it failed.
  const [state, setState] = useState<KeyReactiveState | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    fetchKeyReactive()
      .then(res => { if (!cancelled) setState(res); })
      .catch(() => { if (!cancelled) setState(null); });
    return () => { cancelled = true; };
  }, []);

  const device = state?.devices.find(d => d.deviceId.startsWith('keeb:'));
  // The output socket feeds the live preview; it is skipped over relay and
  // while there is no card to show.
  const stream = useLightingFrames(!!device && !isTunnelActive());

  if (state === undefined) return null;
  if (!device) {
    return (
      <SettingsSection title={t('keeb.settings.passive.title')} description={t('keeb.settings.passive.subtitle')}>
        <p className={styles.note} role="status">{t('keeb.settings.typeReactiveMissing')}</p>
      </SettingsSection>
    );
  }
  return (
    <KeebTypeReactiveSection
      key={device.id}
      device={device}
      inputAvailable={state?.inputAvailable ?? false}
      stream={stream}
    />
  );
}

function KeebTypeReactiveSection({ device, inputAvailable, stream }: {
  device: KeyReactiveDevice;
  inputAvailable: boolean;
  stream: ReturnType<typeof useLightingFrames>;
}) {
  const { t } = useTranslation();
  const controller = useTypeReactiveConfig(device.id, device.config);
  return (
    <SettingsSection
      title={t('keeb.settings.passive.title')}
      description={t('keeb.settings.passive.subtitle')}
    >
      <TypeReactiveEditor
        cardId={device.id}
        controller={controller}
        inputAvailable={inputAvailable}
        hardwareKeys={device.hardwareKeys}
        frameIndex={device.frameIndex}
        stream={stream}
      />
    </SettingsSection>
  );
}
