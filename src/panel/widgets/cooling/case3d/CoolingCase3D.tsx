import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box } from 'lucide-react';
import type { FanChannel } from '../../../../api/cooling';
import { Badge } from '../../../../components/common/Badge/Badge';
import { Button } from '../../../../components/common/Button/Button';
import { ChipGroup } from '../../../../components/common/ChipGroup/ChipGroup';
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
  const { layout: coolingLayout, loaded: layoutLoaded, edit } = useCoolingLayout(true);
  const caseLayout = useMemo(() => parseCaseLayout(record?.setup.resolved.caseLayout), [record]);
  const [active, setActive] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const anchorRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CaseSceneRenderer | null>(null);

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
    setActive(key);
    if (!key) return;
    setAnchor({ x, y });
    if (selectedChannelId) {
      edit(l => ({ ...l, bindings: toggleBinding(l.bindings, selectedChannelId, key) }));
      return;
    }
    const owner = channelOfSlot(coolingLayout.bindings, key);
    if (owner && channels.some(c => c.id === owner)) onSelectChannel(owner);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !caseLayout) return undefined;
    const renderer = createCaseRenderer(canvas, (key, x, y) => handlers.current.pick(key, x, y));
    rendererRef.current = renderer;
    const observer = new ResizeObserver(() => renderer.resize());
    observer.observe(canvas);
    renderer.resize();
    return () => {
      observer.disconnect();
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [caseLayout]);

  const highlighted = useMemo(() => new Set(slotsOfChannel(coolingLayout.bindings, selectedChannelId)), [coolingLayout.bindings, selectedChannelId]);
  const bound = useMemo(() => new Set(coolingLayout.bindings.flatMap(b => b.slotKeys)), [coolingLayout.bindings]);

  useEffect(() => {
    if (caseLayout) rendererRef.current?.setState({ layout: caseLayout, directions, highlighted, bound, active });
  }, [caseLayout, directions, highlighted, bound, active]);

  const setDirection = useCallback((key: string, position: string, direction: FanDirection) => {
    edit(l => ({ ...l, directions: withDirection(l.directions, { key, position }, direction) }));
  }, [edit]);

  if (!loaded || !layoutLoaded) return <div className={styles.root} />;

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
      <div className={styles.hint}>
        {selectedName ? t('cooling.case3d.hint.bind', { name: selectedName }) : t('cooling.case3d.hint.select')}
      </div>
      <div className={styles.viewport}>
        <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={t('cooling.case3d.canvas')} />
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
          </Popover>
        )}
      </div>
    </div>
  );
}
