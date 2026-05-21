import { useState } from 'react';
import { Keyboard, Layers as LayersIcon } from 'lucide-react';
import { DeviceModal } from '../../common/DeviceModal/DeviceModal';
import { IconLabelButton } from '../../common/IconLabelButton/IconLabelButton';
import { Tabs, type TabDef } from '../../common/Tabs/Tabs';
import { useKeeb } from '../../../hooks/useKeeb';
import { type KeebLayer, KEEB_LAYERS } from '../../../api/keeb';
import { KeebKeyboard, type KeebSelection } from './KeebKeyboard';
import { KeebSettingsView } from './KeebSettingsView';
import { KeebKeyAssignmentView } from './KeebKeyAssignmentView';
import { KeebRotaryView } from './KeebRotaryView';
import { KeebMacroView } from './KeebMacroView';
import { KeebTesterView } from './KeebTesterView';
import styles from './KeebDeviceModal.module.scss';

type Tab = 'key-assignment' | 'macros' | 'tester' | 'settings';
const TAB_DEFS: readonly TabDef[] = [
  { key: 'key-assignment', label: 'Key Assignment' },
  { key: 'macros', label: 'Macros' },
  { key: 'tester', label: 'Tester' },
  { key: 'settings', label: 'Settings' },
] as const;

export interface KeebDeviceModalProps {
  open: boolean;
  onClose: () => void;
}

/// Top-level keeb customization modal. Opened from the Devices view when the
/// user clicks the Keeb TKL card.
///
/// Rotary assignment lives inside Key Assignment instead of a separate tab:
/// the user clicks a key on the keyboard render → function-category picker,
/// or clicks one of the two rotary wheels (rendered on the top row of the
/// keyboard graphic) → rotary-function picker. Same surface, two modes,
/// driven by which thing the user selected.
///
/// HID-coupled tabs (key assignment, macros, tester) round-trip writes through
/// the persistence layer when no keeb is attached so the UI is always usable.
export function KeebDeviceModal({ open, onClose }: KeebDeviceModalProps) {
  const [tab, setTab] = useState<Tab>('key-assignment');
  const keeb = useKeeb(open);

  // Unified selection: either a physical key or one of the two rotary
  // wheels. Drives what the Key Assignment tab renders below the keyboard.
  const [selected, setSelected] = useState<KeebSelection>(null);

  // Rotary state isn't on /keeb/settings yet, so we keep a local optimistic
  // copy until the backend exposes it. Defaults match the legacy nexus app.
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

  // Only the Key Assignment tab acts on the keyboard render; Tester just
  // displays it. Macros and Settings hide it entirely.
  const showKeyboard = tab === 'key-assignment' || tab === 'tester';
  const keyboardInteractive = tab === 'key-assignment';

  return (
    <DeviceModal
      open={open}
      onClose={onClose}
      title={keeb.state.isConnected ? 'Keeb TKL' : 'Keeb TKL (offline)'}
      icon={<Keyboard size={20} />}
      fullscreen
    >
      <div className={styles.modalBody}>
        <div className={styles.tabsRow}>
          <Tabs
            tabs={TAB_DEFS}
            activeKey={tab}
            onChange={k => setTab(k as Tab)}
            ariaLabel="Keeb sections"
            className={styles.tabsFill}
          />
          {tab === 'key-assignment' && (
            <div className={styles.layerChips} aria-label="Layer">
              <LayersIcon size={14} className={styles.layerChipsIcon} aria-hidden="true" />
              {KEEB_LAYERS.map(l => (
                <IconLabelButton
                  key={l}
                  label={(l + 1).toString()}
                  active={keeb.layer === l}
                  ariaLabel={`Layer ${l + 1}`}
                  className={styles.layerChip}
                  onPress={() => onLayerChange(l)}
                />
              ))}
            </div>
          )}
        </div>

        {showKeyboard && (
          <div className={styles.keyboardStage}>
            <KeebKeyboard
              state={keeb.state}
              offlineCopy={offlineCopy}
              disabled={!keyboardInteractive}
              onSelect={keyboardInteractive ? setSelected : undefined}
              selected={keyboardInteractive ? selected : null}
            />
          </div>
        )}

        <div className={styles.tabBody}>
          {tab === 'key-assignment' && selected?.kind === 'wheel' && (
            <KeebRotaryView
              wheel={selected.side}
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
          {tab === 'key-assignment' && selected?.kind !== 'wheel' && (
            <KeebKeyAssignmentView
              selected={selected?.kind === 'key' ? { x: selected.x, y: selected.y } : null}
              state={keeb.state}
              setKey={keeb.setKey}
              resetLayer={keeb.resetLayer}
            />
          )}
          {tab === 'macros' && <KeebMacroView open={open} />}
          {tab === 'tester' && <KeebTesterView open={open && tab === 'tester'} />}
          {tab === 'settings' && (
            <KeebSettingsView
              settings={keeb.settings}
              onSaveFirmwareLighting={keeb.saveFirmwareLighting}
              onSavePassiveLighting={keeb.savePassiveLighting}
              onSaveGameMode={keeb.saveGameMode}
            />
          )}
        </div>
      </div>
    </DeviceModal>
  );
}
