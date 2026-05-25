import { useCallback, useEffect, useRef, useState } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { Placeholder } from '../Placeholder';
import { Select } from '../../common/Select/Select';
import { Slider } from '../../common/Slider/Slider';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import {
  getNp50ConnectionState,
  getNp50FirmwareAnimation,
  getNp50FirmwareDefaults,
  np50HexToRgb,
  np50RgbToHex,
  NP50_DEFAULT_MODE_MOTHERBOARD,
  NP50_DEFAULT_MODE_STATIC,
  NP50_FW_ANIMATION_BREATHE,
  NP50_FW_ANIMATION_COLOR,
  NP50_FW_ANIMATION_RAINBOW,
  NP50_FW_ANIMATION_RAINBOW_GRADIENT,
  setNp50FirmwareAnimation,
  setNp50FirmwareDefaults,
  type Np50DefaultMode,
  type Np50FirmwareAnimation,
  type Np50FirmwareDefaults,
  type Np50FwAnimationKind,
} from '../../../api/np50';
import styles from './Np50DevicePage.module.scss';

/**
 * Routed page for the HYTE NP50. Exposes the two EEPROM-persisted
 * surfaces — default cooling behaviour + firmware-side LED animation —
 * that the cooling and lighting pages can't cleanly host because they
 * describe what the hub does when nexus ISN'T streaming (PC off, service
 * shut down, hub in BIOS).
 *
 * Connection model: the only authoritative "is the NP50 here?" answer
 * lives at `GET /devices/np50`. The two EEPROM reads can fail
 * transiently — most commonly with HTTP 409 mid-cooling-mode write, or
 * during the brief window before the heartbeat worker's first poll
 * completes — and we MUST NOT treat that as offline. Pinning the
 * placeholder to `connected === false` (never to a null EEPROM read)
 * is the whole of the offline-flash fix.
 */
export function Np50DevicePage() {
  // Tri-state: 'unknown' = still loading, 'connected' = hub up,
  // 'disconnected' = explicit not-connected response. The placeholder
  // only renders on the 'disconnected' arm.
  const [connection, setConnection] = useState<'unknown' | 'connected' | 'disconnected'>('unknown');
  const [defaults, setDefaults] = useState<Np50FirmwareDefaults | null>(null);
  const [animation, setAnimation] = useState<Np50FirmwareAnimation | null>(null);
  const [saving, setSaving] = useState(false);
  const aliveRef = useRef(true);

  const refresh = useCallback(async () => {
    // 1. Ask the service whether the hub is actually plugged in. This call
    //    never 409s — it just reports the cached state. A network failure
    //    (service down) returns null; treat that as "keep the prior state"
    //    so we don't flash the placeholder while a single poll fails.
    const conn = await getNp50ConnectionState();
    if (!aliveRef.current) return;
    if (conn === null) {
      // Service unreachable. Don't change connection state; the parent
      // ServiceRequired guard handles the no-service case at a higher
      // level. We just bail without touching anything user-visible.
      return;
    }
    if (!conn.connected) {
      setConnection('disconnected');
      setDefaults(null);
      setAnimation(null);
      return;
    }

    // 2. Hub is up. Issue both EEPROM reads, but treat individual nulls
    //    as transient — keep whatever we last loaded so the UI doesn't
    //    blink when one of the two reads fails (the other one usually
    //    succeeds and the next refresh fills the gap).
    setConnection('connected');
    const [d, a] = await Promise.all([
      getNp50FirmwareDefaults().catch(() => null),
      getNp50FirmwareAnimation().catch(() => null),
    ]);
    if (!aliveRef.current) return;
    if (d) setDefaults(d);
    if (a) setAnimation(a);
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

  const commitDefaults = useCallback(async (next: Np50FirmwareDefaults) => {
    setDefaults(next);
    setSaving(true);
    try {
      await setNp50FirmwareDefaults(next.defaultMode, next.staticFanPercent);
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, []);

  const commitAnimation = useCallback(async (next: Np50FirmwareAnimation) => {
    setAnimation(next);
    setSaving(true);
    try {
      await setNp50FirmwareAnimation(next);
    } finally {
      if (aliveRef.current) setSaving(false);
    }
  }, []);

  // Placeholder only renders when the service explicitly says the hub
  // is gone. A transient EEPROM null or a "still loading" state never
  // reaches this branch — bug 3 fix.
  if (connection === 'disconnected') {
    return (
      <div className={styles.page}>
        <ViewHeader title="HYTE NP50" />
        <div className={styles.pageBody}>
          <Placeholder title="HYTE NP50 not connected" />
        </div>
      </div>
    );
  }

  // While loading (connection === 'unknown') we still render the page
  // chrome but leave sections inert. Avoids a placeholder->page flash
  // on every nav-in.
  const defaultsLoaded = defaults !== null;
  const animationLoaded = animation !== null;
  const isStatic = defaults?.defaultMode === NP50_DEFAULT_MODE_STATIC;
  const animKind = animation?.animation ?? NP50_FW_ANIMATION_COLOR;
  const showColorPicker =
    animKind === NP50_FW_ANIMATION_COLOR || animKind === NP50_FW_ANIMATION_BREATHE;
  const hex = animation
    ? np50RgbToHex(animation.r, animation.g, animation.b)
    : '#ffffff';

  return (
    <div className={styles.page}>
      <ViewHeader
        title="HYTE NP50"
        actions={saving ? <span className={styles.savingBadge}>Saving…</span> : null}
      />
      <div className={styles.pageBody}>
        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Standalone fan behaviour</h2>
            <p className={styles.sectionHint}>
              Persisted to the hub's EEPROM. Used when Nexus isn't running —
              the PC is off, the service stopped, or the hub is in firmware
              control mode.
            </p>
          </header>
          <div className={`${styles.row} ${!defaultsLoaded ? styles.rowDisabled : ''}`}>
            <span className={styles.rowLabel}>Default mode</span>
            <Select
              value={String(defaults?.defaultMode ?? NP50_DEFAULT_MODE_STATIC)}
              onChange={v => {
                if (!defaults) return;
                const m = Number(v) as Np50DefaultMode;
                void commitDefaults({ ...defaults, defaultMode: m });
              }}
              options={[
                { value: String(NP50_DEFAULT_MODE_STATIC), label: 'Static setpoint' },
                { value: String(NP50_DEFAULT_MODE_MOTHERBOARD), label: 'Motherboard PWM' },
              ]}
              disabled={!defaultsLoaded}
              ariaLabel="NP50 default cooling mode"
            />
          </div>
          <div className={`${styles.row} ${!defaultsLoaded || !isStatic ? styles.rowDisabled : ''}`}>
            <span className={styles.rowLabel}>Static fan %</span>
            <Slider
              className={styles.slider}
              value={defaults?.staticFanPercent ?? 50}
              min={0}
              max={100}
              step={1}
              ariaLabel="Static fan percent"
              onChange={(v: number) => {
                if (!defaults) return;
                setDefaults({ ...defaults, staticFanPercent: Math.round(v) });
              }}
              onCommit={() => {
                if (defaults) void commitDefaults(defaults);
              }}
            />
            <span className={styles.rowValue}>{defaults?.staticFanPercent ?? 50}%</span>
          </div>
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Standalone LED animation</h2>
            <p className={styles.sectionHint}>
              What the connected light strips show when Nexus isn't
              streaming lighting frames.
            </p>
          </header>
          <div className={`${styles.row} ${!animationLoaded ? styles.rowDisabled : ''}`}>
            <span className={styles.rowLabel}>Effect</span>
            <Select
              value={String(animKind)}
              onChange={v => {
                if (!animation) return;
                const k = Number(v) as Np50FwAnimationKind;
                void commitAnimation({ ...animation, animation: k });
              }}
              options={[
                { value: String(NP50_FW_ANIMATION_COLOR), label: 'Solid color' },
                { value: String(NP50_FW_ANIMATION_RAINBOW), label: 'Rainbow cycle' },
                { value: String(NP50_FW_ANIMATION_BREATHE), label: 'Breathing' },
                { value: String(NP50_FW_ANIMATION_RAINBOW_GRADIENT), label: 'Rainbow gradient' },
              ]}
              disabled={!animationLoaded}
              ariaLabel="NP50 firmware animation"
            />
          </div>
          <div className={`${styles.row} ${!animationLoaded ? styles.rowDisabled : ''}`}>
            <span className={styles.rowLabel}>Brightness</span>
            <Slider
              className={styles.slider}
              value={animation?.brightness ?? 100}
              min={0}
              max={100}
              step={1}
              ariaLabel="Brightness"
              onChange={(v: number) => {
                if (!animation) return;
                setAnimation({ ...animation, brightness: Math.round(v) });
              }}
              onCommit={() => {
                if (animation) void commitAnimation(animation);
              }}
            />
            <span className={styles.rowValue}>{animation?.brightness ?? 100}%</span>
          </div>
          {showColorPicker && animationLoaded && (
            <div className={styles.colorBlock}>
              <HsvPicker
                value={hex}
                onPreview={(next: string) => {
                  if (!animation) return;
                  const { r, g, b } = np50HexToRgb(next);
                  setAnimation({ ...animation, r, g, b });
                }}
                onCommit={(next: string) => {
                  if (!animation) return;
                  const { r, g, b } = np50HexToRgb(next);
                  void commitAnimation({ ...animation, r, g, b });
                }}
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
