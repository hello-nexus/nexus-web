import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../lib/i18n';
import { Card } from '../common/Card/Card';
import { Button } from '../common/Button/Button';
import { Select, type SelectOption } from '../common/Select/Select';
import {
  formatPanelInches,
  getAllSimulatedPanels,
  getConnectedSimulatedPanelIds,
  getCustomSimulatedPanel,
  getSimulatedPanelGridCapacity,
  getSimulatedPanelPhysicalSize,
  PANEL_SIMULATION_CHANGED_EVENT,
  setCustomSimulatedPanelSize,
  setSimulatedPanelConnected,
} from '../../lib/panelSimulation';
import { GENERIC_VENDOR } from '../../lib/simulatedScreenCatalog';
import { isTryxSimulated, setTryxSimulated } from '../../lib/tryxSimulation';
import { useStreamDecks } from '../../hooks/useStreamDecks';
import {
  getStreamDeckDevModels,
  simulateStreamDeck,
  simulateStreamDeckInput,
  clearSimulatedStreamDeck,
  type StreamDeckDevModel,
  type StreamDeckSimInput,
  type StreamDeckSummary,
} from '../../api/streamdeck';
import { clearSimulatedNollie, getNollieBoards, getNollieDevModels, simulateNollie, NOLLIE_SIMULATED_SERIAL_PREFIX, type NollieBoard, type NollieDevModel } from '../../api/nollie';
import { getDevPanelVariant, setDevPanelVariant } from '../../api/displays';
import { DEV_TOOLS } from '../../lib/devTools';
import styles from './ToolsView.module.scss';

const SIM_TICK_OPTIONS = ['1', '2', '5', '10'];

/** Dev-tools-only: injects dial and touch-strip input into the simulated deck through the service's hardware input path. */
function StreamDeckSimInputControls({ deck }: { deck: StreamDeckSummary }) {
  const { t } = useTranslation();
  const encoders = deck.encoders ?? 0;
  const strip = deck.screen?.kind === 'touchStrip' ? deck.screen : null;
  const [dial, setDial] = useState('0');
  const [segment, setSegment] = useState('0');
  const [ticks, setTicks] = useState('1');
  const [touchKey, setTouchKey] = useState('0');
  const touchKeys = deck.touchKeys ?? 0;
  const indexOptions = Array.from({ length: encoders }, (_, i) => ({ value: String(i), label: String(i + 1) }));

  const send = (input: Omit<StreamDeckSimInput, 'serial'>) => { void simulateStreamDeckInput({ serial: deck.serial, ...input }); };
  const touch = (kind: 'tap' | 'longTouch') => {
    if (!strip) return;
    const segWidth = strip.width / Math.max(1, encoders);
    send({ kind, x: Math.round((Number(segment) + 0.5) * segWidth), y: Math.round(strip.height / 2) });
  };
  const swipe = (leftward: boolean) => {
    if (!strip) return;
    const near = Math.round(strip.width * 0.8);
    const far = Math.round(strip.width * 0.2);
    const y = Math.round(strip.height / 2);
    send({ kind: 'swipe', x: leftward ? near : far, y, x2: leftward ? far : near, y2: y });
  };

  if (encoders === 0 && !strip && touchKeys === 0) return null;
  return (
    <div className={styles.streamdeckSimInput} role="group" aria-label={t('tools.streamdeckSim.input.title')}>
      {encoders > 0 && (
        <>
          <Select value={dial} options={indexOptions} onChange={setDial} ariaLabel={t('tools.streamdeckSim.input.dial')} />
          <Select value={ticks} options={SIM_TICK_OPTIONS.map(v => ({ value: v, label: v }))} onChange={setTicks} ariaLabel={t('tools.streamdeckSim.input.ticks')} />
          <Button type="button" size="sm" tone="neutral" onClick={() => send({ kind: 'rotate', index: Number(dial), ticks: -Number(ticks) })}>{t('tools.streamdeckSim.input.turnLeft')}</Button>
          <Button type="button" size="sm" tone="neutral" onClick={() => send({ kind: 'rotate', index: Number(dial), ticks: Number(ticks) })}>{t('tools.streamdeckSim.input.turnRight')}</Button>
          <Button type="button" size="sm" tone="neutral" onClick={() => send({ kind: 'dialDown', index: Number(dial) })}>{t('tools.streamdeckSim.input.press')}</Button>
          <Button type="button" size="sm" tone="neutral" onClick={() => send({ kind: 'dialUp', index: Number(dial) })}>{t('tools.streamdeckSim.input.release')}</Button>
        </>
      )}
      {touchKeys > 0 && (
        <>
          <Select
            value={touchKey}
            options={[{ value: '0', label: t('tools.streamdeckSim.input.touchKeyLeft') }, { value: '1', label: t('tools.streamdeckSim.input.touchKeyRight') }]}
            onChange={setTouchKey}
            ariaLabel={t('tools.streamdeckSim.input.touchKey')}
          />
          <Button type="button" size="sm" tone="neutral" onClick={() => send({ kind: 'touchKey', index: Number(touchKey), pressed: true })}>{t('tools.streamdeckSim.input.touchKeyPress')}</Button>
          <Button type="button" size="sm" tone="neutral" onClick={() => send({ kind: 'touchKey', index: Number(touchKey), pressed: false })}>{t('tools.streamdeckSim.input.touchKeyRelease')}</Button>
        </>
      )}
      {strip && (
        <>
          <Select value={segment} options={indexOptions} onChange={setSegment} ariaLabel={t('tools.streamdeckSim.input.segment')} />
          <Button type="button" size="sm" tone="neutral" onClick={() => touch('tap')}>{t('tools.streamdeckSim.input.tap')}</Button>
          <Button type="button" size="sm" tone="neutral" onClick={() => touch('longTouch')}>{t('tools.streamdeckSim.input.longTouch')}</Button>
          <Button type="button" size="sm" tone="neutral" onClick={() => swipe(true)}>{t('tools.streamdeckSim.input.swipeLeft')}</Button>
          <Button type="button" size="sm" tone="neutral" onClick={() => swipe(false)}>{t('tools.streamdeckSim.input.swipeRight')}</Button>
        </>
      )}
    </div>
  );
}


/** Overrides what `displays.panelVariant` reports to SDK apps; surface availability is unaffected. */
function PanelVariantRow() {
  const { t } = useTranslation();
  const [options, setOptions] = useState<string[]>([]);
  const [variant, setVariant] = useState('');

  const refresh = useCallback(() => {
    void getDevPanelVariant().then(r => {
      if (!r) return;
      setOptions(r.options);
      setVariant(r.variant);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const onChange = (next: string) => {
    setVariant(next);
    void setDevPanelVariant(next).then(refresh);
  };

  return (
    <div className={styles.simRow}>
      <div className={styles.simMeta}>
        <strong>{t('tools.panelVariant.title')}</strong>
        <span>{t('tools.panelVariant.label')}</span>
      </div>
      <div className={styles.streamdeckSimControls}>
        <Select
          value={variant}
          options={[
            { value: '', label: t('tools.panelVariant.none') },
            ...options.map(o => ({ value: o, label: o })),
          ]}
          onChange={onChange}
          ariaLabel={t('tools.panelVariant.title')}
        />
      </div>
    </div>
  );
}

// The service names a simulated deck surface `sim-<productId hex>`; the DTO has no
// separate flag, and `connected` keeps a persisted-but-offline record from reading as active.
function useStreamDeckSim() {
  const { decks, refresh } = useStreamDecks(true);
  const [models, setModels] = useState<StreamDeckDevModel[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getStreamDeckDevModels().then(list => { if (!cancelled) setModels(list); });
    return () => { cancelled = true; };
  }, []);

  const active = decks.find(d => d.serial.startsWith('sim-') && d.connected) ?? null;

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
    refresh();
  };

  return {
    models,
    active,
    busy,
    add: (productId: number) => run(() => simulateStreamDeck(productId)),
    remove: () => run(() => clearSimulatedStreamDeck()),
  };
}

function useNollieSim() {
  const [models, setModels] = useState<NollieDevModel[]>([]);
  const [active, setActive] = useState<NollieBoard | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void getNollieBoards().then(boards => {
      setActive(boards?.find(b => b.serial.startsWith(NOLLIE_SIMULATED_SERIAL_PREFIX)) ?? null);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getNollieDevModels().then(list => { if (!cancelled) setModels(list); });
    refresh();
    return () => { cancelled = true; };
  }, [refresh]);

  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try { await action(); } finally { setBusy(false); }
    refresh();
  };

  return {
    models,
    active,
    busy,
    add: (id: string) => run(() => simulateNollie(id)),
    remove: () => run(() => clearSimulatedNollie()),
  };
}

const PANEL_PREFIX = 'panel:';
const STREAMDECK_PREFIX = 'streamdeck:';
const NOLLIE_PREFIX = 'nollie:';
const TRYX_VALUE = 'tryx';

/** Dev-tools-only: the active simulators with a Remove each, plus one dropdown to add any supported screen. */
export function PanelSimulatorCard() {
  const { t } = useTranslation();
  const [connectedIds, setConnectedIds] = useState(() => getConnectedSimulatedPanelIds());
  const [customWidth, setCustomWidth] = useState(() => getCustomSimulatedPanel().width);
  const [customHeight, setCustomHeight] = useState(() => getCustomSimulatedPanel().height);
  const [customDpi, setCustomDpi] = useState(() => getCustomSimulatedPanel().dpi);
  const [tryxOn, setTryxOn] = useState(() => isTryxSimulated());
  const deckSim = useStreamDeckSim();
  const nollieSim = useNollieSim();

  const customPhysical = getSimulatedPanelPhysicalSize({
    width: customWidth,
    height: customHeight,
    dpi: customDpi,
  });

  const refresh = useCallback(() => {
    setConnectedIds(getConnectedSimulatedPanelIds());
  }, []);

  useEffect(() => {
    window.addEventListener(PANEL_SIMULATION_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PANEL_SIMULATION_CHANGED_EVENT, refresh);
  }, [refresh]);

  const panels = getAllSimulatedPanels();

  const options = useMemo(() => {
    const alreadyActive = t('tools.panelSim.alreadyActive');
    const oneAtATime = t('tools.panelSim.oneAtATime');
    const groups = new Map<string, SelectOption[]>();
    const add = (vendor: string, option: SelectOption) => {
      groups.set(vendor, [...(groups.get(vendor) ?? []), option]);
    };
    for (const panel of panels) {
      const active = connectedIds.includes(panel.id);
      add(panel.vendor ?? GENERIC_VENDOR, {
        value: PANEL_PREFIX + panel.id,
        label: panel.name,
        disabled: active,
        description: active ? alreadyActive : undefined,
      });
    }
    for (const model of deckSim.models) {
      const label = (model.encoders ?? 0) > 0
        ? t('tools.streamdeckSim.modelOptionDials', { name: model.name, count: model.keyCount, dials: model.encoders ?? 0 })
        : t('tools.streamdeckSim.modelOption', { name: model.name, count: model.keyCount });
      add('Elgato', {
        value: STREAMDECK_PREFIX + model.productId,
        label,
        disabled: !!deckSim.active || deckSim.busy,
        description: deckSim.active ? oneAtATime : undefined,
      });
    }
    for (const model of nollieSim.models) {
      add('Nollie', {
        value: NOLLIE_PREFIX + model.id,
        label: model.name,
        disabled: !!nollieSim.active || nollieSim.busy,
        description: nollieSim.active ? oneAtATime : undefined,
      });
    }
    add('Tryx', {
      value: TRYX_VALUE,
      label: t('devices.tryx.simulatedName'),
      disabled: tryxOn,
      description: tryxOn ? alreadyActive : undefined,
    });
    const vendors = [...groups.keys()].sort((a, b) =>
      (a === GENERIC_VENDOR ? 1 : 0) - (b === GENERIC_VENDOR ? 1 : 0) || a.localeCompare(b));
    return vendors.flatMap((vendor): SelectOption[] => [
      { value: '', label: vendor === GENERIC_VENDOR ? t('tools.panelSim.vendorGeneric') : vendor, header: true },
      ...groups.get(vendor)!,
    ]);
  }, [t, panels, connectedIds, deckSim.models, deckSim.active, deckSim.busy, nollieSim.models, nollieSim.active, nollieSim.busy, tryxOn]);

  const addSimulator = (value: string) => {
    if (value.startsWith(PANEL_PREFIX)) {
      setSimulatedPanelConnected(value.slice(PANEL_PREFIX.length), true);
      refresh();
    } else if (value.startsWith(STREAMDECK_PREFIX)) {
      void deckSim.add(Number(value.slice(STREAMDECK_PREFIX.length)));
    } else if (value.startsWith(NOLLIE_PREFIX)) {
      void nollieSim.add(value.slice(NOLLIE_PREFIX.length));
    } else if (value === TRYX_VALUE) {
      setTryxSimulated(true);
      setTryxOn(true);
    }
  };

  const removeTryx = () => {
    setTryxSimulated(false);
    setTryxOn(false);
  };

  const removePanel = (id: string) => {
    setSimulatedPanelConnected(id, false);
    refresh();
  };

  const applyCustom = () => {
    setCustomSimulatedPanelSize(customWidth, customHeight, customDpi);
    refresh();
  };

  const activePanels = panels.filter(panel => connectedIds.includes(panel.id));
  const nothingActive = activePanels.length === 0 && !tryxOn && !deckSim.active && !nollieSim.active;

  return (
    <Card title={t('tools.panelSim.title')}>
      <span className={styles.dim}>{t('tools.panelSim.label')}</span>
      <Select
        value=""
        options={options}
        onChange={addSimulator}
        placeholder={t('tools.panelSim.add')}
        ariaLabel={t('tools.panelSim.add')}
      />
      <div className={styles.simList}>
        {nothingActive && <span className={styles.dim}>{t('tools.panelSim.none')}</span>}
        {activePanels.map(panel => {
          const isCustom = panel.id === 'custom';
          const capacity = getSimulatedPanelGridCapacity(panel);
          const physical = getSimulatedPanelPhysicalSize(panel);
          return (
            <div key={panel.id} className={styles.simRow}>
              <div className={styles.simMeta}>
                <strong>{panel.name}</strong>
                <span>{t('tools.panelSim.spec', {
                  surface: panel.surface,
                  width: panel.width,
                  height: panel.height,
                  dpi: panel.dpi,
                  short: formatPanelInches(physical.shortSideInches),
                  diag: formatPanelInches(physical.diagonalInches),
                  columns: capacity.columns,
                  rows: capacity.rows,
                })}</span>
              </div>
              <Button type="button" tone="danger" size="sm" onClick={() => removePanel(panel.id)}>
                {t('tools.panelSim.remove')}
              </Button>
              {isCustom && (
                <div className={styles.customControls}>
                  <input
                    className={styles.dimensionInput}
                    type="number"
                    min={240}
                    max={4096}
                    value={customWidth}
                    aria-label={t('tools.panelSim.customWidth')}
                    onChange={e => setCustomWidth(Number(e.target.value))}
                  />
                  <span className={styles.dim}>x</span>
                  <input
                    className={styles.dimensionInput}
                    type="number"
                    min={240}
                    max={4096}
                    value={customHeight}
                    aria-label={t('tools.panelSim.customHeight')}
                    onChange={e => setCustomHeight(Number(e.target.value))}
                  />
                  <span className={styles.dim}>@</span>
                  <input
                    className={styles.dimensionInput}
                    type="number"
                    min={72}
                    max={600}
                    value={customDpi}
                    aria-label={t('tools.panelSim.customDpi')}
                    onChange={e => setCustomDpi(Number(e.target.value))}
                  />
                  <span className={styles.dim}>dpi</span>
                  <input
                    className={`${styles.dimensionInput} ${styles.readonlyInput}`}
                    type="text"
                    readOnly
                    value={t('tools.panelSim.short', { value: formatPanelInches(customPhysical.shortSideInches) })}
                    aria-label={t('tools.panelSim.customShortSide')}
                  />
                  <input
                    className={`${styles.dimensionInput} ${styles.readonlyInput}`}
                    type="text"
                    readOnly
                    value={t('tools.panelSim.diag', { value: formatPanelInches(customPhysical.diagonalInches) })}
                    aria-label={t('tools.panelSim.customDiagonal')}
                  />
                  <Button type="button" tone="accent" size="sm" onClick={applyCustom} className={styles.applyBtn}>{t('tools.panelSim.apply')}</Button>
                </div>
              )}
            </div>
          );
        })}
        {tryxOn && (
          <div className={styles.simRow}>
            <div className={styles.simMeta}>
              <strong>{t('devices.tryx.simulatedName')}</strong>
              <span>{t('tools.tryxSim.label')}</span>
            </div>
            <Button type="button" tone="danger" size="sm" onClick={removeTryx}>{t('tools.panelSim.remove')}</Button>
          </div>
        )}
        {deckSim.active && (
          <div className={styles.simRow}>
            <div className={styles.simMeta}>
              <strong>{deckSim.active.displayName}</strong>
              <span>{t('tools.streamdeckSim.label')}</span>
            </div>
            <Button type="button" tone="danger" size="sm" disabled={deckSim.busy} onClick={() => void deckSim.remove()}>
              {t('tools.panelSim.remove')}
            </Button>
            <StreamDeckSimInputControls deck={deckSim.active} />
          </div>
        )}
        {nollieSim.active && (
          <div className={styles.simRow}>
            <div className={styles.simMeta}>
              <strong>{nollieSim.active.name}</strong>
              <span>{t('tools.nollieSim.label')}</span>
            </div>
            <Button type="button" tone="danger" size="sm" disabled={nollieSim.busy} onClick={() => void nollieSim.remove()}>
              {t('tools.panelSim.remove')}
            </Button>
          </div>
        )}
        {DEV_TOOLS && <PanelVariantRow />}
      </div>
    </Card>
  );
}
