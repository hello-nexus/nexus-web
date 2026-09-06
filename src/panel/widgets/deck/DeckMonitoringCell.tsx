// Live tile content for a 'monitoring' deck action, drawn in CSS/SVG: the
// touch widget's on-screen key, and the physical editor grid's fallback
// before its first live frame arrives (a frame, once received, is retained
// across a later disconnect - see DeckGrid's liveTiles). The physical key
// itself, and the editor's live preview once connected, are rendered
// service-side by MonitoringTileRenderer and pushed as JPEG frames, so this
// component owes no pixel parity to that renderer. The cell's background is
// the standard --deck-accent the DeckGrid button already paints (slot.color,
// else a near-black default set by useCellVisual) - this component only
// draws the name/graph/value content on top of it.
import type { CSSProperties } from 'react';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { useSensors } from '../../../hooks/useSensors';
import { useSensorExtras } from '../../../hooks/useSensorExtras';
import { useFpsSensors } from '../../../hooks/useFpsSensors';
import { buildNicNetworkSensors } from '../monitoring/networkSensors';
import { useSharedSensorHistory } from '../common/useSharedSensorHistory';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { Sparkline } from '../../../components/common/Sparkline/Sparkline';
import { formatSensorValue } from '../monitoring/sensorValueFormat';
import { splitFormatted } from '../monitoring/gauges/format';
import { labelForDevice } from '../monitoring/MonitoringWidget';
import {
  DECK_MONITORING_DEFAULT_COLOR, deckCategoryUsesExtras, deckCategoryUsesFps,
  monitoringFillFraction, monitoringFixedDomain, monitoringLineDomain, monitoringSensorKey, monitoringTileDomain, resolveMonitoringSensor,
} from './deckMonitoring';
import { resolveDeckTitleStyle, titleFontSizeCss } from './deckTitleStyle';
import type { DeckAction, DeckSlot } from './types';
import styles from './DeckMonitoringCell.module.scss';

// Frozen fixture for the add-widget catalog preview + provider-less mounts:
// a believable CPU-usage reading so the tile looks populated with zero I/O.
// previewMode.test.tsx is the fixture-sync gate.
const PREVIEW_SENSOR_NAME = 'CPU Total';
const PREVIEW_FORMATTED = '58 %';
const PREVIEW_VALUE = 58;
const PREVIEW_HISTORY = [22, 28, 24, 35, 40, 38, 45, 42, 50, 46, 55, 48, 60, 52, 58];
const PREVIEW_SENSOR_TYPE = 'Load';

// The monitoring page's BackdropGauge dims its fill via the
// --panel-accent-shadow token (src/styles/variables.scss
// --accent-glow-shadow), the accent hue at the app's dark-theme alpha. The
// tile has no light/dark concept of its own - an arbitrary per-key accent
// over a near-black default - so it mirrors that dark-theme alpha as a fixed
// constant applied to the accent hex directly, instead of resolving a themed
// CSS variable.
const BACKDROP_FILL_OPACITY = 0.45;

// Discrete fill bar, same segment count and round-to-nearest idiom as the
// monitoring page's SegmentsGauge - not that component directly, since it
// also renders its own value/label (the tile already places those at fixed
// top/bottom positions outside the graph band). The empty-segment color is a
// fixed translucent white rather than the themed --gauge-track: the tile
// paints over an arbitrary per-key accent/background color, not the app's
// light/dark surface.
const SEGMENTS_COUNT = 16;
const SEGMENTS_TRACK_COLOR = 'rgb(255 255 255 / 0.18)';

function SegmentsBar({ fraction, color }: { fraction: number; color: string }) {
  const filledCount = Math.round(fraction * SEGMENTS_COUNT);
  return (
    <div className={styles.segGroup}>
      {Array.from({ length: SEGMENTS_COUNT }, (_, i) => (
        <div
          key={i}
          className={styles.seg}
          style={{ background: i < filledCount ? color : SEGMENTS_TRACK_COLOR }}
        />
      ))}
    </div>
  );
}

export interface DeckMonitoringCellProps {
  action: Extract<DeckAction, { type: 'monitoring' }>;
  title?: DeckSlot['title'];
}

export function DeckMonitoringCell({ action, title }: DeckMonitoringCellProps) {
  const preview = usePanelPreview();
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();
  const sensors = useSensors(!preview);
  // Gated per category, not per mount: the "extras" topic makes the service
  // gather DIMM/battery/PSU/NIC sensors, and the "fps" topic starts ETW
  // capture, so a tile on any other category must not hold either open.
  const extras = useSensorExtras(!preview && deckCategoryUsesExtras(action.category));
  const fpsSensors = useFpsSensors(!preview && deckCategoryUsesFps(action.category));
  const networkSensors = buildNicNetworkSensors(extras.nics);
  const sensor = preview
    ? undefined
    : resolveMonitoringSensor(sensors, action.category, action.sensor, fpsSensors, networkSensors, extras);
  const rawValue = preview ? PREVIEW_VALUE : (sensor?.value ?? 0);
  const key = monitoringSensorKey(action.category, action.sensor);
  // Never pushes/subscribes while preview - see useSharedSensorHistory's
  // `enabled` param; a preview mount must never write into the shared,
  // key-addressed history store a live widget elsewhere might be reading.
  const liveHistory = useSharedSensorHistory(key, preview ? 0 : rawValue, !preview);
  const history = preview ? PREVIEW_HISTORY : (liveHistory as number[]);
  // An unresolved sensor still shows the tile chrome (name + background),
  // falling back to the category's generic label instead of blanking.
  const name = action.labelText || (preview ? PREVIEW_SENSOR_NAME : labelForDevice(action.category, sensor?.name ?? ''));
  const formatted = preview
    ? PREVIEW_FORMATTED
    : sensor ? formatSensorValue(sensor.value, sensor.units, sensor.formatted, monitoringTempUnit, numberFormat) : '--';
  const showName = action.showName ?? true;
  const accent = action.color || DECK_MONITORING_DEFAULT_COLOR;
  const titleStyle = resolveDeckTitleStyle(title);
  const domain = monitoringFixedDomain(action.scale, action.min, action.max)
    ?? monitoringTileDomain(preview ? PREVIEW_SENSOR_TYPE : sensor?.type, history, rawValue);
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
      {action.style === 'backdrop' && (
        <div className={styles.backdropChart}>
          <Sparkline
            values={history}
            domain={monitoringLineDomain(domain)}
            color={accent}
            strokeWidth={0}
            fillOpacity={BACKDROP_FILL_OPACITY}
            showFill
            width={100}
            height={100}
          />
        </div>
      )}
      {showName && <span className={styles.name} style={nameStyle}>{name}</span>}
      {action.style === 'number' || action.style === 'backdrop' ? (
        <div className={styles.numberWrap}>
          <span className={styles.numberValue} style={valueStyle}>{parts.value}</span>
          {parts.unit && <span className={styles.numberUnit} style={valueStyle}>{parts.unit}</span>}
        </div>
      ) : (
        <>
          <div className={styles.graph}>
            {action.style === 'segments' ? (
              <SegmentsBar fraction={monitoringFillFraction(rawValue, domain)} color={accent} />
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
