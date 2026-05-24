import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from 'lucide-react';
import type { KeebSettings, RGBA } from '../../../api/keeb';
import { Card } from '../../common/Card/Card';
import { HsvPicker } from '../../common/HsvPicker/HsvPicker';
import { IconLabelButton } from '../../common/IconLabelButton/IconLabelButton';
import { Select } from '../../common/Select/Select';
import { Slider } from '../../common/Slider/Slider';
import { Toggle } from '../../common/Toggle/Toggle';
import styles from './KeebSettingsView.module.scss';

const FW_EFFECTS = ['Static', 'Breathe', 'Rainbow', 'Wave', 'Flow', 'PingPong'];
const FW_SPEEDS = ['Slow', 'LaidBack', 'Standard', 'Energetic', 'Rapid'];
const KEY_REACTIVE_MODES = ['SingleKey', 'HorizontalLine', 'VerticalLine', 'Ripple'];

const DIRECTIONS: { value: string; icon: ReactNode; aria: string }[] = [
  { value: 'LeftToRight', icon: <ArrowRight size={16} aria-hidden="true" />, aria: 'Left to right' },
  { value: 'RightToLeft', icon: <ArrowLeft size={16} aria-hidden="true" />, aria: 'Right to left' },
  { value: 'TopToBottom', icon: <ArrowDown size={16} aria-hidden="true" />, aria: 'Top to bottom' },
  { value: 'BottomToTop', icon: <ArrowUp size={16} aria-hidden="true" />, aria: 'Bottom to top' },
];

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
      <Card title="Firmware Lighting" subtitle="Applies on the keyboard itself when nexus isn't actively driving the LEDs.">
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
          <div className={styles.iconGroup}>
            {DIRECTIONS.map(d => (
              <IconLabelButton
                key={d.value}
                icon={d.icon}
                active={local.direction === d.value}
                ariaLabel={d.aria}
                title={d.value}
                onPress={() => pushFw({ direction: d.value })}
              />
            ))}
          </div>
        </Row>
      </Card>

      <Card title="Passive Lighting" subtitle="Reacts to keypresses on top of (or as a mask over) the firmware effect.">
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
              <HsvPicker
                value={rgbToHex(local.keyReactiveColor)}
                onPreview={hex => setLocalField('keyReactiveColor', hexToRgba(hex, local.keyReactiveColor.a))}
                onCommit={hex => pushPassive({ keyReactiveColor: hexToRgba(hex, local.keyReactiveColor.a) })}
              />
            </Row>
          </>
        )}
      </Card>

      <Card title="Game Mode" subtitle="Disable accidental escape-from-game keys at the firmware level.">
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
      </Card>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowControl}>{children}</span>
    </div>
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
