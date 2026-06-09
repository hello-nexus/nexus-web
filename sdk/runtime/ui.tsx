// @hellonexus/ui — the author-facing component vocabulary (worker face, react@18).
//
// Each component is a thin @remote-dom wrapper around a registered RemoteElement.
// Authors compose ONLY these; props are semantic (tone/size/variant) and theme
// through host tokens — there is no raw style/className escape, which is what
// keeps every SDK widget visually consistent with native ones. The host renders
// the matching real component; an element the host doesn't know renders nothing.

import { createElement, forwardRef, useRef, type ReactNode } from 'react';
import { createRemoteComponent } from '@remote-dom/react';
import { ELEMENT_CTORS, registerElements } from './elements';
import type { UiTone } from '../../src/sandbox/contract/elements';

registerElements();

// @remote-dom delivers a RemoteEvent to the listener (the value is in `.detail`),
// so a bare createRemoteComponent hands authors an event object, not the value.
// This wraps each event prop to pass `event.detail` through, with a STABLE listener
// identity (reads the latest author fn from a ref) so there's no per-render
// add/removeEventListener churn while typing.
/* eslint-disable @typescript-eslint/no-explicit-any */
function eventComponent<P>(tag: string, ctor: any, events: ReadonlyArray<readonly [string, string]>): React.FC<P> {
  const Raw = createRemoteComponent(tag as any, ctor, {
    eventProps: Object.fromEntries(events.map(([prop, ev]) => [prop, { event: ev }])),
  } as any);
  const Wrapped = forwardRef(function Wrapped(props: any, ref: any) {
    const latest = useRef<Record<string, any>>({});
    const stable = useRef<Record<string, (e: any) => void> | null>(null);
    if (!stable.current) {
      stable.current = {};
      for (const [prop] of events) stable.current[prop] = (e: any) => latest.current[prop]?.(e?.detail);
    }
    const next: any = { ...props, ref };
    for (const [prop] of events) {
      latest.current[prop] = props[prop];
      next[prop] = props[prop] ? stable.current[prop] : undefined;
    }
    return createElement(Raw as any, next);
  });
  return Wrapped as unknown as React.FC<P>;
}

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
export interface RangeProps {
  lo: number; hi: number; min?: number; max?: number;
  gradient?: 'temp' | 'accent'; glow?: boolean; height?: number; radius?: number;
}
export interface GaugeProps { value: number; min?: number; max?: number; tone?: UiTone; label?: string; sublabel?: string }
export interface SparklineProps { values: number[]; min?: number; max?: number; tone?: UiTone }
export interface SpinnerProps { size?: number; tone?: UiTone }
export interface SliderProps {
  value: number; min?: number; max?: number; step?: number;
  tone?: UiTone; label?: string; disabled?: boolean;
  onInput?: (value: number) => void; onChange?: (value: number) => void;
}
export interface ButtonProps extends WithChildren {
  label?: string; tone?: UiTone; variant?: 'solid' | 'soft' | 'ghost';
  disabled?: boolean; icon?: string; size?: 'sm' | 'md' | 'lg';
  onPress?: () => void;
  /** Fires on a press held past the long-press threshold (touch + mouse). */
  onLongPress?: () => void;
}
export interface StepperProps {
  value: number; min?: number; max?: number; step?: number;
  label?: string; disabled?: boolean; onChange?: (value: number) => void;
}
export interface ImageProps {
  src: string; alt?: string; fit?: 'cover' | 'contain' | 'fill' | 'none';
  radius?: number; width?: number; height?: number; aspect?: string | number; tone?: UiTone;
}
export interface ScrollProps extends WithChildren {
  direction?: 'vertical' | 'horizontal' | 'both'; gap?: number; padding?: number; grow?: boolean;
}
export interface InputProps {
  /** A value to SET programmatically (reset / computed result). Not a controlled
   *  binding — typing is local + reported via onValueChange, so the cursor stays put. */
  value?: string; placeholder?: string; type?: 'text' | 'number' | 'search' | 'password';
  disabled?: boolean; maxLength?: number; tone?: UiTone; align?: Align; size?: 'sm' | 'md'; mono?: boolean;
  // Non-DOM names on purpose: onInput/onBlur collide with React-18 synthetic
  // events in the worker and would deliver an event object instead of the value.
  onValueChange?: (value: string) => void; onEnter?: (value: string) => void; onLeave?: (value: string) => void;
}
export interface ChartSeriesInput { values: number[]; tone?: UiTone; area?: boolean }
export interface ChartProps {
  series: ChartSeriesInput[]; min?: number; max?: number; height?: number; gridlines?: boolean; tone?: UiTone;
}
// Blessed composites — the host renders the real native component (the day/night
// world clock page body, the clock designs, the standard page header). Lets an
// SDK page be a first-class native page with zero duplication.
export interface WorldClockProps { highlightTz?: string }
export interface ClockFaceProps {
  nowMs: number; design?: string; tz?: string;
  showSeconds?: boolean; showDate?: boolean; hour12?: boolean;
  useAccentColor?: boolean; size?: string;
}
export interface ViewHeaderTab { key: string; label: string; disabled?: boolean }
export interface ViewHeaderProps {
  title: string;
  tabs?: ViewHeaderTab[];
  activeTab?: string;
  onChange?: (key: string) => void;
}
export interface ToggleProps {
  value?: boolean; disabled?: boolean; label?: string;
  onChange?: (value: boolean) => void;
}
export interface SegmentedOption { key: string; label?: string; icon?: string }
export interface SegmentedProps {
  options: SegmentedOption[]; value?: string; disabled?: boolean;
  onChange?: (key: string) => void;
}
export interface ColorProps {
  /** The selected colour as a hex string (e.g. "#ff8800"). */
  value: string;
  /** Fires continuously while dragging (live preview, no persist). */
  onPreview?: (hex: string) => void;
  /** Fires once on commit (drag release / valid hex entry). */
  onChange?: (hex: string) => void;
}
export interface CardProps extends WithChildren {
  title?: string; subtitle?: string; interactive?: boolean; onPress?: () => void;
  /** Fires on a press held past the long-press threshold (interactive cards). */
  onLongPress?: () => void;
}
export interface CurvePoint { x: number; y: number }
export interface CurveProps {
  points: CurvePoint[];
  xmin?: number; xmax?: number; ymin?: number; ymax?: number; tone?: UiTone;
  /** Fires with the full point array on each edit (drag / add / remove). */
  onChange?: (points: CurvePoint[]) => void;
}
export interface BadgeProps { label: string; tone?: UiTone; icon?: string }
export interface EmptyProps { title: string; hint?: string; icon?: string; compact?: boolean }
export interface SectionProps { title: string }

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
export const Range = createRemoteComponent('ui-range' as any, ELEMENT_CTORS['ui-range']) as unknown as React.FC<RangeProps>;
export const Gauge = createRemoteComponent('ui-gauge' as any, ELEMENT_CTORS['ui-gauge']) as unknown as React.FC<GaugeProps>;
export const Sparkline = createRemoteComponent('ui-sparkline' as any, ELEMENT_CTORS['ui-sparkline']) as unknown as React.FC<SparklineProps>;
export const Spinner = createRemoteComponent('ui-spinner' as any, ELEMENT_CTORS['ui-spinner']) as unknown as React.FC<SpinnerProps>;
export const Slider = eventComponent<SliderProps>('ui-slider', ELEMENT_CTORS['ui-slider'], [['onInput', 'input'], ['onChange', 'change']]);
export const Button = eventComponent<ButtonProps>('ui-button', ELEMENT_CTORS['ui-button'], [['onPress', 'press'], ['onLongPress', 'longpress']]);
export const Stepper = eventComponent<StepperProps>('ui-stepper', ELEMENT_CTORS['ui-stepper'], [['onChange', 'change']]);
export const Image = createRemoteComponent('ui-image' as any, ELEMENT_CTORS['ui-image']) as unknown as React.FC<ImageProps>;
export const Scroll = createRemoteComponent('ui-scroll' as any, ELEMENT_CTORS['ui-scroll']) as unknown as React.FC<ScrollProps>;
export const Input = eventComponent<InputProps>('ui-input', ELEMENT_CTORS['ui-input'], [['onValueChange', 'input'], ['onEnter', 'submit'], ['onLeave', 'blur']]);
export const Chart = createRemoteComponent('ui-chart' as any, ELEMENT_CTORS['ui-chart']) as unknown as React.FC<ChartProps>;
export const WorldClock = createRemoteComponent('ui-worldclock' as any, ELEMENT_CTORS['ui-worldclock']) as unknown as React.FC<WorldClockProps>;
export const ClockFace = createRemoteComponent('ui-clockface' as any, ELEMENT_CTORS['ui-clockface']) as unknown as React.FC<ClockFaceProps>;
export const ViewHeader = eventComponent<ViewHeaderProps>('ui-viewheader', ELEMENT_CTORS['ui-viewheader'], [['onChange', 'change']]);
export const Toggle = eventComponent<ToggleProps>('ui-toggle', ELEMENT_CTORS['ui-toggle'], [['onChange', 'change']]);
export const Segmented = eventComponent<SegmentedProps>('ui-segmented', ELEMENT_CTORS['ui-segmented'], [['onChange', 'change']]);
export const Color = eventComponent<ColorProps>('ui-color', ELEMENT_CTORS['ui-color'], [['onPreview', 'preview'], ['onChange', 'change']]);
export const Card = eventComponent<CardProps>('ui-card', ELEMENT_CTORS['ui-card'], [['onPress', 'press'], ['onLongPress', 'longpress']]);
export const Curve = eventComponent<CurveProps>('ui-curve', ELEMENT_CTORS['ui-curve'], [['onChange', 'change']]);
export const Badge = createRemoteComponent('ui-badge' as any, ELEMENT_CTORS['ui-badge']) as unknown as React.FC<BadgeProps>;
export const Empty = createRemoteComponent('ui-empty' as any, ELEMENT_CTORS['ui-empty']) as unknown as React.FC<EmptyProps>;
export const Section = createRemoteComponent('ui-section' as any, ELEMENT_CTORS['ui-section']) as unknown as React.FC<SectionProps>;
/* eslint-enable @typescript-eslint/no-explicit-any */
