import { useState } from 'react';
import { Keyboard, Layers as LayersIcon } from 'lucide-react';
import { DeviceModal } from '../../common/DeviceModal/DeviceModal';
import { useKeeb } from '../../../hooks/useKeeb';
import { type KeebLayer, KEEB_LAYERS } from '../../../api/keeb';
import { KeebKeyboard } from './KeebKeyboard';
import { KeebSettingsView } from './KeebSettingsView';
import { KeebKeyAssignmentView } from './KeebKeyAssignmentView';
import { KeebRotaryView } from './KeebRotaryView';
import { KeebMacroView } from './KeebMacroView';
import { KeebTesterView } from './KeebTesterView';
import styles from './KeebDeviceModal.module.scss';

type Tab = 'key-assignment' | 'rotary' | 'macros' | 'tester' | 'settings';
const TABS: { id: Tab; label: string }[] = [
  { id: 'key-assignment', label: 'Key Assignment' },
  { id: 'rotary', label: 'Rotary' },
  { id: 'macros', label: 'Macros' },
  { id: 'tester', label: 'Tester' },
  { id: 'settings', label: 'Settings' },
];

export interface KeebDeviceModalProps {
  open: boolean;
  onClose: () => void;
}

/// Top-level keeb customization modal. Opened from the Devices view when the
/// user clicks the Keeb TKL card. Each tab body is rendered below the shared
/// keyboard render; layer chips appear above the keyboard on the Key
/// Assignment tab only (the spec calls for them there exclusively).
///
/// HID-coupled tabs (key assignment, rotary, macros, tester) currently render
/// against the persistence-only stub provider — their writes round-trip
/// through `IConfigStore` so the UI is functional offline; once the HID
/// driver lands, the same writes also reach the firmware.
export function KeebDeviceModal({ open, onClose }: KeebDeviceModalProps) {
  const [tab, setTab] = useState<Tab>('key-assignment');
  const keeb = useKeeb(open);

  // Per-tab UI state that doesn't belong in the hook:
  // - `selected`: which physical key the user clicked, drives Key Assignment writes.
  // - `wheel`: which rotary the user is editing, set via the wheel buttons in the keyboard render.
  // - `rotary`/`sensitivity`: rotary state isn't on the GET /keeb/settings response yet,
  //   so we keep a local optimistic copy until the backend exposes it.
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [wheel, setWheel] = useState<'left' | 'right'>('left');
  const [rotaryLeft, setRotaryLeft] = useState('VolumeAdjustment');
  const [rotaryRight, setRotaryRight] = useState('ScrollY');
  const [sensitivity, setSensitivity] = useState('Balanced');

  const onLayerChange = (next: KeebLayer) => {
    keeb.setLayer(next);
    setSelected(null);
  };

  const offlineCopy = keeb.state.isConnected
    ? undefined
    : 'Connect your Keeb TKL — the settings tab still works offline.';

  const onKeyClick = tab === 'key-assignment' ? (x: number, y: number) => setSelected({ x, y }) : undefined;
  const onWheelFocus = tab === 'rotary' ? (side: 'left' | 'right') => setWheel(side) : undefined;

  return (
    <DeviceModal
      open={open}
      onClose={onClose}
      title={keeb.state.isConnected ? 'Keeb TKL' : 'Keeb TKL (offline)'}
      icon={<Keyboard size={20} />}
      fullscreen
      headerRight={tab === 'key-assignment' ? (
        <div className={styles.layerChips} aria-label="Layer">
          <LayersIcon size={14} className={styles.layerChipsIcon} aria-hidden="true" />
          {KEEB_LAYERS.map(l => (
            <button
              key={l}
              type="button"
              className={`${styles.layerChip} ${keeb.layer === l ? styles.layerChipActive : ''}`}
              onClick={() => onLayerChange(l)}
              aria-pressed={keeb.layer === l}
            >
              {l + 1}
            </button>
          ))}
        </div>
      ) : undefined}
    >
      <div className={styles.modalBody}>
        <nav className={styles.tabBar} role="tablist">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={`${styles.tab} ${tab === id ? styles.tabActive : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className={styles.keyboardStage}>
          <KeebKeyboard
            state={keeb.state}
            offlineCopy={tab !== 'settings' ? offlineCopy : undefined}
            disabled={tab !== 'key-assignment' && tab !== 'rotary'}
            onKeyClick={onKeyClick}
            selected={tab === 'key-assignment' ? selected : null}
            onWheelFocus={onWheelFocus}
            focusedWheel={tab === 'rotary' ? wheel : null}
          />
        </div>

        <div className={styles.tabBody}>
          {tab === 'settings' && (
            <KeebSettingsView
              settings={keeb.settings}
              onSaveFirmwareLighting={keeb.saveFirmwareLighting}
              onSavePassiveLighting={keeb.savePassiveLighting}
              onSaveGameMode={keeb.saveGameMode}
            />
          )}
          {tab === 'key-assignment' && (
            <KeebKeyAssignmentView
              selected={selected}
              setKey={keeb.setKey}
              resetLayer={keeb.resetLayer}
            />
          )}
          {tab === 'rotary' && (
            <KeebRotaryView
              wheel={wheel}
              left={rotaryLeft}
              right={rotaryRight}
              sensitivity={sensitivity}
              onSetRotary={async body => {
                setRotaryLeft(body.left);
                setRotaryRight(body.right);
                await keeb.saveRotary(body);
              }}
              onSetSensitivity={async s => {
                setSensitivity(s);
                await keeb.saveRotarySensitivity(s);
              }}
            />
          )}
          {tab === 'macros' && (
            <KeebMacroView open={open} />
          )}
          {tab === 'tester' && (
            <KeebTesterView open={open && tab === 'tester'} />
          )}
        </div>
      </div>
    </DeviceModal>
  );
}
