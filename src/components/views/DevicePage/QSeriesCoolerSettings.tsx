import { useCallback, useEffect, useRef, useState } from 'react';
import { Toggle } from '../../common/Toggle/Toggle';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { getQSeriesState, setQSeriesTurbo, type QSeriesCoolerState } from '../../../api/qseries';
import { useTranslation } from '../../../lib/i18n';
import styles from './QSeriesCoolerSettings.module.scss';

/**
 * Q-series (Q60 / Q80) cooler firmware options, rendered inside the Q60 device
 * page's settings tab. Pump control MODE (BIOS / FW Control / curves) lives in
 * the cooling menu's fan card, not here; this surface is the hub-wide firmware
 * option that has no cooling-menu home: turbo. Reads live state from
 * <c>GET /devices/qseries</c>.
 */
export function QSeriesCoolerSettings() {
  const { t } = useTranslation();
  const [state, setState] = useState<QSeriesCoolerState | null>(null);
  const [saving, setSaving] = useState(false);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    const s = await getQSeriesState().catch(() => null);
    if (aliveRef.current && s) setState(s);
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

  const commitTurbo = useCallback(async (on: boolean) => {
    setState(prev => (prev ? { ...prev, turboOn: on } : prev));
    setSaving(true);
    try { await setQSeriesTurbo(on); }
    finally { if (aliveRef.current) setSaving(false); }
  }, []);

  if (!state?.connected) {
    return (
      <SettingsSection title={t('devices.q60.firmwareSection')} boxClassName={styles.sectionBox}>
        <div className={styles.note}>{t('devices.q60.notConnected')}</div>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection
      title={t('devices.q60.firmwareSection')}
      description={t('devices.q60.firmwareSectionDescription')}
      boxClassName={styles.sectionBox}
    >
      <div className={styles.row}>
        <span className={styles.rowLabel}>{t('devices.q60.turbo')}</span>
        <Toggle checked={state.turboOn} onChange={on => void commitTurbo(on)} ariaLabel={t('devices.q60.turbo')} />
        {saving && <span className={styles.savingBadge}>{t('devices.saving')}</span>}
      </div>
      <div className={styles.row}>
        <span className={styles.rowLabel}>{t('devices.q60.pumpRpm')}</span>
        <span className={styles.rowValue}>{state.pumpRpm.toLocaleString()}</span>
      </div>
      {state.firmwareVersion && (
        <div className={styles.row}>
          <span className={styles.rowLabel}>{t('devices.q60.firmwareVersion')}</span>
          <span className={styles.rowValue}>{state.firmwareVersion}</span>
        </div>
      )}
    </SettingsSection>
  );
}
