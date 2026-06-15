import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../../components/common/Button/Button';
import { Tabs } from '../../../../components/common/Tabs/Tabs';
import { useTranslation } from '../../../../lib/i18n';
import type { FanChannel } from '../../../../api/cooling';
import { CurveCard, computeCurveSpeed } from '../page/CurveEditor';
import { FanCard } from '../page/FanCard';
import type { CoolingImmersiveController } from './useCoolingImmersive';
import styles from './CoolingImmersiveEditor.module.scss';

type CoolingEditorTab = 'curves' | 'fans';

const noopHover = () => {};

/**
 * Immersive cell 2 (the fill cell): Curves | Fans tab shell. The same
 * CurveCard / FanCard leaves the desktop CoolingPage composes, minus the
 * wire layer and drag-reorder — binding goes through each fan's mode
 * dropdown instead.
 */
export function CoolingImmersiveEditor({ cooling }: { cooling: CoolingImmersiveController }) {
  const { t } = useTranslation();
  const [active, setActive] = useState<CoolingEditorTab>('curves');

  const tabs = [
    { key: 'curves', label: t('cooling.sections.curves') },
    { key: 'fans', label: t('cooling.label.fan') },
  ];

  return (
    <div className={styles.editor}>
      <div className={styles.tabs}>
        <Tabs
          tabs={tabs}
          activeKey={active}
          onChange={k => setActive(k as CoolingEditorTab)}
          fullWidth
          ariaLabel={t('cooling.title')}
        />
      </div>
      <div className={styles.body} data-panel-scrollable="true">
        {active === 'curves' ? <CurvesTab cooling={cooling} /> : <FansTab cooling={cooling} />}
      </div>
    </div>
  );
}

function CurvesTab({ cooling }: { cooling: CoolingImmersiveController }) {
  const { t } = useTranslation();
  const { curves, sources, fanStates } = cooling;
  const [expandedCurveId, setExpandedCurveId] = useState<string | null>(null);

  // A deleted curve can't stay expanded (same invariant as CoolingPage).
  useEffect(() => {
    if (expandedCurveId && !curves.some(c => c.id === expandedCurveId)) {
      setExpandedCurveId(null);
    }
  }, [curves, expandedCurveId]);

  const curvesInUse = useMemo(() => {
    const s = new Set<string>();
    for (const fs of Object.values(fanStates)) if (fs.curveId) s.add(fs.curveId);
    return s;
  }, [fanStates]);

  // Live output % per curve, computed once so the recursion-safe Mix path
  // doesn't re-walk per card.
  const curveOutputs = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of curves) m.set(c.id, computeCurveSpeed(c, sources, curves));
    return m;
  }, [curves, sources]);

  const onAdd = () => {
    const id = cooling.addCurve();
    // New curves auto-expand so they can be configured without an extra tap.
    if (id) setExpandedCurveId(id);
  };

  return (
    <div className={styles.tabPane}>
      <div className={styles.paneActions}>
        <Button
          type="button" size="sm" tone="neutral"
          icon={<Plus size={14} aria-hidden />}
          onClick={onAdd}
          disabled={!cooling.canAddCurve}
        >
          {t('cooling.curves.add')}
        </Button>
      </div>
      {curves.length === 0 ? (
        <p className={styles.empty}>{t('cooling.curves.empty')}</p>
      ) : (
        <div className={styles.cardList}>
          {curves.map(c => (
            <CurveCard
              key={c.id} curve={c} allCurves={curves} sources={sources}
              inUse={curvesInUse.has(c.id)}
              expanded={expandedCurveId === c.id}
              outputPercent={curveOutputs.get(c.id) ?? 0}
              onExpand={() => setExpandedCurveId(c.id)}
              onCollapse={() => setExpandedCurveId(null)}
              onHover={noopHover}
              onChange={cooling.saveCurve}
              onDelete={() => cooling.deleteCurve(c.id)}
              onResetPreset={c.preset ? () => cooling.resetPresetCurve(c.preset!) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FansTab({ cooling }: { cooling: CoolingImmersiveController }) {
  const { t } = useTranslation();
  const { channels, curves, fanStates, hubModes, calibrating } = cooling;

  const renderFan = (ch: FanChannel) => (
    <FanCard
      key={ch.id} channel={ch} state={fanStates[ch.id]} curves={curves}
      compact
      calibrating={calibrating}
      canCreateCurve={cooling.canAddCurve}
      hubMode={ch.deviceId ? hubModes[ch.deviceId] : undefined}
      hubSupportsFirmware={ch.deviceId?.startsWith('np50:')}
      onSetMode={v => cooling.setFanMode(ch.id, v)}
      onCreateCurve={() => cooling.createCurveAndAssign(ch.id)}
      onRename={cooling.renameFan}
      onSpeedChange={cooling.setFanSpeed}
    />
  );

  // Panel surfaces only list physically-connected channels: hardware-
  // unresponsive fans are hidden outright, not shown as a Disconnected group.
  const live = channels.filter(c => c.classification !== 'Unresponsive');
  const groups = new Map<string | null, FanChannel[]>();
  for (const ch of live) {
    const key = ch.deviceId || null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ch);
  }

  const blocks: ReactNode[] = [];
  // Motherboard / GPU fans first, flat (same shape as CoolingPage).
  const mobo = groups.get(null);
  if (mobo) for (const ch of mobo) blocks.push(renderFan(ch));
  // Then one labelled group per external hub, in stable order.
  const deviceKeys = Array.from(groups.keys()).filter((k): k is string => !!k).sort();
  for (const key of deviceKeys) {
    const list = groups.get(key)!;
    blocks.push(
      <div key={`${key}-hdr`} className={styles.deviceGroupHeader}>
        {list[0].deviceName ?? key}
      </div>,
    );
    for (const ch of list) blocks.push(renderFan(ch));
  }

  return (
    <div className={styles.tabPane}>
      {calibrating && <p className={styles.calibratingHint}>{t('cooling.calibrate.locked')}</p>}
      {/* Same input lock the desktop page applies to its fan rail: a running
          calibration owns the duty cycle, so every control underneath goes
          inert until it finishes. React 19 treats inert as a real boolean
          prop — an empty-string cast renders nothing. */}
      <div
        inert={calibrating || undefined}
        aria-hidden={calibrating || undefined}
        className={styles.cardList}
      >
        {blocks}
      </div>
    </div>
  );
}
