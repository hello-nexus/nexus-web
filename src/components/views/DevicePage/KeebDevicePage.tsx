import { useState } from 'react';
import { Layers as LayersIcon } from 'lucide-react';
import { IconLabelButton } from '../../common/IconLabelButton/IconLabelButton';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { useKeeb } from '../../../hooks/useKeeb';
import { type KeebLayer, KEEB_LAYERS } from '../../../api/keeb';
import { KeebKeyboard, type KeebSelection } from '../keeb/KeebKeyboard';
import { KeebSettingsView } from '../keeb/KeebSettingsView';
import { KeebKeyAssignmentView } from '../keeb/KeebKeyAssignmentView';
import { KeebRotaryView } from '../keeb/KeebRotaryView';
import { KeebMacroView } from '../keeb/KeebMacroView';
import { KeebTesterView } from '../keeb/KeebTesterView';
import keebStyles from '../keeb/KeebDeviceModal.module.scss';
import pageStyles from './KeebDevicePage.module.scss';

/**
 * Routed keeb customization page (ViewHeader + section chrome). The
 * DevicePage dispatcher routes here for the curated `keeb` device. Holds
 * the keeb body's local state (selected key, rotary mode, sensitivity)
 * and the useKeeb hook.
 */
type Tab = 'key-assignment' | 'macros' | 'tester' | 'settings';

const TABS = [
  { key: 'key-assignment', label: 'Key Assignment' },
  { key: 'macros', label: 'Macros' },
  { key: 'tester', label: 'Tester' },
  { key: 'settings', label: 'Settings' },
] as const;

export function KeebDevicePage() {
  const [tab, setTab] = useState<Tab>('key-assignment');
  // useKeeb's `open` flag means "stay subscribed". On a routed page
  // the component lives only while the user is on the page, so we
  // pass true throughout — unmount tears the subscription down.
  const keeb = useKeeb(true);

  const [selected, setSelected] = useState<KeebSelection>(null);
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

  const showKeyboard = tab === 'key-assignment' || tab === 'tester';
  const keyboardInteractive = tab === 'key-assignment';

  const title = keeb.state.isConnected ? 'Keeb TKL' : 'Keeb TKL (offline)';

  return (
    <section className={pageStyles.page}>
      <ViewHeader
        title={title}
        tabs={TABS}
        activeTab={tab}
        onTabChange={(k) => setTab(k as Tab)}
        tabActions={tab === 'key-assignment' ? (
          <div className={keebStyles.layerChips} aria-label="Layer">
            <LayersIcon size={14} className={keebStyles.layerChipsIcon} aria-hidden="true" />
            {KEEB_LAYERS.map(l => (
              <IconLabelButton
                key={l}
                label={(l + 1).toString()}
                active={keeb.layer === l}
                ariaLabel={`Layer ${l + 1}`}
                className={keebStyles.layerChip}
                onPress={() => onLayerChange(l)}
              />
            ))}
          </div>
        ) : undefined}
      />
      <div className={pageStyles.pageBody}>
        {showKeyboard && (
          <div className={keebStyles.keyboardStage}>
            <KeebKeyboard
              state={keeb.state}
              offlineCopy={offlineCopy}
              disabled={!keyboardInteractive}
              onSelect={keyboardInteractive ? setSelected : undefined}
              selected={keyboardInteractive ? selected : null}
            />
          </div>
        )}

        <div className={keebStyles.tabBody}>
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
          {tab === 'macros' && <KeebMacroView open />}
          {tab === 'tester' && <KeebTesterView open={tab === 'tester'} />}
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
    </section>
  );
}

export default KeebDevicePage;
