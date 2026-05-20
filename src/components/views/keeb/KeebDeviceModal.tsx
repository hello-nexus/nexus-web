import { useState } from 'react';
import { Keyboard, Layers as LayersIcon } from 'lucide-react';
import { DeviceModal } from '../../common/DeviceModal/DeviceModal';
import { useKeeb } from '../../../hooks/useKeeb';
import { type KeebLayer, KEEB_LAYERS } from '../../../api/keeb';
import { KeebKeyboard } from './KeebKeyboard';
import { KeebSettingsView } from './KeebSettingsView';
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

  const onLayerChange = (next: KeebLayer) => keeb.setLayer(next);

  const offlineCopy = keeb.state.isConnected
    ? undefined
    : 'Connect your Keeb TKL — the settings tab still works offline.';

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
            disabled={tab !== 'key-assignment'}
            // selection + click handlers come in Phase 3 when the assignment
            // categories grid lands underneath
            onKeyClick={undefined}
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
            <div className={styles.tabPlaceholder}>
              Key assignment categories land in the next pass. The keyboard
              render above is wired to your layer state already.
            </div>
          )}
          {tab === 'rotary' && (
            <div className={styles.tabPlaceholder}>Rotary assignment UI — coming in the next pass.</div>
          )}
          {tab === 'macros' && (
            <div className={styles.tabPlaceholder}>Macro recorder — coming in the next pass.</div>
          )}
          {tab === 'tester' && (
            <div className={styles.tabPlaceholder}>Key tester — lands with the HID driver (needs live key events).</div>
          )}
        </div>
      </div>
    </DeviceModal>
  );
}
