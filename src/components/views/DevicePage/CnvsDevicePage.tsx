import { useCallback, useEffect, useState } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { Placeholder } from '../Placeholder';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingToggle } from '../../common/SettingRow/SettingRow';
import {
  getCnvsSettings,
  setCnvsSettings,
  type CnvsSettings,
} from '../../../api/cnvs';
import { useTranslation } from '../../../lib/i18n';
import styles from './CnvsDevicePage.module.scss';

/**
 * Routed page for the HYTE CNVS canvas LEDs. Two firmware toggles:
 *   - playAnimation:  misleading field name. In HYTE's reference
 *                     CNVSBaseController it's wired to
 *                     `_turnOffStartupAnimation` ("true: turn off start
 *                     up animation"), so `true` SUPPRESSES the boot
 *                     animation. The toggle binds to the field under the
 *                     label "Disable connection animation" - on =
 *                     animation suppressed.
 *   - playWhenPCOff:  literal - keep LEDs lit while the PC is powered off.
 * Optimistic update + revert-on-failure.
 *
 * TODO(cnvs-fw-gate): Both toggles map to the firmware's `FF DC 07`
 * command, introduced in CNVS firmware **v1.0.2.1** (per
 * `hyte-refs/hyte-documents/firmware-protocol/CNVS/stm32-commands.md`
 * §3 - "Work with firmware update from v1.0.2.1/v1.0.2.2"). On older
 * firmware the device silently accepts the bytes and does nothing - the
 * write succeeds but no setting changes. Disable both rows (with a hint
 * "Requires CNVS firmware 1.0.2.1+") when the firmware-version probe
 * reports a lower version. The service already reads + logs the FW version
 * on connect via `CnvsConnectionWorker`; the API needs to surface it on
 * `GetCnvsSettings` so this component can branch on it.
 */
export function CnvsDevicePage() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<CnvsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getCnvsSettings();
      if (cancelled) return;
      if (!s) {
        setError(t('devices.cnvs.readFailed'));
      } else {
        setSettings(s);
        setError(null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [t]);

  const commit = useCallback(async (next: CnvsSettings) => {
    const snapshot = settings;
    setSettings(next);
    setError(null);
    const result = await setCnvsSettings(next);
    if (result === null) {
      setSettings(snapshot);
      setError(t('devices.cnvs.saveFailed'));
    }
  }, [settings, t]);

  return (
    <section className={styles.page}>
      <ViewHeader
        title="CNVS"
        />
      <div className={`${styles.pageBody} pageBody`}>
        {loading ? null : !settings ? (
          <Placeholder title={error ?? t('devices.cnvs.notAvailable')} />
        ) : (
          <SettingsSection
            title={t('devices.cnvs.firmwareSection')}
            description={t('devices.cnvs.firmwareSectionDescription')}
            boxClassName={styles.sectionBox}
          >
            <SettingToggle
              label={t('devices.cnvs.disableConnectionAnimation')}
              description={t('devices.cnvs.disableConnectionAnimationHint')}
              checked={settings.playAnimation}
              onChange={(disabled) => commit({ ...settings, playAnimation: disabled })} />

            <SettingToggle
              label={t('devices.cnvs.keepLedsOnWhenPcOff')}
              description={t('devices.cnvs.keepLedsOnWhenPcOffHint')}
              checked={settings.playWhenPCOff}
              onChange={(on) => commit({ ...settings, playWhenPCOff: on })} />

            {error && <div className={styles.errorRow} data-settings-aside="true">{error}</div>}
          </SettingsSection>
        )}
      </div>
    </section>
  );
}

export default CnvsDevicePage;
