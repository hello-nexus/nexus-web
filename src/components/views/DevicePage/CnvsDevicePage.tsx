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
 *
 * TODO(cnvs-fw-gate): Both toggles map to the firmware's `FF DC 07`
 * command, which was only introduced in CNVS firmware **v1.0.2.1**
 * (per `hyte-refs/hyte-documents/firmware-protocol/CNVS/stm32-commands.md`
 * §3 — "Work with firmware update from v1.0.2.1/v1.0.2.2"). On units
 * running an older firmware the device silently accepts the bytes and
 * does nothing — the on-wire write succeeds but no setting changes
 * and the boot animation keeps playing. HYTE's own Nexus 2.0 does NOT
 * gate the UI; we should be better and disable both rows (with a hint
 * "Requires CNVS firmware 1.0.2.1+") when the firmware-version probe
 * reports a lower version. The service already reads + logs the FW
 * version on connect via `CnvsConnectionWorker`; the API just needs to
 * surface it on `GetCnvsSettings` so this component can branch on it.
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
