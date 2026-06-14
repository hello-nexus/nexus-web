import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Layers as LayersIcon, Keyboard, Repeat, Activity, Settings } from 'lucide-react';
import { IconLabelButton } from '../../common/IconLabelButton/IconLabelButton';
import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { useToast } from '../../common/Toast/Toast';
import { useTranslation } from '../../../lib/i18n';
import { useKeeb } from '../../../hooks/useKeeb';
import { type KeebLayer, KEEB_LAYERS } from '../../../api/keeb';
import { KEEB_RENDER_WIDTH, KeebKeyboard, type KeebSelection } from '../keeb/KeebKeyboard';
import { useFitZoom } from '../keeb/useFitZoom';
import { KeebSettingsView } from '../keeb/KeebSettingsView';
import { KeebKeyAssignmentView } from '../keeb/KeebKeyAssignmentView';
import { KeebRotaryView } from '../keeb/KeebRotaryView';
import { KeebMacroView } from '../keeb/KeebMacroView';
import { KeebTesterView } from '../keeb/KeebTesterView';
import pageStyles from './KeebDevicePage.module.scss';

/**
 * Routed keeb customization page (ViewHeader + section chrome). The
 * DevicePage dispatcher routes here for the curated `keeb` device. Holds
 * the keeb body's local state (selected key, rotary mode, sensitivity)
 * and the useKeeb hook.
 */
type Tab = 'key-assignment' | 'macros' | 'tester' | 'settings';

const TAB_KEYS: readonly { key: Tab; labelKey: string; icon: ReactNode }[] = [
  { key: 'key-assignment', labelKey: 'keeb.tab.keyAssignment', icon: <Keyboard size={14} /> },
  { key: 'macros', labelKey: 'keeb.tab.macros', icon: <Repeat size={14} /> },
  { key: 'tester', labelKey: 'keeb.tab.tester', icon: <Activity size={14} /> },
  { key: 'settings', labelKey: 'keeb.tab.settings', icon: <Settings size={14} /> },
];

export function KeebDevicePage() {
  const [tab, setTab] = useState<Tab>('key-assignment');
  const { t } = useTranslation();
  const { push } = useToast();
  // useKeeb's `open` flag means "stay subscribed". On a routed page
  // the component lives only while the user is on the page, so we
  // pass true throughout - unmount tears the subscription down.
  const keeb = useKeeb(true);

  const [selected, setSelected] = useState<KeebSelection>(null);
  const [rotaryLeft, setRotaryLeft] = useState('VolumeAdjustment');
  const [rotaryRight, setRotaryRight] = useState('ScrollY');
  const [sensitivity, setSensitivity] = useState('Balanced');

  // Rotary state mirrors the persisted server values (services that predate
  // the rotary fields omit them - keep the defaults then). The poll pauses
  // while writes are in flight, so this never fights an optimistic edit.
  useEffect(() => {
    const s = keeb.settings;
    if (!s) return;
    if (s.rotaryLeft) setRotaryLeft(s.rotaryLeft);
    if (s.rotaryRight) setRotaryRight(s.rotaryRight);
    if (s.rotarySensitivity) setSensitivity(s.rotarySensitivity);
  }, [keeb.settings]);

  // Fit the fixed-pixel keyboard render to the window width.
  const stage = useFitZoom(KEEB_RENDER_WIDTH, 0.55);

  // Sequence guards: a slow failing rotary write must not revert a newer
  // value the user has since picked (a wrong revert would stand until the
  // settings poll mirrors the server value back).
  const rotarySeqRef = useRef(0);
  const sensitivitySeqRef = useRef(0);

  // One toast per failure burst: a failing service makes every write fail,
  // and a slider commit can fire several in quick succession.
  const lastFailToastRef = useRef(0);
  const reportWrite = useCallback((ok: boolean) => {
    if (ok) return ok;
    const now = Date.now();
    if (now - lastFailToastRef.current > 4000) {
      lastFailToastRef.current = now;
      push({ title: t('keeb.write.failedTitle'), body: t('keeb.write.failedBody') });
    }
    return ok;
  }, [push, t]);

  const onLayerChange = (next: KeebLayer) => {
    keeb.setLayer(next);
    setSelected(null);
  };

  const offlineCopy = keeb.state.isConnected
    ? undefined
    : t('keeb.offlineCopy');

  const showKeyboard = tab === 'key-assignment' || tab === 'tester';
  const keyboardInteractive = tab === 'key-assignment';

  const title = keeb.state.isConnected ? t('keeb.title') : t('keeb.titleOffline');

  return (
    <section className={pageStyles.page}>
      <ViewHeader
        title={title}
        tabs={TAB_KEYS.map(tb => ({ key: tb.key, label: t(tb.labelKey), icon: tb.icon }))}
        activeTab={tab}
        onTabChange={(k) => setTab(k as Tab)}
        tabActions={tab === 'key-assignment' ? (
          <div className={pageStyles.layerChips} aria-label={t('keeb.layer')}>
            <LayersIcon size={14} className={pageStyles.layerChipsIcon} aria-hidden />
            {KEEB_LAYERS.map(l => (
              <IconLabelButton
                key={l}
                label={(l + 1).toString()}
                active={keeb.layer === l}
                ariaLabel={t('keeb.layerN', { n: l + 1 })}
                className={pageStyles.layerChip}
                onPress={() => onLayerChange(l)}
              />
            ))}
          </div>
        ) : undefined}
      />
      <div className={`${pageStyles.pageBody} pageBody`}>
        {showKeyboard && (
          <div ref={stage.ref} className={pageStyles.keyboardStageWrap}>
            <div className={pageStyles.keyboardStage} style={{ zoom: stage.zoom }}>
              <KeebKeyboard
                state={keeb.state}
                offlineCopy={offlineCopy}
                disabled={!keyboardInteractive}
                onSelect={keyboardInteractive ? setSelected : undefined}
                selected={keyboardInteractive ? selected : null}
              />
            </div>
          </div>
        )}

        <div className={pageStyles.tabBody}>
          {tab === 'key-assignment' && selected?.kind === 'wheel' && (
            <KeebRotaryView
              wheel={selected.side}
              left={rotaryLeft}
              right={rotaryRight}
              sensitivity={sensitivity}
              onSetRotary={async body => {
                const seq = ++rotarySeqRef.current;
                const prev = { left: rotaryLeft, right: rotaryRight };
                setRotaryLeft(body.left);
                setRotaryRight(body.right);
                if (!reportWrite(await keeb.saveRotary(body)) && seq === rotarySeqRef.current) {
                  setRotaryLeft(prev.left);
                  setRotaryRight(prev.right);
                }
              }}
              onSetSensitivity={async s => {
                const seq = ++sensitivitySeqRef.current;
                const prev = sensitivity;
                setSensitivity(s);
                if (!reportWrite(await keeb.saveRotarySensitivity(s)) && seq === sensitivitySeqRef.current) {
                  setSensitivity(prev);
                }
              }}
            />
          )}
          {tab === 'key-assignment' && selected?.kind !== 'wheel' && (
            <KeebKeyAssignmentView
              selected={selected?.kind === 'key' ? { x: selected.x, y: selected.y } : null}
              state={keeb.state}
              setKey={async body => { reportWrite(await keeb.setKey(body)); }}
              resetLayer={async () => { reportWrite(await keeb.resetLayer()); }}
            />
          )}
          {tab === 'macros' && (
            <KeebMacroView
              loadMacro={keeb.loadMacro}
              saveMacro={async (i, keys) => {
                const r = await keeb.saveMacro(i, keys);
                reportWrite(r !== null);
                return r;
              }}
            />
          )}
          {tab === 'tester' && <KeebTesterView />}
          {tab === 'settings' && (
            <KeebSettingsView
              settings={keeb.settings}
              onSaveFirmwareLighting={async body => { reportWrite(await keeb.saveFirmwareLighting(body)); }}
              onSavePassiveLighting={async body => { reportWrite(await keeb.savePassiveLighting(body)); }}
              onSaveGameMode={async body => { reportWrite(await keeb.saveGameMode(body)); }}
            />
          )}
        </div>
      </div>
    </section>
  );
}

export default KeebDevicePage;
