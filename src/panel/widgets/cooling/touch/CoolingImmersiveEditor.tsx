import { useMemo, type ReactNode } from 'react';
import { Ban, CheckCheck, Power } from 'lucide-react';
import { Button } from '../../../../components/common/Button/Button';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import { usePersistentState } from '../../../../hooks/usePersistentState';
import { useTranslation } from '../../../../lib/i18n';
import { type FanChannel, isFanDisconnected } from '../../../../api/cooling';
import { EffectEditor } from '../../lighting/effecteditor/EffectEditor';
import { CurveCard } from '../page/CurveEditor';
import { CurveSelector } from '../page/CurveSelector';
import { fanDeviceGroupName } from '../page/deviceGroupName';
import { FanCard } from '../page/FanCard';
import type { CoolingImmersiveController } from './useCoolingImmersive';
import pageStyles from '../CoolingPage.module.scss';
import styles from './CoolingImmersiveEditor.module.scss';

/**
 * Immersive cell 2 (the fill cell): the lighting immersive's tabbed editor
 * shell, carrying Devices (the fan list with its collapsible hub groups) and
 * Curves (the selector chips over the graph and the selected curve's options).
 * Drops the desktop-only concerns: wire layer, drag reorder, calibration flow.
 */
export function CoolingImmersiveEditor({ cooling }: { cooling: CoolingImmersiveController }) {
  const { t } = useTranslation();

  // Panel surfaces only list physically-connected channels: hardware-
  // unresponsive fans are hidden outright, not shown as a Disconnected group.
  const liveChannels = useMemo(
    () => cooling.channels.filter(c => !isFanDisconnected(c)),
    [cooling.channels],
  );

  return (
    <EffectEditor
      ariaLabel={t('cooling.title')}
      devices={<FansSection cooling={cooling} liveChannels={liveChannels} />}
      optionsLabel={t('cooling.label.curves')}
      options={<CurvesSection cooling={cooling} liveChannels={liveChannels} />}
    />
  );
}

/** Curves tab: the selector chips on top, then the graph and its options. */
function CurvesSection({ cooling, liveChannels }: {
  cooling: CoolingImmersiveController;
  liveChannels: FanChannel[];
}) {
  const { t } = useTranslation();
  const { curves, sources, fanStates, selectedCurveId } = cooling;

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

  // Fans the selected curve drives; a Sync curve may not follow its own output.
  const syncExcludedIds = useMemo(
    () => liveChannels.filter(c => fanStates[c.id]?.curveId === selectedCurve?.id).map(c => c.id),
    [liveChannels, fanStates, selectedCurve],
  );

  return (
    <div className={styles.curveCol}>
      {/* A sibling, not CurveCard's children: the card renders those under its graph. */}
      <CurveSelector
        curves={curves}
        selectedCurveId={selectedCurve?.id ?? null}
        curveFanCounts={curveFanCounts}
        onSelect={cooling.selectCurve}
        onAdd={cooling.addCurve}
      />
      {selectedCurve ? (
        <CurveCard
          key={selectedCurve.id}
          curve={selectedCurve}
          allCurves={curves}
          sources={sources}
          channels={liveChannels}
          syncExcludedIds={syncExcludedIds}
          onChange={cooling.saveCurve}
          onDelete={() => cooling.deleteCurve(selectedCurve.id)}
          onResetPreset={selectedCurve.preset ? () => cooling.resetPresetCurve(selectedCurve.preset!) : undefined}
        />
      ) : (
        <p className={styles.empty}>{t('cooling.curves.empty')}</p>
      )}
    </div>
  );
}

function FansSection({ cooling, liveChannels }: {
  cooling: CoolingImmersiveController;
  liveChannels: FanChannel[];
}) {
  const { t } = useTranslation();
  const { curves, fanStates, hubModes, calibrating, selectedCurveId, selectedFanIds } = cooling;

  // Only the fans this tab actually lists, so select-all cannot reach a card
  // the panel hides.
  const selectableIds = useMemo(() => {
    const listed = new Set(liveChannels.map(c => c.id));
    return cooling.selectableFanIds.filter(id => listed.has(id));
  }, [cooling.selectableFanIds, liveChannels]);
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedFanIds.has(id));

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
      selected={selectedFanIds.has(ch.id)}
      onSelect={() => cooling.toggleFanSelection(ch.id)}
      onSelectOnly={() => cooling.setSelectedFanIds(new Set([ch.id]))}
      bulk={cooling.bulkForFan(ch)}
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
      onToggleControlled={cooling.setFanControlled}
      onSetRole={cooling.setFanRole}
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
      {selectableIds.length > 0 && (
        <div className={styles.bulkRow}>
          <Button
            tone="ghost"
            size="sm"
            icon={<CheckCheck />}
            disabled={allSelected}
            onClick={() => cooling.setSelectedFanIds(new Set(selectableIds))}
          >
            {t('lighting.ledMap.selectAll')}
          </Button>
          <Button
            tone="ghost"
            size="sm"
            icon={<Ban />}
            disabled={selectedFanIds.size === 0}
            onClick={() => cooling.setSelectedFanIds(new Set())}
          >
            {t('lighting.ledMap.selectNone')}
          </Button>
        </div>
      )}
      {cooling.activeMode === 'off' && (
        <div className={pageStyles.offStatus}
          role="status"
          aria-label={t('cooling.mode.off.banner')}>
          <Power size={13} aria-hidden />
          <span className={pageStyles.offStatusLabel}>{t('cooling.mode.off.banner')}</span>
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
