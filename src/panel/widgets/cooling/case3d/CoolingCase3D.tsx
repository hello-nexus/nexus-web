import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Link2, Link2Off } from 'lucide-react';
import type { FanChannel } from '../../../../api/cooling';
import { Badge } from '../../../../components/common/Badge/Badge';
import { Button } from '../../../../components/common/Button/Button';
import { Slider } from '../../../../components/common/Slider/Slider';
import { Toggle } from '../../../../components/common/Toggle/Toggle';
import { ChipGroup } from '../../../../components/common/ChipGroup/ChipGroup';
import { Notice } from '../../../../components/common/Notice/Notice';
import { Popover } from '../../../../components/common/Popover/Popover';
import { EmptyState } from '../../../../components/common/EmptyState/EmptyState';
import { requestOpenBuild } from '../../../../components/views/BuildPage/buildNav';
import { useCoolingLayout } from '../../../../hooks/useCoolingLayout';
import { usePcSetupRecord } from '../../../../hooks/usePcSetupRecord';
import { useTranslation } from '../../../../lib/i18n';
import {
  channelOfSlot, directionOf, fanGeometries, parseCaseLayout, slotsOfChannel, toggleBinding, withDirection,
} from '../../../../lib/cooling/caseLayout';
import { catalogFanSpecs, slotModelFans } from '../../../../lib/cooling/fanSpecs';
import { solveCasePressure, type FanDirection, type PressureFan } from '../../../../lib/cooling/pressureModel';
import type { FlowInput } from '../../../../lib/cooling/flow/gridScene';
import type { FlowOptions } from '../../../../lib/cooling/flow/flowLayer';
import { createCaseRenderer, type CaseSceneRenderer, type PickHandler } from './coolingCaseRenderer';
import styles from './CoolingCase3D.module.scss';

export interface CoolingCase3DProps {
  channels: FanChannel[];
  /** The fan selected in the left rail; null unless exactly one is. */
  selectedChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
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
};

const INTAKE: FanDirection = 'intake';
const EXHAUST: FanDirection = 'exhaust';

export function CoolingCase3D({ channels, selectedChannelId, onSelectChannel }: CoolingCase3DProps) {
  const { t } = useTranslation();
  const { record, loaded } = usePcSetupRecord(true);
  const { layout: coolingLayout, settled: layoutSettled, failed: layoutFailed, edit } = useCoolingLayout(true);
  // Parsed once per distinct layout: a setup ping that changes nothing here keeps the same object, so the scene and camera stay.
  const layoutText = JSON.stringify(record?.setup.resolved.caseLayout ?? null);
  const caseLayout = useMemo(() => parseCaseLayout(JSON.parse(layoutText)), [layoutText]);
  const [active, setActive] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const anchorRef = useRef<HTMLDivElement>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [renderer, setRenderer] = useState<CaseSceneRenderer | null>(null);
  const [particles, setParticles] = useState(true);
  const [deadZones, setDeadZones] = useState(false);
  const [debugSolids, setDebugSolids] = useState(false);
  const [density, setDensity] = useState(60);
  const [flowSupported, setFlowSupported] = useState(true);

  const directions = useMemo(() => {
    const out: Record<string, FanDirection> = {};
    for (const slot of caseLayout?.fanSlots ?? []) out[slot.key] = directionOf(slot, coolingLayout.directions);
    return out;
  }, [caseLayout, coolingLayout.directions]);

  const model = useMemo(() => {
    if (!caseLayout) return null;
    const catalog = catalogFanSpecs(record?.setup.items ?? []);
    let estimated = false;
    const fans: PressureFan[] = [];
    for (const slot of caseLayout.fanSlots) {
      for (const fan of slotModelFans(slot, catalog)) {
        estimated ||= fan.estimated;
        fans.push({ key: fan.key, cfm: fan.cfm, staticMmH2O: fan.staticMmH2O, direction: directions[slot.key] });
      }
    }
    return { result: solveCasePressure(fans), estimated, fanCount: fans.length };
  }, [caseLayout, record, directions]);

  const handlers = useRef<{ pick: PickHandler }>({ pick: () => {} });
  handlers.current.pick = (key, x, y) => {
    const owner = key && !selectedChannelId ? channelOfSlot(coolingLayout.bindings, key) : null;
    if (owner && channels.some(c => c.id === owner)) {
      setActive(null);
      onSelectChannel(owner);
      return;
    }
    setActive(key);
    if (!key) return;
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

  // The same flow input for the same content: a setup ping that changes nothing here must not restart the solve.
  const flowKey = model && model.fanCount > 0
    ? JSON.stringify([layoutText, directions, model.result.fans.map(f => [f.key, Math.round(f.cfm)]), Math.round(model.result.ventCfm)])
    : '';
  const flowInput = useMemo<FlowInput | null>(() => {
    if (!caseLayout || !model || flowKey === '') return null;
    const fanCfm: Record<string, number> = {};
    for (const f of model.result.fans) fanCfm[f.key] = f.cfm;
    return { layout: caseLayout, directions, fanCfm, ventCfm: model.result.ventCfm };
    // flowKey covers every input read here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowKey]);
  const flowOptions = useMemo<FlowOptions>(() => ({ particles, deadZones, density: density / 100, debugSolids }), [particles, deadZones, density, debugSolids]);

  const highlighted = useMemo(() => new Set(slotsOfChannel(coolingLayout.bindings, selectedChannelId)), [coolingLayout.bindings, selectedChannelId]);
  const bound = useMemo(() => new Set(coolingLayout.bindings.flatMap(b => b.slotKeys)), [coolingLayout.bindings]);

  useEffect(() => {
    if (!caseLayout || !renderer) return;
    renderer.setState({ layout: caseLayout, directions, highlighted, bound, active, flow: flowInput, flowOptions });
    setFlowSupported(renderer.flowSupported);
  }, [renderer, caseLayout, directions, highlighted, bound, active, flowInput, flowOptions]);

  const setDirection = useCallback((key: string, position: string, direction: FanDirection) => {
    edit(l => ({ ...l, directions: withDirection(l.directions, { key, position }, direction) }));
  }, [edit]);

  const toggleLink = useCallback((channelId: string, key: string) => {
    edit(l => ({ ...l, bindings: toggleBinding(l.bindings, channelId, key) }));
  }, [edit]);

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
  const activeOwner = activeSlot ? channels.find(c => c.id === channelOfSlot(coolingLayout.bindings, activeSlot.key)) : undefined;
  const linkedToSelected = !!activeSlot && highlighted.has(activeSlot.key);
  const selectedName = channels.find(c => c.id === selectedChannelId)?.name;
  const result = model?.result;
  const modeKey = result ? `cooling.case3d.pressure.${result.mode}` : '';
  const cfm = (v: number) => t('cooling.case3d.cfm', { value: String(Math.round(Math.abs(v))) });

  return (
    <div className={styles.root}>
      {result && model && (
        <div className={styles.stats} role="group" aria-label={t('cooling.case3d.stats.label')}>
          {model.fanCount === 0 ? (
            <span className={styles.statNote}>{t('cooling.case3d.noFans')}</span>
          ) : (
            <>
              <span className={`${styles.mode} ${styles[result.mode]}`}>{t(modeKey)}</span>
              <span className={styles.stat}><span className={styles.statLabel}>{t('cooling.case3d.stat.net')}</span>{result.netCfm >= 0 ? '+' : '-'}{cfm(result.netCfm)}</span>
              <span className={styles.stat}><span className={styles.statLabel}>{t('cooling.case3d.stat.intake')}</span>{cfm(result.intakeCfm)}</span>
              <span className={styles.stat}><span className={styles.statLabel}>{t('cooling.case3d.stat.exhaust')}</span>{cfm(result.exhaustCfm)}</span>
              {model.estimated && <Badge compact uppercase label={t('cooling.case3d.estimate')} tooltip={{ body: t('cooling.case3d.estimate.body') }} />}
            </>
          )}
        </div>
      )}
      <div className={styles.flowBar} role="group" aria-label={t('cooling.case3d.flow.controls')}>
        <label className={styles.flowToggle}>
          <Toggle checked={particles} onChange={setParticles} ariaLabel={t('cooling.case3d.flow.particles')} />
          <span>{t('cooling.case3d.flow.particles')}</span>
        </label>
        <label className={styles.flowToggle}>
          <Toggle checked={deadZones} onChange={setDeadZones} ariaLabel={t('cooling.case3d.flow.deadZones')} />
          <span>{t('cooling.case3d.flow.deadZones')}</span>
        </label>
        <label className={styles.flowToggle}>
          <Toggle checked={debugSolids} onChange={setDebugSolids} ariaLabel={t('cooling.case3d.flow.solids')} />
          <span>{t('cooling.case3d.flow.solids')}</span>
        </label>
        {particles && (
          <div className={styles.flowDensity}>
            {/* eslint-disable-next-line i18next/no-literal-string -- slider layout enum */}
            <Slider orientation="stacked" editable trackFill label={t('cooling.case3d.flow.density')} value={density} min={10} max={100} onChange={v => setDensity(v)} />
          </div>
        )}
      </div>
      {!flowSupported && <Notice tone="info" role="status">{t('cooling.case3d.flow.unsupported')}</Notice>}
      {layoutFailed && <Notice tone="warning" role="status">{t('cooling.case3d.layoutError')}</Notice>}
      <div className={styles.hint}>
        {selectedName ? t('cooling.case3d.hint.bind', { name: selectedName }) : t('cooling.case3d.hint.select')}
      </div>
      <div className={styles.viewport}>
        <canvas ref={setCanvas} className={styles.canvas} role="img" aria-label={t('cooling.case3d.canvas')} />
        {particles && flowSupported && (
          <div className={styles.legend} role="group" aria-label={t('cooling.case3d.flow.legend')}>
            <span>{t('cooling.case3d.flow.cooler')}</span>
            <span className={styles.legendBar} aria-hidden="true" />
            <span>{t('cooling.case3d.flow.warmer')}</span>
          </div>
        )}
        <div ref={anchorRef} className={styles.anchor} style={{ left: anchor.x, top: anchor.y }} />
        {activeSlot && (
          <Popover open onClose={() => setActive(null)} anchorRef={anchorRef} portal className={styles.popover} ariaLabel={t('cooling.case3d.direction.label')}>
            <div className={styles.popoverTitle}>
              {t(POSITION_KEYS[activeSlot.position] ?? 'cooling.case3d.position.other')} {t('cooling.case3d.size', { size: String(activeSlot.size) })}
            </div>
            <ChipGroup
              ariaLabel={t('cooling.case3d.direction.label')}
              options={[{ key: INTAKE, label: t('cooling.case3d.direction.intake') }, { key: EXHAUST, label: t('cooling.case3d.direction.exhaust') }]}
              activeKey={directions[activeSlot.key]}
              onChange={next => setDirection(activeSlot.key, activeSlot.position, next as FanDirection)}
            />
            <div className={styles.popoverNote}>
              {activeOwner ? t('cooling.case3d.bound', { name: activeOwner.name }) : t('cooling.case3d.unbound')}
            </div>
            {selectedChannelId && (
              <Button
                size="sm"
                tone="neutral"
                icon={linkedToSelected ? <Link2Off size={13} strokeWidth={1.8} /> : <Link2 size={13} strokeWidth={1.8} />}
                onClick={() => toggleLink(selectedChannelId, activeSlot.key)}
              >
                {linkedToSelected ? t('cooling.case3d.unlink') : t('cooling.case3d.link', { name: selectedName ?? '' })}
              </Button>
            )}
          </Popover>
        )}
      </div>
    </div>
  );
}
