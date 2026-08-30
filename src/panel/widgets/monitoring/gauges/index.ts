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
};

export const GAUGE_DESIGN_KEYS: GaugeDesignKey[] = [
  'sparkline', 'line', 'mirrorwave', 'backdrop',
  'microbars', 'heatmap', 'segments',
  'text', 'numberfill',
  'bar', 'fill', 'thermo', 'battery', 'hbar', 'dotgrid',
  'waterLevel',
  'caterpillar', 'tickring', 'halfgauge', 'arc270', 'wedge', 'dial',
];

// Designs a round tile scales by --gauge-figure-scale. Membership needs the
// figure layer to measure the whole slot box: Dial, Half Gauge and Wedge stack
// theirs above an info row, so scaling reaches neither the frame nor the
// circle's centre.
export const FRAME_FILLING_DESIGNS: ReadonlySet<GaugeDesignKey> = new Set<GaugeDesignKey>([
  'caterpillar', 'waterLevel', 'tickring', 'arc270', 'backdrop',
]);
