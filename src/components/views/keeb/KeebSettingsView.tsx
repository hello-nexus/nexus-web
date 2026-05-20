import { useCallback, useEffect, useState } from 'react';
import type { KeebSettings, RGBA } from '../../../api/keeb';
import { Select } from '../../common/Select/Select';
import { Slider } from '../../common/Slider/Slider';
import { Toggle } from '../../common/Toggle/Toggle';
import styles from './KeebSettingsView.module.scss';

const FW_EFFECTS = ['Static', 'Breathe', 'Rainbow', 'Wave', 'Flow', 'PingPong'];
const FW_SPEEDS = ['Slow', 'LaidBack', 'Standard', 'Energetic', 'Rapid'];
const FW_DIRECTIONS = ['LeftToRight', 'RightToLeft', 'TopToBottom', 'BottomToTop'];
const KEY_REACTIVE_MODES = ['SingleKey', 'HorizontalLine', 'VerticalLine', 'Ripple'];

export interface KeebSettingsViewProps {
  settings: KeebSettings | null;
  onSaveFirmwareLighting: (next: Pick<KeebSettings, 'animationMode' | 'speed' | 'direction' | 'brightness' | 'keyIndicator'>) => Promise<void>;
  onSavePassiveLighting: (next: Pick<KeebSettings, 'keyReactive' | 'keyReactiveMask' | 'keyReactiveMode' | 'keyReactiveColor'>) => Promise<void>;
  onSaveGameMode: (body: { altF4: boolean; altTab: boolean; shiftTab: boolean; windowsKey: boolean }) => Promise<void>;
}

/// Settings tab: firmware lighting, passive (key-reactive) overlay, game mode.
/// Every change writes through to the persistence layer immediately so the
/// next service start picks them up; when the HID driver lands the same calls
/// will reach the firmware in the same write.
export function KeebSettingsView({
  settings,
  onSaveFirmwareLighting,
  onSavePassiveLighting,
  onSaveGameMode,
}: KeebSettingsViewProps) {
  // Mirror server state locally so sliders feel instant. We push through to
  // the server on commit (slider release / select change).
  const [local, setLocal] = useState<KeebSettings | null>(settings);

  // Re-sync whenever the server-side fetch refreshes.
  useEffect(() => { setLocal(settings); }, [settings]);

  const setLocalField = useCallback(<K extends keyof KeebSettings>(key: K, value: KeebSettings[K]) => {
    setLocal(prev => prev ? { ...prev, [key]: value } : prev);
  }, []);

  if (!local) {
    return <div className={styles.loading}>Loading…</div>;
  }

  const pushFw = (patch: Partial<KeebSettings>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    void onSaveFirmwareLighting({
      animationMode: next.animationMode,
      speed: next.speed,
      direction: next.direction,
      brightness: next.brightness,
      keyIndicator: next.keyIndicator,
    });
  };

  const pushPassive = (patch: Partial<KeebSettings>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    void onSavePassiveLighting({
      keyReactive: next.keyReactive,
      keyReactiveMask: next.keyReactiveMask,
      keyReactiveMode: next.keyReactiveMode,
      keyReactiveColor: next.keyReactiveColor,
    });
  };

  const pushGameMode = (patch: Partial<Pick<KeebSettings, 'altF4Disabled' | 'altTabDisabled' | 'shiftKeyDisabled' | 'windowsKeyDisabled'>>) => {
    const next = { ...local, ...patch };
    setLocal(next);
    void onSaveGameMode({
      altF4: next.altF4Disabled,
      altTab: next.altTabDisabled,
      shiftTab: next.shiftKeyDisabled,
      windowsKey: next.windowsKeyDisabled,
    });
  };

  return (
    <div className={styles.grid}>
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Firmware Lighting</h3>
        <p className={styles.sectionHint}>
          Applies on the keyboard itself when qos isn't actively driving the LEDs.
        </p>

        <Row label="Effect">
          <Select
            value={local.animationMode}
            onChange={v => pushFw({ animationMode: v })}
            options={FW_EFFECTS.map(e => ({ value: e, label: e }))}
            ariaLabel="Firmware lighting effect"
            size="sm"
          />
        </Row>

        <Row label="Speed">
          <Select
            value={local.speed}
            onChange={v => pushFw({ speed: v })}
            options={FW_SPEEDS.map(s => ({ value: s, label: s }))}
            ariaLabel="Firmware lighting speed"
            size="sm"
          />
        </Row>

        <Row label="Brightness">
          <Slider
            min={0}
            max={100}
            value={local.brightness}
            onChange={(v, commit) => {
              setLocalField('brightness', v);
              if (commit) pushFw({ brightness: v });
            }}
            ariaLabel="Firmware lighting brightness"
            formatValue={v => `${v}%`}
          />
        </Row>

        <Row label="Direction">
          <div className={styles.buttonRow}>
            {FW_DIRECTIONS.map(dir => (
              <button
                key={dir}
                type="button"
                className={`${styles.directionBtn} ${local.direction === dir ? styles.directionBtnActive : ''}`}
                onClick={() => pushFw({ direction: dir })}
                aria-pressed={local.direction === dir}
                title={dir}
              >
                {dirGlyph(dir)}
              </button>
            ))}
          </div>
        </Row>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Passive Lighting</h3>
        <p className={styles.sectionHint}>
          Reacts to keypresses on top of (or as a mask over) the firmware effect.
        </p>

        <Row label="Type Reactive">
          <Toggle
            checked={local.keyReactive}
            onChange={v => pushPassive({ keyReactive: v, keyReactiveMask: v ? local.keyReactiveMask : false })}
            ariaLabel="Type Reactive"
          />
        </Row>

        {local.keyReactive && (
          <>
            <Row label="Mask Effect">
              <Toggle
                checked={local.keyReactiveMask}
                onChange={v => pushPassive({ keyReactiveMask: v })}
                ariaLabel="Mask over lighting effect"
              />
            </Row>
            <Row label="Mode">
              <Select
                value={local.keyReactiveMode}
                onChange={v => pushPassive({ keyReactiveMode: v })}
                options={KEY_REACTIVE_MODES.map(m => ({ value: m, label: m }))}
                ariaLabel="Reactive mode"
                size="sm"
              />
            </Row>
            <Row label="Color">
              <ColorInput
                value={local.keyReactiveColor}
                onChange={c => pushPassive({ keyReactiveColor: c })}
              />
            </Row>
          </>
        )}
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Game Mode</h3>
        <p className={styles.sectionHint}>
          Disable accidental escape-from-game keys at the firmware level.
        </p>

        <Row label="Disable ALT+F4">
          <Toggle checked={local.altF4Disabled} onChange={v => pushGameMode({ altF4Disabled: v })} ariaLabel="Disable ALT F4" />
        </Row>
        <Row label="Disable ALT+Tab">
          <Toggle checked={local.altTabDisabled} onChange={v => pushGameMode({ altTabDisabled: v })} ariaLabel="Disable ALT Tab" />
        </Row>
        <Row label="Disable Shift+Tab">
          <Toggle checked={local.shiftKeyDisabled} onChange={v => pushGameMode({ shiftKeyDisabled: v })} ariaLabel="Disable Shift Tab" />
        </Row>
        <Row label="Disable Windows Key">
          <Toggle checked={local.windowsKeyDisabled} onChange={v => pushGameMode({ windowsKeyDisabled: v })} ariaLabel="Disable Windows Key" />
        </Row>
      </section>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowControl}>{children}</span>
    </div>
  );
}

function dirGlyph(dir: string): string {
  switch (dir) {
    case 'LeftToRight': return '→';
    case 'RightToLeft': return '←';
    case 'TopToBottom': return '↓';
    case 'BottomToTop': return '↑';
    default: return dir;
  }
}

function ColorInput({ value, onChange }: { value: RGBA; onChange: (c: RGBA) => void }) {
  const hex = rgbToHex(value);
  return (
    <input
      type="color"
      value={hex}
      className={styles.colorPicker}
      onChange={e => onChange(hexToRgba(e.target.value, value.a))}
      aria-label="Reactive color"
    />
  );
}

function rgbToHex(c: RGBA): string {
  const n = (v: number) => v.toString(16).padStart(2, '0');
  return `#${n(c.r)}${n(c.g)}${n(c.b)}`;
}

function hexToRgba(hex: string, a: number): RGBA {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return { r, g, b, a };
}
