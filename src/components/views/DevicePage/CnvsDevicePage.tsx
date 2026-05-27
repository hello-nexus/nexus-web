import { useCallback, useEffect, useState } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { Placeholder } from '../Placeholder';
import { Toggle } from '../../common/Toggle/Toggle';
import {
  getCnvsSettings,
  setCnvsSettings,
  type CnvsSettings,
} from '../../../api/cnvs';
import styles from './CnvsDevicePage.module.scss';

/**
 * Routed page for the HYTE CNVS canvas LEDs. Mirrors the two firmware
 * toggles from Nexus 2.0's CnvsSettings modal:
 *   - playAnimation:  misleading field name. In HYTE's reference
 *                     CNVSBaseController this is wired to
 *                     `_turnOffStartupAnimation` with the comment
 *                     "true: turn off start up animation". So `true`
 *                     means the boot animation is SUPPRESSED, not that
 *                     it plays. The toggle therefore binds directly to
 *                     the field with the label "Disable connection
 *                     animation" — toggle on = animation suppressed —
 *                     which matches HYTE 2.0's UI exactly.
 *   - playWhenPCOff:  literal — keep LEDs lit while the PC is powered off.
 * Optimistic update + revert-on-failure, matching the old client.
 */
export function CnvsDevicePage() {
  const [settings, setSettings] = useState<CnvsSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const s = await getCnvsSettings();
      if (cancelled) return;
      if (!s) {
        setError('Could not read CNVS settings.');
      } else {
        setSettings(s);
        setError(null);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const commit = useCallback(async (next: CnvsSettings) => {
    const snapshot = settings;
    setSettings(next);
    setError(null);
    const result = await setCnvsSettings(next);
    if (result === null) {
      setSettings(snapshot);
      setError('Saving CNVS settings failed.');
    }
  }, [settings]);

  return (
    <section className={styles.page}>
      <ViewHeader
        title="CNVS"
        titleTooltip="Firmware toggles for the HYTE CNVS canvas LEDs." />
      <div className={styles.pageBody}>
        {loading ? null : !settings ? (
          <Placeholder title={error ?? 'CNVS not available'} />
        ) : (
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Firmware behaviour</h2>
              <p className={styles.sectionHint}>
                Settings that the CNVS keeps even when Nexus isn&apos;t running.
              </p>
            </div>

            <SettingRow
              label="Disable connection animation"
              hint="Skip the firmware boot animation when the CNVS connects to this PC."
              checked={settings.playAnimation}
              onChange={(disabled) => commit({ ...settings, playAnimation: disabled })} />

            <SettingRow
              label="Keep LEDs on when PC is off"
              hint="CNVS LEDs stay lit on the last frame after a shutdown. Drains a bit of standby power."
              checked={settings.playWhenPCOff}
              onChange={(on) => commit({ ...settings, playWhenPCOff: on })} />

            {error && <div className={styles.errorRow}>{error}</div>}
          </div>
        )}
      </div>
    </section>
  );
}

interface SettingRowProps {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

function SettingRow({ label, hint, checked, onChange }: SettingRowProps) {
  return (
    <div className={styles.row}>
      <div className={styles.rowText}>
        <div className={styles.rowLabel}>{label}</div>
        <div className={styles.rowHint}>{hint}</div>
      </div>
      <Toggle checked={checked} onChange={onChange} ariaLabel={label} />
    </div>
  );
}

export default CnvsDevicePage;
