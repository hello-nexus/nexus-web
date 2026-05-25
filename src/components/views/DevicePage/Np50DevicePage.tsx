import { useCallback, useEffect, useState } from 'react';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { Placeholder } from '../Placeholder';
import { Select } from '../../common/Select/Select';
import { Slider } from '../../common/Slider/Slider';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { IconLabelButton } from '../../common/IconLabelButton/IconLabelButton';
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

const DEFAULT_FAN_PERCENT = 50;
const DEFAULT_BRIGHTNESS = 100;

const DEFAULT_MODE_OPTIONS: { value: string; label: string }[] = [
  { value: String(NP50_DEFAULT_MODE_STATIC), label: 'Stored fan setpoint' },
  { value: String(NP50_DEFAULT_MODE_MOTHERBOARD), label: 'Motherboard passthrough' },
];

const ANIMATION_OPTIONS: { value: string; label: string }[] = [
  { value: String(NP50_FW_ANIMATION_COLOR), label: 'Static color' },
  { value: String(NP50_FW_ANIMATION_RAINBOW), label: 'Rainbow' },
  { value: String(NP50_FW_ANIMATION_BREATHE), label: 'Breathe' },
  { value: String(NP50_FW_ANIMATION_RAINBOW_GRADIENT), label: 'Rainbow gradient' },
];

/**
 * Routed page for the HYTE NP50 hub. Exposes the EEPROM-persisted
 * "what the device does when nexus isn't streaming" surface — default
 * fan-control mode + stored speed setpoint + standalone LED animation.
 * Live control-mode switching lives on the cooling page, where each
 * connected hub gets its own dropdown; firmware updates live on the
 * Devices page once the in-app flasher lands.
 */
export function Np50DevicePage() {
  const [defaults, setDefaults] = useState<Np50FirmwareDefaults | null>(null);
  const [animation, setAnimation] = useState<Np50FirmwareAnimation | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [saving, setSaving] = useState(false);

  // Authoritative connection check separate from the firmware reads. A
  // transient 409 ("NP50 not connected" — fires when a mode write is in
  // flight, or when the heartbeat hasn't completed its first poll yet)
  // would otherwise null out both EEPROM reads and latch the page into
  // the placeholder even though the hub is up. Pinning offline state to
  // the explicit connection-state endpoint means a single failed
  // firmware-defaults read doesn't yank the controls out from under the
  // user.
  const reload = useCallback(async () => {
    setLoading(true);
    const conn = await getNp50ConnectionState();
    if (conn && !conn.connected) {
      setDefaults(null);
      setAnimation(null);
      setOffline(true);
      setLoading(false);
      return;
    }
    const [d, a] = await Promise.all([
      getNp50FirmwareDefaults(),
      getNp50FirmwareAnimation(),
    ]);
    if (d) setDefaults(d);
    if (a) setAnimation(a);
    // If the service confirmed connected but the EEPROM reads transiently
    // failed, keep the page in its "have data" state (showing whatever
    // we last loaded) instead of flashing the placeholder.
    setOffline(conn == null);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
    // Refetch when the user re-focuses the window — covers the case where
    // the hub was unplugged + replugged while the page was hidden, and a
    // light auto-recovery for the transient 409 case.
    const onFocus = () => { void reload(); };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [reload]);

  const commitDefaults = useCallback(async (next: Np50FirmwareDefaults) => {
    setDefaults(next);
    setSaving(true);
    try {
      await setNp50FirmwareDefaults(next.defaultMode, next.staticFanPercent);
    } finally {
      setSaving(false);
    }
  }, []);

  const commitAnimation = useCallback(async (next: Np50FirmwareAnimation) => {
    setAnimation(next);
    setSaving(true);
    try {
      await setNp50FirmwareAnimation(next);
    } finally {
      setSaving(false);
    }
  }, []);

  return (
    <section className={styles.page}>
      <ViewHeader
        title="HYTE NP50"
        titleTooltip="Firmware settings that run when Nexus isn't driving the hub."
        actions={saving ? <span className={styles.savingBadge}>Saving…</span> : undefined}
      />
      <div className={styles.pageBody}>
        {offline ? (
          <Placeholder title="NP50 not connected" />
        ) : (
          <>
            <DefaultsSection
              loading={loading}
              defaults={defaults}
              onCommit={commitDefaults} />
            <AnimationSection
              loading={loading}
              animation={animation}
              onCommit={commitAnimation} />
          </>
        )}
      </div>
    </section>
  );
}

interface DefaultsSectionProps {
  loading: boolean;
  defaults: Np50FirmwareDefaults | null;
  onCommit: (next: Np50FirmwareDefaults) => void;
}

function DefaultsSection({ loading, defaults, onCommit }: DefaultsSectionProps) {
  // Local "in-flight" fan-percent so dragging the slider feels live without
  // hitting the wire on every tick. Cleared on commit so the slider reads
  // straight from props again once the hub state has updated.
  const [localPercent, setLocalPercent] = useState<number | null>(null);
  const fanPercent = localPercent ?? defaults?.staticFanPercent ?? DEFAULT_FAN_PERCENT;
  const mode = defaults?.defaultMode ?? NP50_DEFAULT_MODE_STATIC;
  const isStatic = mode === NP50_DEFAULT_MODE_STATIC;

  const handleModeChange = (raw: string) => {
    if (!defaults) return;
    const next = Number(raw) as Np50DefaultMode;
    onCommit({ ...defaults, defaultMode: next });
  };

  const handlePercentChange = (next: number) => {
    setLocalPercent(next);
  };

  const handlePercentCommit = (next: number) => {
    if (!defaults) return;
    setLocalPercent(null);
    onCommit({ ...defaults, staticFanPercent: Math.round(next) });
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Standalone fan control</h2>
        <p className={styles.sectionHint}>
          What the hub does when Nexus isn't streaming — PC off, service
          down, or the cooling page is set to <em>Firmware Control</em>.
        </p>
      </div>

      <div className={styles.row}>
        <label className={styles.rowLabel} htmlFor="np50-default-mode">When idle</label>
        <Select
          value={String(mode)}
          onChange={handleModeChange}
          options={DEFAULT_MODE_OPTIONS}
          disabled={loading || !defaults}
          ariaLabel="Default cooling mode" />
      </div>

      <div className={`${styles.row} ${!isStatic ? styles.rowDisabled : ''}`}>
        <label className={styles.rowLabel}>Stored fan speed</label>
        <Slider
          value={Math.round(fanPercent)}
          min={0}
          max={100}
          step={1}
          orientation="bare"
          trackFill
          disabled={loading || !defaults || !isStatic}
          onChange={handlePercentChange}
          onCommit={handlePercentCommit}
          ariaLabel="Stored fan speed percent"
          className={styles.slider} />
        <span className={styles.rowValue}>{Math.round(fanPercent)}%</span>
      </div>

      {isStatic && defaults && (
        <div className={styles.rowActions}>
          <IconLabelButton
            label="Reset to 50%"
            disabled={Math.round(fanPercent) === DEFAULT_FAN_PERCENT}
            onPress={() => onCommit({ ...defaults, staticFanPercent: DEFAULT_FAN_PERCENT })} />
        </div>
      )}
    </div>
  );
}

interface AnimationSectionProps {
  loading: boolean;
  animation: Np50FirmwareAnimation | null;
  onCommit: (next: Np50FirmwareAnimation) => void;
}

function AnimationSection({ loading, animation, onCommit }: AnimationSectionProps) {
  const [localBrightness, setLocalBrightness] = useState<number | null>(null);
  const brightness = localBrightness ?? animation?.brightness ?? DEFAULT_BRIGHTNESS;
  const kind = (animation?.animation ?? NP50_FW_ANIMATION_COLOR) as Np50FwAnimationKind;
  const isColor = kind === NP50_FW_ANIMATION_COLOR;
  const colorHex = animation
    ? np50RgbToHex(animation.r, animation.g, animation.b)
    : '#ffffff';

  const handleKindChange = (raw: string) => {
    if (!animation) return;
    const next = Number(raw) as Np50FwAnimationKind;
    onCommit({ ...animation, animation: next });
  };

  const handleBrightnessChange = (next: number) => {
    setLocalBrightness(next);
  };

  const handleBrightnessCommit = (next: number) => {
    if (!animation) return;
    setLocalBrightness(null);
    onCommit({ ...animation, brightness: Math.round(next) });
  };

  const handleColorPreview = (hex: string) => {
    if (!animation) return;
    const { r, g, b } = np50HexToRgb(hex);
    // Preview-only — don't write while the user is dragging the SV square.
    // The Slider/HsvPicker contracts use onCommit for persistence.
    void { r, g, b };
  };

  const handleColorCommit = (hex: string) => {
    if (!animation) return;
    const { r, g, b } = np50HexToRgb(hex);
    onCommit({ ...animation, r, g, b });
  };

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Standalone lighting</h2>
        <p className={styles.sectionHint}>
          Built-in LED animation the hub plays when it isn't receiving
          frames from the Nexus lighting engine.
        </p>
      </div>

      <div className={styles.row}>
        <label className={styles.rowLabel} htmlFor="np50-fw-animation">Effect</label>
        <Select
          value={String(kind)}
          onChange={handleKindChange}
          options={ANIMATION_OPTIONS}
          disabled={loading || !animation}
          ariaLabel="Firmware lighting effect" />
      </div>

      <div className={styles.row}>
        <label className={styles.rowLabel}>Brightness</label>
        <Slider
          value={Math.round(brightness)}
          min={0}
          max={100}
          step={1}
          orientation="bare"
          trackFill
          disabled={loading || !animation}
          onChange={handleBrightnessChange}
          onCommit={handleBrightnessCommit}
          ariaLabel="Firmware brightness percent"
          className={styles.slider} />
        <span className={styles.rowValue}>{Math.round(brightness)}%</span>
      </div>

      {isColor && animation && (
        <div className={styles.colorBlock}>
          <label className={styles.rowLabel}>Static color</label>
          <HsvPicker
            value={colorHex}
            onPreview={handleColorPreview}
            onCommit={handleColorCommit} />
        </div>
      )}
    </div>
  );
}

export default Np50DevicePage;
