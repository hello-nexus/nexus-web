// @hellonexus/ui — the author-facing component vocabulary (worker face, react@18).
//
// Each component is a thin @remote-dom wrapper around a registered RemoteElement.
// Authors compose ONLY these; props are semantic (tone/size/variant) and theme
// through host tokens — there is no raw style/className escape, which is what
// keeps every SDK widget visually consistent with native ones. The host renders
// the matching real component; an element the host doesn't know renders nothing.

import type { ReactNode } from 'react';
import { createRemoteComponent } from '@remote-dom/react';
import { ELEMENT_CTORS, registerElements } from './elements';
import type { UiTone } from '../../src/sandbox/contract/elements';

registerElements();

type Align = 'start' | 'center' | 'end' | 'baseline' | 'stretch';
type Justify = 'start' | 'center' | 'end' | 'between' | 'around';
type Weight = 'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'black';
type Transform = 'none' | 'uppercase' | 'lowercase' | 'capitalize';

interface WithChildren { children?: ReactNode }

export interface StackProps extends WithChildren {
  direction?: 'row' | 'column';
  gap?: number; padding?: number;
  align?: Align; justify?: Justify;
  wrap?: boolean; grow?: boolean; flex?: number;
}
export interface GridProps extends WithChildren {
  columns?: number; rows?: number; gap?: number; padding?: number;
  align?: Align; justify?: Justify; grow?: boolean;
}
export interface FrameProps extends WithChildren {
  padding?: number; gap?: number; direction?: 'row' | 'column';
  align?: Align; justify?: Justify; tone?: UiTone; radius?: number;
  border?: boolean; grow?: boolean;
}
export interface SpacerProps { size?: number }
export interface DividerProps { tone?: UiTone }
export interface TextProps extends WithChildren {
  value?: string | number; tone?: UiTone;
  size?: number | string; weight?: Weight; align?: Align;
  transform?: Transform; mono?: boolean; opacity?: number;
  letterSpacing?: number; lineHeight?: number; tabular?: boolean; truncate?: boolean;
}
export interface IconProps { name: string; size?: number; tone?: UiTone }
export interface RingProps extends WithChildren {
  value: number; min?: number; max?: number;
  label?: string; sublabel?: string; tone?: UiTone; thickness?: number;
}
export interface BarProps { value: number; min?: number; max?: number; tone?: UiTone; label?: string }
export interface GaugeProps { value: number; min?: number; max?: number; tone?: UiTone; label?: string; sublabel?: string }
export interface SparklineProps { values: number[]; min?: number; max?: number; tone?: UiTone }
export interface SliderProps {
  value: number; min?: number; max?: number; step?: number;
  tone?: UiTone; label?: string; disabled?: boolean;
  onInput?: (value: number) => void; onChange?: (value: number) => void;
}
export interface ButtonProps extends WithChildren {
  label?: string; tone?: UiTone; variant?: 'solid' | 'soft' | 'ghost';
  disabled?: boolean; icon?: string; size?: 'sm' | 'md' | 'lg';
  onPress?: () => void;
}
export interface StepperProps {
  value: number; min?: number; max?: number; step?: number;
  label?: string; disabled?: boolean; onChange?: (value: number) => void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export const Stack = createRemoteComponent('ui-stack' as any, ELEMENT_CTORS['ui-stack']) as unknown as React.FC<StackProps>;
export const Grid = createRemoteComponent('ui-grid' as any, ELEMENT_CTORS['ui-grid']) as unknown as React.FC<GridProps>;
export const Frame = createRemoteComponent('ui-frame' as any, ELEMENT_CTORS['ui-frame']) as unknown as React.FC<FrameProps>;
export const Spacer = createRemoteComponent('ui-spacer' as any, ELEMENT_CTORS['ui-spacer']) as unknown as React.FC<SpacerProps>;
export const Divider = createRemoteComponent('ui-divider' as any, ELEMENT_CTORS['ui-divider']) as unknown as React.FC<DividerProps>;
export const Text = createRemoteComponent('ui-text' as any, ELEMENT_CTORS['ui-text']) as unknown as React.FC<TextProps>;
export const Icon = createRemoteComponent('ui-icon' as any, ELEMENT_CTORS['ui-icon']) as unknown as React.FC<IconProps>;
export const Ring = createRemoteComponent('ui-ring' as any, ELEMENT_CTORS['ui-ring']) as unknown as React.FC<RingProps>;
export const Bar = createRemoteComponent('ui-bar' as any, ELEMENT_CTORS['ui-bar']) as unknown as React.FC<BarProps>;
export const Gauge = createRemoteComponent('ui-gauge' as any, ELEMENT_CTORS['ui-gauge']) as unknown as React.FC<GaugeProps>;
export const Sparkline = createRemoteComponent('ui-sparkline' as any, ELEMENT_CTORS['ui-sparkline']) as unknown as React.FC<SparklineProps>;
export const Slider = createRemoteComponent('ui-slider' as any, ELEMENT_CTORS['ui-slider'], {
  eventProps: { onInput: { event: 'input' }, onChange: { event: 'change' } },
} as any) as unknown as React.FC<SliderProps>;
export const Button = createRemoteComponent('ui-button' as any, ELEMENT_CTORS['ui-button'], {
  eventProps: { onPress: { event: 'press' } },
} as any) as unknown as React.FC<ButtonProps>;
export const Stepper = createRemoteComponent('ui-stepper' as any, ELEMENT_CTORS['ui-stepper'], {
  eventProps: { onChange: { event: 'change' } },
} as any) as unknown as React.FC<StepperProps>;
/* eslint-enable @typescript-eslint/no-explicit-any */
