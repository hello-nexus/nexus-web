// Live tile content for a 'monitoring' deck action - the touch widget's
// on-screen key and the physical-deck grid preview (the hardware key itself
// is rendered server-side, see deckTarget.computeDeckUploadJobs). The cell's
// background is the standard --deck-accent the DeckGrid button already paints
// (slot.color, else a near-black default set by useCellVisual) - this
// component only draws the name/graph/value content on top of it.
import type { CSSProperties } from 'react';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useSensors } from '../../../hooks/useSensors';
import { useSharedSensorHistory } from '../common/useSharedSensorHistory';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { Sparkline } from '../../../components/common/Sparkline/Sparkline';
import { formatSensorValue } from '../monitoring/sensorValueFormat';
import { splitFormatted } from '../monitoring/gauges/format';
import { labelForDevice } from '../monitoring/MonitoringWidget';
import {
  DECK_MONITORING_DEFAULT_COLOR,
  monitoringFillFraction, monitoringLineDomain, monitoringSensorKey, monitoringTileDomain, resolveMonitoringSensor,
} from './deckMonitoring';
import { resolveDeckTitleStyle, titleFontSizeCss } from './deckTitleStyle';
import type { DeckAction, DeckSlot } from './types';
import styles from './DeckMonitoringCell.module.scss';

// Frozen fixture for the add-widget catalog preview + provider-less mounts:
// a believable CPU-usage reading so the tile looks populated with zero I/O.
// See .agents/rules/widget-preview-fixtures.md in the master repo.
const PREVIEW_SENSOR_NAME = 'CPU Total';
const PREVIEW_FORMATTED = '58 %';
const PREVIEW_VALUE = 58;
const PREVIEW_HISTORY = [22, 28, 24, 35, 40, 38, 45, 42, 50, 46, 55, 48, 60, 52, 58];
const PREVIEW_SENSOR_TYPE = 'Load';

const RADIAL_RADIUS = 38;
// Same arc-with-a-bottom-gap idiom as Arc270Gauge, at this tile's own scale -
// not a shared component, since the tile places the value/name outside the
// ring instead of stacked inside it.
const RADIAL_ARC_DEG = 270;
const RADIAL_START_DEG = 135;
const RADIAL_ARC_LENGTH = (RADIAL_ARC_DEG / 360) * 2 * Math.PI * RADIAL_RADIUS;

function radialPolarPoint(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: 50 + RADIAL_RADIUS * Math.cos(rad), y: 50 + RADIAL_RADIUS * Math.sin(rad) };
}
const RADIAL_START = radialPolarPoint(RADIAL_START_DEG);
const RADIAL_END = radialPolarPoint(RADIAL_START_DEG + RADIAL_ARC_DEG);
const RADIAL_ARC_PATH = `M ${RADIAL_START.x.toFixed(3)} ${RADIAL_START.y.toFixed(3)} A ${RADIAL_RADIUS} ${RADIAL_RADIUS} 0 1 1 ${RADIAL_END.x.toFixed(3)} ${RADIAL_END.y.toFixed(3)}`;

function RadialRing({ fraction, color }: { fraction: number; color: string }) {
  const fillLength = fraction * RADIAL_ARC_LENGTH;
  const gapLength = RADIAL_ARC_LENGTH - fillLength;
  return (
    <svg className={styles.radialSvg} viewBox="0 0 100 100" aria-hidden="true">
      <path d={RADIAL_ARC_PATH} className={styles.radialTrack} />
      <path
        d={RADIAL_ARC_PATH}
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={`${fillLength} ${gapLength}`}
      />
    </svg>
  );
}

export interface DeckMonitoringCellProps {
  action: Extract<DeckAction, { type: 'monitoring' }>;
  label?: DeckSlot['label'];
  title?: DeckSlot['title'];
}

export function DeckMonitoringCell({ action, label, title }: DeckMonitoringCellProps) {
  const preview = usePanelPreview();
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();
  const sensors = useSensors(!preview);
  const sensor = preview ? undefined : resolveMonitoringSensor(sensors, action.category, action.sensor);
  const rawValue = preview ? PREVIEW_VALUE : (sensor?.value ?? 0);
  const key = monitoringSensorKey(action.category, action.sensor);
  // Never pushes/subscribes while preview - see useSharedSensorHistory's
  // `enabled` param; a preview mount must never write into the shared,
  // key-addressed history store a live widget elsewhere might be reading.
  const liveHistory = useSharedSensorHistory(key, preview ? 0 : rawValue, !preview);
  const history = preview ? PREVIEW_HISTORY : (liveHistory as number[]);
  // An unresolved sensor still shows the tile chrome (name + background),
  // falling back to the category's generic label instead of blanking.
  const name = label || (preview ? PREVIEW_SENSOR_NAME : labelForDevice(action.category, sensor?.name ?? ''));
  const formatted = preview
    ? PREVIEW_FORMATTED
    : sensor ? formatSensorValue(sensor.value, sensor.units, sensor.formatted, monitoringTempUnit, numberFormat) : '--';
  const showName = action.showName ?? true;
  const accent = action.color || DECK_MONITORING_DEFAULT_COLOR;
  const titleStyle = resolveDeckTitleStyle(title);
  const domain = monitoringTileDomain(preview ? PREVIEW_SENSOR_TYPE : sensor?.type, history, rawValue);
  const parts = splitFormatted(formatted);

  const nameStyle: CSSProperties = {
    fontFamily: titleStyle.fontFamily || undefined,
    fontWeight: titleStyle.bold ? 700 : undefined,
    fontStyle: titleStyle.italic ? 'italic' : undefined,
    color: titleStyle.color,
    fontSize: titleFontSizeCss(titleStyle.size),
  };
  const valueStyle: CSSProperties = {
    fontFamily: titleStyle.fontFamily || undefined,
    color: titleStyle.color,
  };

  return (
    <div className={styles.tile}>
      {showName && <span className={styles.name} style={nameStyle}>{name}</span>}
      {action.style === 'number' ? (
        <div className={styles.numberWrap}>
          <span className={styles.numberValue} style={valueStyle}>{parts.value}</span>
          {parts.unit && <span className={styles.numberUnit} style={valueStyle}>{parts.unit}</span>}
        </div>
      ) : (
        <>
          <div className={styles.graph}>
            {action.style === 'radial' ? (
              <RadialRing fraction={monitoringFillFraction(rawValue, domain)} color={accent} />
            ) : (
              <Sparkline
                values={history}
                domain={monitoringLineDomain(domain)}
                color={accent}
                strokeColor={accent}
                strokeWidth={2}
                showFill
                width={100}
                height={40}
              />
            )}
          </div>
          <span className={styles.value} style={valueStyle}>{formatted}</span>
        </>
      )}
    </div>
  );
}

export default DeckMonitoringCell;
