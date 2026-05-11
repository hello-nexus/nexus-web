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
};

export const GAUGE_DESIGN_KEYS: GaugeDesignKey[] = [
  'sparkline', 'line', 'microbars', 'text', 'numberfill',
  'waterLevel', 'thermo', 'bar', 'battery', 'hbar', 'dotgrid',
  'halfgauge', 'caterpillar', 'arc270', 'wedge',
];
