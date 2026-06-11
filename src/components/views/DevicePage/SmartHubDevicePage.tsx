import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { Placeholder } from '../Placeholder';
import { Select } from '../../common/Select/Select';
import { Slider } from '../../common/Slider/Slider';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import {
  getSmartHubConnectionState,
  getSmartHubFwSetting,
  setSmartHubFwSetting,
  smartHubHexToRgb,
  smartHubRgbToHex,
  SMARTHUB_FW_ANIMATION_BREATHE,
  SMARTHUB_FW_ANIMATION_COLOR,
  SMARTHUB_FW_ANIMATION_RAINBOW,
  SMARTHUB_FW_ANIMATION_RAINBOW_GRADIENT,
  type SmartHubFwAnimationKind,
  type SmartHubFwSetting,
} from '../../../api/smarthub';
import styles from './SmartHubDevicePage.module.scss';

/**
 * Routed page for the HYTE SmartHub. Exposes the single flash-persisted
 * standalone setting — fallback fan duty + firmware-side LED animation —
 * that describes what the hub does when no host drives it (PC off,
 * asleep, service shut down).
 *
 * Connection model: the authoritative "is the SmartHub here?" answer
 * lives at `GET /devices/smarthub`. The fw-setting read can fail
 * transiently and MUST NOT be treated as offline. The placeholder is
 * pinned to the explicit 'disconnected' response, never to a null
 * setting read.
 */
export function SmartHubDevicePage() {
  // Tri-state: 'unknown' = still loading, 'connected' = hub up,
  // 'disconnected' = explicit not-connected response. The placeholder
  // only renders on the 'disconnected' arm.
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [setting, setSetting] = useState<SmartHubFwSetting | null>(null);
  const [saving, setSaving] = useState(false);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    // 1. Ask the service whether the hub is actually plugged in.
    //    'unknown' = service unreachable; don't change connection state so
    //    we don't flash the placeholder while a single poll fails — the
    //    parent ServiceRequired guard handles the no-service case.
    const conn = await getSmartHubConnectionState();
    if (!aliveRef.current) return;
    if (conn === 'unknown') return;
    if (conn === 'disconnected') {
      setConnection('disconnected');
      setSetting(null);
      return;
    }

    // 2. Hub is up. Read the fw-setting, but treat a null as transient —
    //    keep whatever we last loaded so the UI doesn't blink when one
    //    read fails (the next refresh fills the gap).
    setConnection('connected');
    const s = await getSmartHubFwSetting().catch(() => null);
    if (!aliveRef.current) return;
    if (s) setSetting(s);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    // Refetch when the user returns to the window — covers hot-plug
    // while the page was hidden.
    const onFocus = () => { void refresh(); };
    window.addEventListener('focus', onFocus);
    return () => {
      aliveRef.current = false;
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  // The PUT always carries the full setting object — the service exposes
  // one combined endpoint, so every field patch sends all six fields.
  const commitSetting = useCallback(async (next: SmartHubFwSetting) => {
    setSetting(next);
    setSaving(true);
    try {
      await setSmartHubFwSetting(next);
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, []);

  // Placeholder only renders when the service explicitly says the hub is
  // gone. A transient setting null or a "still loading" state never
  // reaches this branch.
  if (connection === 'disconnected') {
    return (
      <div className={styles.page}>
        <ViewHeader title="HYTE SmartHub" />
        <div className={`${styles.pageBody} pageBody`}>
          <Placeholder title="HYTE SmartHub not connected" />
        </div>
      </div>
    );
  }

  // While loading (connection === 'unknown') we still render the page
  // chrome but leave sections inert. Avoids a placeholder->page flash
  // on every nav-in.
  const settingLoaded = setting !== null;
  const animKind = setting?.animation ?? SMARTHUB_FW_ANIMATION_COLOR;
  const showColorPicker =
    animKind === SMARTHUB_FW_ANIMATION_COLOR || animKind === SMARTHUB_FW_ANIMATION_BREATHE;
  const hex = setting
    ? smartHubRgbToHex(setting.r, setting.g, setting.b)
    : '#ffffff';

  return (
    <div className={styles.page}>
      <ViewHeader
        title="HYTE SmartHub"
        actions={saving ? <span className={styles.savingBadge}>Saving…</span> : null}
      />
      <div className={`${styles.pageBody} pageBody`}>
        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Standalone fan behaviour</h2>
            <p className={styles.sectionHint}>
              Persisted to the hub's flash. 5 seconds after the last host
              fan write, the hub applies this duty to all four PWM ports —
              the PC is off, asleep, or the service stopped.
            </p>
            <p className={styles.sectionHint}>
              This hub has no motherboard PWM input; live fan control comes
              from Nexus cooling.
            </p>
          </header>
          <div className={`${styles.row} ${!settingLoaded ? styles.rowDisabled : ''}`}>
            <span className={styles.rowLabel}>Standalone fan %</span>
            <Slider
              className={styles.slider}
              value={setting?.fanPercent ?? 50}
              min={0}
              max={100}
              step={1}
              ariaLabel="Standalone fan percent"
              onChange={(v: number) => {
                if (!setting) return;
                setSetting({ ...setting, fanPercent: Math.round(v) });
              }}
              onCommit={() => {
                if (setting) void commitSetting(setting);
              }}
            />
            <span className={styles.rowValue}>{setting?.fanPercent ?? 50}%</span>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Standalone LED animation</h2>
            <p className={styles.sectionHint}>
              What the hub's onboard LEDs show when Nexus isn't streaming
              lighting frames.
            </p>
          </header>
          <div className={`${styles.row} ${!settingLoaded ? styles.rowDisabled : ''}`}>
            <span className={styles.rowLabel}>Effect</span>
            <Select
              value={String(animKind)}
              onChange={v => {
                if (!setting) return;
                const k = Number(v) as SmartHubFwAnimationKind;
                void commitSetting({ ...setting, animation: k });
              }}
              options={[
                { value: String(SMARTHUB_FW_ANIMATION_COLOR), label: 'Solid color' },
                { value: String(SMARTHUB_FW_ANIMATION_RAINBOW), label: 'Rainbow cycle' },
                { value: String(SMARTHUB_FW_ANIMATION_BREATHE), label: 'Breathing' },
                { value: String(SMARTHUB_FW_ANIMATION_RAINBOW_GRADIENT), label: 'Rainbow gradient' },
              ]}
              disabled={!settingLoaded}
              ariaLabel="SmartHub firmware animation"
            />
          </div>
          <div className={`${styles.row} ${!settingLoaded ? styles.rowDisabled : ''}`}>
            <span className={styles.rowLabel}>Brightness</span>
            <Slider
              className={styles.slider}
              value={setting?.brightness ?? 100}
              min={0}
              max={100}
              step={1}
              ariaLabel="Brightness"
              onChange={(v: number) => {
                if (!setting) return;
                setSetting({ ...setting, brightness: Math.round(v) });
              }}
              onCommit={() => {
                if (setting) void commitSetting(setting);
              }}
            />
            <span className={styles.rowValue}>{setting?.brightness ?? 100}%</span>
          </div>
          {showColorPicker && settingLoaded && (
            <div className={styles.colorBlock}>
              <HsvPicker
                value={hex}
                onPreview={(next: string) => {
                  if (!setting) return;
                  const { r, g, b } = smartHubHexToRgb(next);
                  setSetting({ ...setting, r, g, b });
                }}
                onCommit={(next: string) => {
                  if (!setting) return;
                  const { r, g, b } = smartHubHexToRgb(next);
                  void commitSetting({ ...setting, r, g, b });
                }}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
