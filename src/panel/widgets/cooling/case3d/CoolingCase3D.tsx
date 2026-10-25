import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box } from 'lucide-react';
import type { FanChannel } from '../../../../api/cooling';
import { Badge } from '../../../../components/common/Badge/Badge';
import { Button } from '../../../../components/common/Button/Button';
import { Toggle } from '../../../../components/common/Toggle/Toggle';
import { ChipGroup } from '../../../../components/common/ChipGroup/ChipGroup';
import { Notice } from '../../../../components/common/Notice/Notice';
import { Select, type SelectOption } from '../../../../components/common/Select/Select';
import { Slider } from '../../../../components/common/Slider/Slider';
import { InfoTooltip } from '../../../../components/common/InfoTooltip/InfoTooltip';
import { Popover } from '../../../../components/common/Popover/Popover';
import { ThemeScope } from '../../../../components/common/ThemeScope/ThemeScope';
import { EmptyState } from '../../../../components/common/EmptyState/EmptyState';
import { patchPcSetupRadiator } from '../../../../api/pcSetup';
import { requestOpenBuild } from '../../../../components/views/BuildPage/buildNav';
import { COOLING_FLOW_MODES, DEFAULT_COOLING_FLOW_MODE, type CoolingFlowMode } from '../../../../lib/settings';
import { useCoolingLayout } from '../../../../hooks/useCoolingLayout';
import { usePcSetupRecord } from '../../../../hooks/usePcSetupRecord';
import { useCaseModel } from '../../../../hooks/useCaseModel';
import { useComponentTemps } from '../../../../hooks/useComponentTemps';
import { DEV_TOOLS } from '../../../../lib/devTools';
import { useTranslation } from '../../../../lib/i18n';
import {
  channelOfSlot, hasDerivedLink, MAX_SLOT_KEYS_PER_BINDING, isSimChannel, NONE_CHANNEL, simChannelId, SIM_RPM_DEFAULT, SIM_RPM_MIN, SIM_RPM_STEP, fanGeometries, parseCaseLayout, slotsOfChannel, linkChannelToSlot, withDirection, collapseMounts, normalizeBindings,
} from '../../../../lib/cooling/caseLayout';
import { settleFlows, simRpm, SIM_RPM_CEILING } from '../../../../lib/cooling/fanSpeed';
import { boundSlotKeys, lumpedModel, slotDirections, slotSpeeds, withDefaultBindings } from '../../../../lib/cooling/slotFlow';
import { catalogFanSpecs } from '../../../../lib/cooling/fanSpecs';
import { visualFlow } from '../../../../lib/cooling/visualFlow';
import type { FanDirection } from '../../../../lib/cooling/pressureModel';
import type { FlowInput } from '../../../../lib/cooling/flow/gridScene';
import type { FlowOptions } from '../../../../lib/cooling/flow/flowLayer';
import { createCaseRenderer, type CaseSceneRenderer, type PickHandler } from './coolingCaseRenderer';
import { CaseTempLabels } from './CaseTempLabels';
import styles from './CoolingCase3D.module.scss';

export interface CoolingCase3DProps {
  channels: FanChannel[];
  /** The fan selected in the left rail; null unless exactly one is. */
  selectedChannelId: string | null;
  /** Every device selected on the left; their fans highlight. Defaults to the one selected fan. */
  selectedChannelIds?: readonly string[];
  onSelectChannel: (channelId: string) => void;
  /** A click on empty canvas: the left-hand selection clears. */
  onClearSelection?: () => void;
  /** What the view draws; remembered by the caller. */
  flowMode?: CoolingFlowMode;
  onFlowModeChange?: (mode: CoolingFlowMode) => void;
  /** Draws the solver's collision shapes in place of the case model; remembered by the caller. */
  collisionShapes?: boolean;
  onCollisionShapesChange?: (on: boolean) => void;
}

const POSITION_KEYS: Record<string, string> = {
  top: 'cooling.case3d.position.top',
  front: 'cooling.case3d.position.front',
  rear: 'cooling.case3d.position.rear',
  bottom: 'cooling.case3d.position.bottom',
  left: 'cooling.case3d.position.left',
  right: 'cooling.case3d.position.right',
  'psu-shroud': 'cooling.case3d.position.psuShroud',
  'front-left': 'cooling.case3d.position.frontLeft',
  'front-right': 'cooling.case3d.position.frontRight',
  gpu: 'cooling.case3d.position.gpu',
};

/** Particle speed multiplier, and the share of it that Slow mo keeps. */
const NORMAL_SPEED = 1;
const SLOW_MO_FACTOR = 0.25;
const VENT_KEY = '#vent';
const SIM_HEADER = '#sim-group';
const SIM_VALUE = '#sim';
const REF_KEY = '#ref';
const NONE = '';
const INTAKE: FanDirection = 'intake';
const EXHAUST: FanDirection = 'exhaust';

export function CoolingCase3D({ channels, selectedChannelId, selectedChannelIds, onSelectChannel, onClearSelection, flowMode: savedFlowMode, onFlowModeChange, collisionShapes: savedCollisions, onCollisionShapesChange }: CoolingCase3DProps) {
  const { t } = useTranslation();
  const { record, loaded } = usePcSetupRecord(true);
  const { layout: coolingLayout, settled: layoutSettled, failed: layoutFailed, edit } = useCoolingLayout(true);
  // Parsed once per distinct layout: a setup ping that changes nothing here keeps the same object, so the scene and camera stay.
  const layoutText = JSON.stringify(record?.setup.resolved.caseLayout ?? null);
  // A radiator move shows at once from a local pending mount; the saved record takes over once it carries the write.
  const [pendingMove, setPendingMove] = useState<{ mount: string; rev: number | null } | null>(null);
  const [moveFailed, setMoveFailed] = useState(false);
  const mountChoice = pendingMove?.mount ?? record?.setup.case?.radiatorMount ?? null;
  const parsedLayout = useMemo(() => parseCaseLayout(JSON.parse(layoutText), mountChoice), [layoutText, mountChoice]);
  useEffect(() => {
    if (pendingMove?.rev != null && record && record.rev >= pendingMove.rev) setPendingMove(null);
  }, [record, pendingMove]);
  // The stored bindings plus the derived default for each GPU fan and AIO radiator slot; the stored layout never carries the default.
  const storedBindings = coolingLayout.bindings;
  const effectiveBindings = useMemo(() => withDefaultBindings(storedBindings, parsedLayout?.fanSlots ?? [], channels), [storedBindings, parsedLayout, channels]);
  // A slot bound to a cooling device has a physical fan, whether or not the setup record lists one there.
  const boundKeys = useMemo(() => boundSlotKeys(effectiveBindings, channels), [effectiveBindings, channels]);
  const boundKeyText = [...new Set(boundKeys)].sort().join('\n');
  const collapsed = useMemo(() => (parsedLayout ? collapseMounts(parsedLayout, boundKeyText ? boundKeyText.split('\n') : []) : null), [parsedLayout, boundKeyText]);
  const caseLayout = collapsed?.layout ?? null;
  const canonOf = collapsed?.canonOf;
  // Bindings as the view shows them: each on the one drawn fan of its mount.
  // A simulated speed being dragged shows in the stats and the particles at once; it is saved once, when the drag ends.
  const [simPreview, setSimPreview] = useState<{ key: string; rpm: number } | null>(null);
  const savedBindings = useMemo(() => (canonOf ? normalizeBindings(effectiveBindings, canonOf) : effectiveBindings), [effectiveBindings, canonOf]);
  const bindings = useMemo(() => (simPreview ? linkChannelToSlot(savedBindings, simChannelId(simPreview.rpm), simPreview.key, false) : savedBindings), [savedBindings, simPreview]);
  const [active, setActive] = useState<string | null>(null);
  // A drag that was never finished must not leave its speed showing once another fan is chosen or the controls close.
  useEffect(() => { setSimPreview(null); }, [active]);
  const [anchor, setAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const anchorRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [renderer, setRenderer] = useState<CaseSceneRenderer | null>(null);
  const [flowMode, setFlowMode] = useState<CoolingFlowMode>(savedFlowMode ?? DEFAULT_COOLING_FLOW_MODE);
  const [slowMo, setSlowMo] = useState(false);
  const [collisions, setCollisions] = useState(DEV_TOOLS && (savedCollisions ?? false));
  // The saved choices can change after mount (the settings load, or another window edits them), so the view follows them.
  useEffect(() => { setFlowMode(savedFlowMode ?? DEFAULT_COOLING_FLOW_MODE); }, [savedFlowMode]);
  useEffect(() => { setCollisions(DEV_TOOLS && (savedCollisions ?? false)); }, [savedCollisions]);
  const particles = flowMode !== 'case';
  const showCase = flowMode !== 'airflow';
  const [flowSupported, setFlowSupported] = useState(true);
  const caseModel = useCaseModel(true, record?.rev ?? null);
  const temps = useComponentTemps(true);

  const directions = useMemo(() => slotDirections(caseLayout?.fanSlots ?? [], coolingLayout.directions), [caseLayout, coolingLayout.directions]);

  // Live speed of each drawn fan: the bound channel's tach (or simulated rpm) over the fan's top speed. A GPU or AIO fan that is unlinked reads stopped; any other unbound fan stays at its rated curve.
  const speeds = useMemo(() => slotSpeeds(caseLayout?.fanSlots ?? [], bindings, channels), [caseLayout, bindings, channels]);

  const model = useMemo(() => (caseLayout ? lumpedModel(caseLayout.fanSlots, catalogFanSpecs(record?.setup.items ?? []), speeds, directions) : null), [caseLayout, record, directions, speeds]);

  const handlers = useRef<{ pick: PickHandler }>({ pick: () => {} });
  handlers.current.pick = (key, x, y) => {
    // A press on a fan opens its controls; a linked fan also selects its device in the left-hand list.
    const owner = key && !selectedChannelId ? channelOfSlot(bindings, key) : null;
    if (owner && channels.some(c => c.id === owner)) onSelectChannel(owner);
    setActive(key);
    if (!key) { onClearSelection?.(); return; }
    setAnchor({ x, y });
  };

  useEffect(() => {
    if (!canvas) return undefined;
    const next = createCaseRenderer(canvas, (key, x, y) => handlers.current.pick(key, x, y));
    setRenderer(next);
    const observer = new ResizeObserver(() => next.resize());
    observer.observe(canvas);
    next.resize();
    return () => {
      observer.disconnect();
      next.dispose();
      setRenderer(null);
    };
  }, [canvas]);

  // Flows that moved little keep their old values, so tach jitter never restarts the solve.
  const rawFlow = useMemo(() => {
    if (!model || !caseLayout || model.fanCount === 0) return null;
    const v = visualFlow(caseLayout.fanSlots, catalogFanSpecs(record?.setup.items ?? []), speeds, directions);
    return { [VENT_KEY]: v.ventCfm, [REF_KEY]: v.referenceCfm, ...v.fanCfm };
  }, [model, caseLayout, record, speeds, directions]);
  const [settledFlow, setSettledFlow] = useState<Readonly<Record<string, number>> | null>(null);
  // Settled in the same render the raw flows arrive, so the scene never sees a stale set of fans for one frame and re-solves twice.
  const effectiveFlow = rawFlow ? (settledFlow ? settleFlows(settledFlow, rawFlow) : rawFlow) : null;
  useEffect(() => { setSettledFlow(effectiveFlow); }, [effectiveFlow]);
  const flowKey = effectiveFlow ? JSON.stringify([layoutText, mountChoice, boundKeyText, directions, effectiveFlow]) : '';
  const flowInput = useMemo<FlowInput | null>(() => {
    if (!caseLayout || !effectiveFlow || flowKey === '') return null;
    const { [VENT_KEY]: ventCfm = 0, [REF_KEY]: referenceCfm, ...fanCfm } = effectiveFlow;
    return { layout: caseLayout, directions, fanCfm, ventCfm, referenceCfm };
    // flowKey covers every input read here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowKey]);
  const flowOptions = useMemo<FlowOptions>(() => ({ particles, collisions: DEV_TOOLS && collisions && showCase, speed: slowMo ? NORMAL_SPEED * SLOW_MO_FACTOR : NORMAL_SPEED }), [particles, collisions, showCase, slowMo]);

  const selectedKey = (selectedChannelIds ?? (selectedChannelId ? [selectedChannelId] : [])).join('\n');
  const highlighted = useMemo(() => new Set((selectedKey ? selectedKey.split('\n') : []).flatMap(id => slotsOfChannel(bindings, id))), [bindings, selectedKey]);
  const bound = useMemo(() => new Set(bindings.filter(b => b.channelId !== NONE_CHANNEL).flatMap(b => b.slotKeys)), [bindings]);
  const simulated = useMemo(() => new Set(bindings.filter(b => isSimChannel(b.channelId)).flatMap(b => b.slotKeys)), [bindings]);

  useEffect(() => {
    if (!caseLayout || !renderer) return;
    renderer.setState({ layout: caseLayout, directions, highlighted, bound, simulated, showCase, active, flow: flowInput, flowOptions, model: caseModel.bytes });
    setFlowSupported(renderer.flowSupported);
  }, [renderer, caseLayout, directions, highlighted, bound, simulated, showCase, active, flowInput, flowOptions, caseModel.bytes]);

  // Temperatures ride a path of their own: the renderer hands them to the live particle pass, so a sensor tick never rebuilds the scene.
  useEffect(() => { renderer?.setTemps(temps); }, [renderer, temps]);

  const setDirection = useCallback((key: string, position: string, direction: FanDirection) => {
    edit(l => ({ ...l, directions: withDirection(l.directions, { key, position }, direction) }));
  }, [edit]);

  // Choosing a device links it to this fan: the fan's earlier device is replaced, and the device keeps its other fans. Unlinking a fan that has a derived default (GPU and AIO fans) stores the `none` marker.
  const linkChannel = useCallback((channelId: string, key: string) => {
    edit(l => ({ ...l, bindings: linkChannelToSlot(canonOf ? normalizeBindings(l.bindings, canonOf) : l.bindings, channelId, key, hasDerivedLink(key)) }));
  }, [edit, canonOf]);

  // The service's write is by record rev; a stale rev answers with the current record, and one retry on that rev settles a race with another writer.
  const moveRadiator = useCallback(async (mount: string) => {
    if (!record) return;
    setMoveFailed(false);
    setPendingMove({ mount, rev: null });
    let result = await patchPcSetupRadiator(record.rev, mount);
    if (result.kind === 'conflict') result = await patchPcSetupRadiator(result.record.rev, mount);
    if (result.kind === 'saved') { const rev = result.rev; setPendingMove(cur => (cur?.mount === mount ? { mount, rev } : cur)); return; }
    setPendingMove(cur => (cur?.mount === mount ? null : cur));
    setMoveFailed(true);
  }, [record]);

  if (!loaded || !layoutSettled) return <div className={styles.root} />;

  if (!caseLayout) {
    return (
      <div className={styles.root}>
        <EmptyState
          icon={<Box size={28} strokeWidth={1.6} />}
          title={t('cooling.case3d.empty.title')}
          hint={t('cooling.case3d.empty.hint')}
          action={<Button tone="accent" icon={<Box size={14} strokeWidth={1.8} />} onClick={() => requestOpenBuild('/builder')}>{t('cooling.case3d.empty.action')}</Button>}
        />
      </div>
    );
  }

  const activeSlot = active ? fanGeometries(caseLayout).find(g => g.slot.key === active)?.slot : undefined;
  const activeOwner = activeSlot ? channels.find(c => c.id === channelOfSlot(bindings, activeSlot.key)) : undefined;
  const selectedName = channels.find(c => c.id === selectedChannelId)?.name;
  const result = model?.result;
  const modeKey = result ? `cooling.case3d.pressure.${result.mode}` : '';
  const cfm = (v: number) => t('cooling.case3d.cfm', { value: String(Math.round(Math.abs(v))) });
  const positionName = (position: string) => t(POSITION_KEYS[position] ?? 'cooling.case3d.position.other');
  const activeOwnerId = activeSlot ? channelOfSlot(bindings, activeSlot.key) : null;
  const activeSimRpm = activeSlot ? simRpm(channelOfSlot(bindings, activeSlot.key) ?? '') : null;
  const slotPosition = (key: string) => caseLayout.fanSlots.find(s => s.key === key)?.position ?? '';

  // Every device of the left-hand list, by the name it shows there; one already on another fan says which, and choosing it moves it here.
  const deviceOptions: SelectOption[] = activeSlot ? [
    { value: NONE, label: t('cooling.case3d.noneLinked') },
    ...channels.map(c => {
      const elsewhere = [...new Set(bindings.filter(b => b.channelId === c.id).flatMap(b => b.slotKeys).filter(k => k !== activeSlot.key).map(k => positionName(slotPosition(k))))];
      // One device can drive several fans, so a linked entry stays choosable until its binding is full.
      const held = bindings.find(b => b.channelId === c.id)?.slotKeys ?? [];
      return {
        value: c.id,
        label: c.name,
        disabled: held.length >= MAX_SLOT_KEYS_PER_BINDING && !held.includes(activeSlot.key),
        ...(elsewhere.length > 0 ? {
          className: styles.linkedElsewhere,
          description: elsewhere.length === 1 ? t('cooling.case3d.linkedToOne', { slot: elsewhere[0] }) : t('cooling.case3d.linkedToMany', { slots: elsewhere.join(', ') }),
        } : {}),
      };
    }),
    // A simulated fan has no device behind it, so any number of slots can use it and it never reads as linked elsewhere.
    { value: SIM_HEADER, label: t('cooling.case3d.sim.group'), header: true },
    { value: SIM_VALUE, label: t('cooling.case3d.sim.fan') },
  ] : [];

  return (
    <div className={styles.root}>
      {!flowSupported && <Notice tone="info" role="status">{t('cooling.case3d.flow.unsupported')}</Notice>}
      {moveFailed && <Notice tone="warning" role="status">{t('cooling.case3d.radiator.error')}</Notice>}
      {layoutFailed && <Notice tone="warning" role="status">{t('cooling.case3d.layoutError')}</Notice>}
      {caseModel.settled && !caseModel.bytes && <Notice tone="info" role="status">{t('cooling.case3d.noModel')}</Notice>}
      {/* eslint-disable-next-line i18next/no-literal-string -- theme enum */}
      <ThemeScope theme="dark" scopeRef={viewportRef} className={styles.viewport}>
        <div className={`${styles.info} ${styles.control}`}>
          <InfoTooltip side="left" ariaLabel={t('cooling.case3d.hint.label')} message={selectedName ? t('cooling.case3d.hint.bind', { name: selectedName }) : t('cooling.case3d.hint.select')} />
        </div>
        <canvas ref={setCanvas} className={styles.canvas} role="img" aria-label={t('cooling.case3d.canvas')} />
        <CaseTempLabels renderer={renderer} layout={caseLayout} temps={temps} />
        {result && model && (
          <div className={`${styles.overlay} ${styles.overlayTop}`}>
            <div className={styles.stats} role="group" aria-label={t('cooling.case3d.stats.label')}>
              {model.fanCount === 0 ? (
                <span className={styles.statNote}>{t('cooling.case3d.noFans')}</span>
              ) : (
                <>
                  <span className={`${styles.mode} ${styles[result.mode]}`}>{t(modeKey)}</span>
                  <span className={styles.stat}><span className={styles.statLabel}>{t('cooling.case3d.stat.net')}</span>{result.netCfm >= 0 ? '+' : '-'}{cfm(result.netCfm)}</span>
                  <span className={styles.stat}><span className={styles.statLabel}>{t('cooling.case3d.stat.intake')}</span>{cfm(result.intakeCfm)}</span>
                  <span className={styles.stat}><span className={styles.statLabel}>{t('cooling.case3d.stat.exhaust')}</span>{cfm(result.exhaustCfm)}</span>
                  {model.estimated && <span className={styles.control}><Badge compact uppercase label={t('cooling.case3d.estimate')} tooltip={{ body: t('cooling.case3d.estimate.body') }} /></span>}
                </>
              )}
            </div>
          </div>
        )}
        <div className={`${styles.overlay} ${styles.overlayBottom}`}>
          <div className={styles.flowBar} role="group" aria-label={t('cooling.case3d.flow.controls')}>
            <ChipGroup
              className={styles.control}
              ariaLabel={t('cooling.case3d.flow.mode.label')}
              options={COOLING_FLOW_MODES.map(key => ({ key, label: t(`cooling.case3d.flow.mode.${key}`) }))}
              activeKey={flowMode}
              onChange={next => {
                const mode = COOLING_FLOW_MODES.find(m => m === next) ?? DEFAULT_COOLING_FLOW_MODE;
                setFlowMode(mode);
                onFlowModeChange?.(mode);
                if (mode === 'airflow') setActive(null);
              }}
            />
            {DEV_TOOLS && showCase && (
              <label className={`${styles.flowToggle} ${styles.control}`}>
                <Toggle checked={collisions} onChange={on => { setCollisions(on); onCollisionShapesChange?.(on); }} ariaLabel={t('cooling.case3d.flow.collisions')} />
                <span>{t('cooling.case3d.flow.collisions')}</span>
              </label>
            )}
            {particles && (
              <label className={`${styles.flowToggle} ${styles.control}`}>
                <Toggle checked={slowMo} onChange={setSlowMo} ariaLabel={t('cooling.case3d.flow.slowMo')} />
                <span>{t('cooling.case3d.flow.slowMo')}</span>
              </label>
            )}
          </div>
          {particles && flowSupported && (
            <div className={styles.legend} role="group" aria-label={t('cooling.case3d.flow.legend')}>
              <span>{t('cooling.case3d.flow.cooler')}</span>
              <span className={styles.legendBar} aria-hidden="true" />
              <span>{t('cooling.case3d.flow.warmer')}</span>
            </div>
          )}
        </div>
        <div ref={anchorRef} className={styles.anchor} style={{ left: anchor.x, top: anchor.y }} />
        {activeSlot && (
          <Popover
            open
            // The device list's menu (its options, search field and padding) is portaled to the page, so a press or Escape inside it must not close this popover.
            onClose={e => { if (!(e?.target instanceof Element && e.target.closest('[data-select-menu]'))) setActive(null); }}
            anchorRef={anchorRef}
            portal
            boundsRef={viewportRef}
            className={styles.popover}
            ariaLabel={t('cooling.case3d.direction.label')}
          >
            <div className={styles.popoverTitle}>
              {activeOwner?.name ?? (activeSimRpm !== null ? t('cooling.case3d.sim.fan') : null) ?? `${positionName(activeSlot.position)} ${t('cooling.case3d.size', { size: String(activeSlot.size) })}`}
            </div>
            <ChipGroup
              ariaLabel={t('cooling.case3d.direction.label')}
              options={[{ key: INTAKE, label: t('cooling.case3d.direction.intake') }, { key: EXHAUST, label: t('cooling.case3d.direction.exhaust') }]}
              activeKey={directions[activeSlot.key]}
              onChange={next => setDirection(activeSlot.key, activeSlot.position, next as FanDirection)}
            />
            {activeSlot.key.startsWith('rad:') && caseLayout.radiatorOptions && (
              <ChipGroup
                ariaLabel={t('cooling.case3d.radiator.label')}
                options={caseLayout.radiatorOptions.map(o => ({ key: o.mount, label: positionName(o.mount) }))}
                activeKey={caseLayout.radiatorMount ?? ''}
                onChange={next => { if (next !== caseLayout.radiatorMount) void moveRadiator(next); }}
              />
            )}
            <Select
              ariaLabel={t('cooling.case3d.device.label')}
              value={activeSimRpm !== null ? SIM_VALUE : activeOwnerId === NONE_CHANNEL ? NONE : activeOwnerId ?? NONE}
              options={deviceOptions}
              onChange={id => { if (id !== SIM_VALUE) linkChannel(id, activeSlot.key); else if (activeSimRpm === null) linkChannel(simChannelId(SIM_RPM_DEFAULT), activeSlot.key); }}
            />
            {activeSimRpm !== null && (
              // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
              <Slider orientation="inline" editable trackFill ariaLabel={t('cooling.case3d.sim.speed')} value={activeSimRpm} min={SIM_RPM_MIN} max={SIM_RPM_CEILING} step={SIM_RPM_STEP} formatValue={v => t('cooling.case3d.sim.rpm', { value: String(Math.round(v)) })} onChange={v => setSimPreview({ key: activeSlot.key, rpm: Math.round(v) })} onCommit={v => {
                // A press that changed nothing saves nothing.
                if (simRpm(channelOfSlot(savedBindings, activeSlot.key) ?? '') !== Math.round(v)) linkChannel(simChannelId(Math.round(v)), activeSlot.key);
                setSimPreview(null);
              }} />
            )}
          </Popover>
        )}
      </ThemeScope>
    </div>
  );
}
