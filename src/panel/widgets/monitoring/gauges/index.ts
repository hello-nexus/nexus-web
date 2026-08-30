import type { ComponentType } from 'react';
import type { GaugeProps, GaugeDesignKey } from './types';
import { SparklineGauge } from './SparklineGauge';
import { LineGauge } from './LineGauge';
import { TextGauge } from './TextGauge';
import { WaterLevelGauge } from './WaterLevelGauge';
import { CaterpillarGauge } from './CaterpillarGauge';
import { BarGauge } from './BarGauge';
import { MicrobarsGauge } from './MicrobarsGauge';
import { HbarGauge } from './HbarGauge';
import { DotGridGauge } from './DotGridGauge';
import { HalfGaugeGauge } from './HalfGaugeGauge';
import { NumberFillGauge } from './NumberFillGauge';
import { ThermometerGauge } from './ThermometerGauge';
import { Arc270Gauge } from './Arc270Gauge';
import { WedgeGauge } from './WedgeGauge';
import { BatteryGauge } from './BatteryGauge';
import { SegmentsGauge } from './SegmentsGauge';
import { MirrorWaveGauge } from './MirrorWaveGauge';
import { HeatmapGauge } from './HeatmapGauge';
import { DialGauge } from './DialGauge';
import { TickRingGauge } from './TickRingGauge';
import { BackdropGauge } from './BackdropGauge';
import { FillGauge } from './FillGauge';
import { RimRingGauge } from './RimRingGauge';
import { RimTicksGauge } from './RimTicksGauge';
import { RimArcGauge } from './RimArcGauge';
import { OrbGauge } from './OrbGauge';

export type { GaugeProps, GaugeDesignKey };

export const GAUGE_DESIGNS: Record<GaugeDesignKey, ComponentType<GaugeProps>> = {
  sparkline: SparklineGauge,
  line: LineGauge,
  text: TextGauge,
  waterLevel: WaterLevelGauge,
  caterpillar: CaterpillarGauge,
  bar: BarGauge,
  microbars: MicrobarsGauge,
  hbar: HbarGauge,
  dotgrid: DotGridGauge,
  halfgauge: HalfGaugeGauge,
  numberfill: NumberFillGauge,
  thermo: ThermometerGauge,
  arc270: Arc270Gauge,
  wedge: WedgeGauge,
  battery: BatteryGauge,
  segments: SegmentsGauge,
  mirrorwave: MirrorWaveGauge,
  heatmap: HeatmapGauge,
  dial: DialGauge,
  tickring: TickRingGauge,
  backdrop: BackdropGauge,
  fill: FillGauge,
  rimring: RimRingGauge,
  rimticks: RimTicksGauge,
  rimarc: RimArcGauge,
  orb: OrbGauge,
};

export const GAUGE_DESIGN_LABELS: Record<GaugeDesignKey, string> = {
  sparkline: 'Filled Line',
  line: 'Sparkline',
  text: 'Large Value',
  waterLevel: 'Liquid Fill',
  caterpillar: 'Ring',
  bar: 'Progress Bar',
  microbars: 'Micro Bars',
  hbar: 'Block Stack',
  dotgrid: 'Dot Grid',
  halfgauge: 'Half Gauge',
  numberfill: 'Number Fill',
  thermo: 'Thermometer',
  arc270: '3/4 Gauge',
  wedge: 'Wedge',
  battery: 'Battery',
  segments: 'Segments',
  mirrorwave: 'Waveform',
  heatmap: 'Heatmap',
  dial: 'Dial',
  tickring: 'Tick Ring',
  backdrop: 'Backdrop',
  fill: 'Fill',
  rimring: 'Rim Ring',
  rimticks: 'Rim Ticks',
  rimarc: 'Rim Arc',
  orb: 'Orb',
};

export const GAUGE_DESIGN_KEYS: GaugeDesignKey[] = [
  'sparkline', 'line', 'mirrorwave', 'backdrop',
  'microbars', 'heatmap', 'segments',
  'text', 'numberfill',
  'bar', 'fill', 'thermo', 'battery', 'hbar', 'dotgrid',
  'waterLevel',
  'caterpillar', 'tickring', 'halfgauge', 'arc270', 'wedge', 'dial',
];

// Round-tile designs. Offered only on the 2x2round glass (the Kraken LCD),
// which is why they are absent from GAUGE_DESIGN_KEYS above: each one paints a
// collar on the rim, so it needs the whole disc rather than the inscribed
// square a square-tile design lays out in.
export const ROUND_DESIGN_KEYS: GaugeDesignKey[] = [
  'rimring', 'rimticks', 'rimarc', 'orb',
];

// Designs that own the disc edge to edge. The round tile renders these at the
// full diameter instead of the inscribed square - see AppManifest.roundFit and
// the [data-size='2x2round'] .cellScaler rule in PanelApp.module.scss.
export const ROUND_FULL_BLEED_DESIGNS: ReadonlySet<GaugeDesignKey> = new Set(ROUND_DESIGN_KEYS);
