import { useMemo, type ReactNode } from 'react';
import { Power } from 'lucide-react';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import { usePersistentState } from '../../../../hooks/usePersistentState';
import { useTranslation } from '../../../../lib/i18n';
import { type FanChannel, isFanDisconnected } from '../../../../api/cooling';
import { CurveCard } from '../page/CurveEditor';
import { CurveSelector } from '../page/CurveSelector';
import { fanDeviceGroupName } from '../page/deviceGroupName';
import { FanCard } from '../page/FanCard';
import type { CoolingImmersiveController } from './useCoolingImmersive';
import pageStyles from '../CoolingPage.module.scss';
import styles from './CoolingImmersiveEditor.module.scss';

/**
 * Immersive cell 2 (the fill cell): the redesigned cooling-page layout - the
 * pinned hero CurveCard (graph + curve-selector chips + options) over the fan
 * list with its collapsible hub groups - minus the desktop-only concerns
 * (wire layer, drag reorder, calibration flow). Stacked in one scroller on
 * portrait cells; two independent columns (curves | fans, the desktop shape)
 * once the cell is wide enough, via container query.
 */
export function CoolingImmersiveEditor({ cooling }: { cooling: CoolingImmersiveController }) {
  const { t } = useTranslation();
  const { curves, sources, fanStates, selectedCurveId } = cooling;

  // Panel surfaces only list physically-connected channels: hardware-
  // unresponsive fans are hidden outright, not shown as a Disconnected group.
  const liveChannels = useMemo(
    () => cooling.channels.filter(c => !isFanDisconnected(c)),
    [cooling.channels],
  );

  // Number of connected fans bound to each curve, shown under its selector chip.
  const curveFanCounts = useMemo(() => {
    const live = new Set(liveChannels.map(c => c.id));
    const m = new Map<string, number>();
    for (const [fanId, fs] of Object.entries(fanStates)) {
      if (fs.curveId && live.has(fanId)) m.set(fs.curveId, (m.get(fs.curveId) ?? 0) + 1);
    }
    return m;
  }, [fanStates, liveChannels]);

  const selectedCurve = useMemo(
    () => curves.find(c => c.id === selectedCurveId) ?? curves[0] ?? null,
    [curves, selectedCurveId],
  );

  return (
    <div className={styles.editor}>
      <div className={styles.body} data-panel-scrollable="true">
        <div className={styles.curveCol}>
          {selectedCurve ? (
            <CurveCard
              key={selectedCurve.id}
              curve={selectedCurve}
              allCurves={curves}
              sources={sources}
              onChange={cooling.saveCurve}
              onDelete={() => cooling.deleteCurve(selectedCurve.id)}
              onResetPreset={selectedCurve.preset ? () => cooling.resetPresetCurve(selectedCurve.preset!) : undefined}
            >
              <CurveSelector
                curves={curves}
                selectedCurveId={selectedCurve.id}
                curveFanCounts={curveFanCounts}
                onSelect={cooling.selectCurve}
                onAdd={cooling.addCurve}
              />
            </CurveCard>
          ) : (
            <p className={styles.empty}>{t('cooling.curves.empty')}</p>
          )}
        </div>
        <FansSection cooling={cooling} liveChannels={liveChannels} />
      </div>
    </div>
  );
}

function FansSection({ cooling, liveChannels }: {
  cooling: CoolingImmersiveController;
  liveChannels: FanChannel[];
}) {
  const { t } = useTranslation();
  const { curves, fanStates, hubModes, calibrating, selectedCurveId } = cooling;

  // Per-hub-group collapse state, same persistence key as the desktop page so
  // the choice carries across surfaces on the same install.
  const [collapsedFanGroups, setCollapsedFanGroups] = usePersistentState<string[]>('cooling.collapsedFanGroups', ['disconnected']);
  const isFanGroupCollapsed = (key: string) => collapsedFanGroups.includes(key);
  const toggleFanGroup = (key: string) =>
    setCollapsedFanGroups(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  // Selecting a curve highlights every connected fan bound to it.
  const highlightedFanIds = useMemo(() => {
    const s = new Set<string>();
    if (!selectedCurveId) return s;
    for (const [fanId, st] of Object.entries(fanStates)) {
      if (st.curveId === selectedCurveId) s.add(fanId);
    }
    return s;
  }, [selectedCurveId, fanStates]);

  const renderFan = (ch: FanChannel) => (
    <FanCard
      key={ch.id} channel={ch} state={fanStates[ch.id]} curves={curves}
      compact
      calibrating={calibrating}
      canCreateCurve={cooling.canAddCurve}
      highlighted={highlightedFanIds.has(ch.id)}
      hubMode={ch.deviceId ? hubModes[ch.deviceId] : undefined}
      hubSupportsFirmware={ch.deviceId?.startsWith('np50:') || ch.deviceId?.startsWith('qseries:')}
      hubSupportsBios={!ch.deviceId?.startsWith('np50:') && !ch.deviceId?.startsWith('corsair:')}
      onSetMode={v => cooling.setFanMode(ch.id, v)}
      onCreateCurve={() => cooling.createCurveAndAssign(ch.id)}
      onRename={cooling.renameFan}
      onSpeedChange={cooling.setFanSpeed}
      onToggleLock={cooling.setFanLock}
    />
  );

  const groups = new Map<string | null, FanChannel[]>();
  for (const ch of liveChannels) {
    const key = ch.deviceId || null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(ch);
  }

  const blocks: ReactNode[] = [];
  // Motherboard / GPU fans first, flat (same shape as CoolingPage).
  const mobo = groups.get(null);
  if (mobo) for (const ch of mobo) blocks.push(renderFan(ch));
  // Then one collapsible group per external hub, in stable order.
  const deviceKeys = Array.from(groups.keys()).filter((k): k is string => !!k).sort();
  for (const key of deviceKeys) {
    const list = groups.get(key)!;
    const deviceName = fanDeviceGroupName(key, list[0].deviceName);
    blocks.push(
      <CollapsibleSection
        key={key}
        compact
        title={deviceName}
        ariaLabel={deviceName}
        open={!isFanGroupCollapsed(key)}
        onToggle={() => toggleFanGroup(key)}
        right={<span className={pageStyles.fanGroupCount}>{list.length}</span>}
      >
        <div className={pageStyles.fanGroupChildren}>{list.map(renderFan)}</div>
      </CollapsibleSection>,
    );
  }

  return (
    <div className={styles.fanCol}>
      <span className={pageStyles.curveFieldHeader}>{t('cooling.label.fan')}</span>
      {cooling.activePreset === 'off' && (
        <div className={pageStyles.offStatus}
          role="status"
          aria-label={t('cooling.preset.off.banner')}>
          <Power size={13} aria-hidden />
          <span className={pageStyles.offStatusLabel}>{t('cooling.preset.off.banner')}</span>
        </div>
      )}
      {calibrating && <p className={styles.calibratingHint}>{t('cooling.calibrate.locked')}</p>}
      {/* Same input lock the desktop page applies to its fan rail: a running
          calibration owns the duty cycle, so every control underneath goes
          inert until it finishes. React 19 treats inert as a real boolean
          prop - an empty-string cast renders nothing. */}
      <div
        inert={calibrating || undefined}
        aria-hidden={calibrating || undefined}
        className={styles.fanList}
      >
        {blocks}
      </div>
    </div>
  );
}
