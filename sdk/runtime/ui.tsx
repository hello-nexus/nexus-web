// @hellonexus/ui - the author-facing component vocabulary (worker face, react@18).
//
// Each component is a thin @remote-dom wrapper around a registered RemoteElement.
// Authors compose ONLY these; props are semantic (tone/size/variant) and theme
// through host tokens - there is no raw style/className escape, which is what
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
  basis?: string;
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
  // Opt this value out of the panel's global no-select rule so it can be
  // selected + copied (e.g. a serial number or product key).
  copyable?: boolean;
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
  trackFill?: boolean | number;
  orientation?: 'inline' | 'stacked' | 'bare';
  onInput?: (value: number) => void; onChange?: (value: number) => void;
}
export interface ButtonProps extends WithChildren {
  label?: string; tone?: UiTone; variant?: 'solid' | 'soft' | 'ghost';
  disabled?: boolean; icon?: string; size?: 'sm' | 'md' | 'lg';
  /** https URL the host opens in the system browser on press (press still fires). */
  href?: string;
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
  /** Nearest-neighbour scaling, for pixel art authored at its native grid. */
  pixelated?: boolean;
}
export interface VideoProps {
  src: string; fit?: 'cover' | 'contain' | 'fill' | 'none';
  radius?: number; width?: number; height?: number; aspect?: string | number; tone?: UiTone;
  /** Loop playback (default true). Always muted + autoplay + inline. */
  loop?: boolean;
}
export interface LayerProps extends WithChildren {
  /** Fill the available space (the usual case for a stage). */
  grow?: boolean; padding?: number; aspect?: string | number;
  tone?: UiTone; radius?: number;
  /** Make the stage tappable; onPress reports layer-local { x, y }. */
  interactive?: boolean;
  onPress?: (at: { x: number; y: number }) => void;
}
export interface SpriteProps {
  /** The atlas, shipped once as an https/data/blob URL. */
  src: string;
  /** Cell index into the atlas, row-major. */
  frame?: number;
  /** Cells per atlas row. */
  cols?: number;
  /** Cell size in atlas pixels (defaults to 32x32). */
  cw?: number; ch?: number;
  /** Position within the parent Layer, in CSS pixels. */
  x?: number; y?: number; z?: number;
  scale?: number;
  /** Mirror horizontally - the usual way to face a sprite the other way. */
  flip?: boolean;
  opacity?: number;
  /** Nearest-neighbour scaling. On by default; pass false for smooth art. */
  pixelated?: boolean;
  alt?: string;
}
export interface ScrollProps extends WithChildren {
  direction?: 'vertical' | 'horizontal' | 'both'; gap?: number; padding?: number; grow?: boolean;
}
export interface InputProps {
  /** A value to SET programmatically (reset / computed result). Not a controlled
   *  binding - typing is local + reported via onValueChange, so the cursor stays put. */
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
// Blessed composites - the host renders the real native component (the day/night
// world clock page body, the clock designs, the standard page header). Lets an
// SDK page be a first-class native page with zero duplication.
export interface WorldClockProps { highlightTz?: string }
export interface ClockFaceProps {
  nowMs: number; design?: string; tz?: string;
  showSeconds?: boolean; showDate?: boolean; showTimezone?: boolean; hour12?: boolean;
  useAccentColor?: boolean; size?: string;
  // 'stacked' puts each unit on its own line; ignored by a design that cannot
  // split the time into lines (analog). Defaults to 'horizontal'.
  layout?: 'horizontal' | 'stacked';
}
/** First-party 3D avatar (three.js), rendered host-side. */
export interface AvatarProps {
  /** URL to a pack directory or an encrypted .nxpack container. */
  pack: string;
  dance?: boolean;
  listening?: boolean;
  /** 0..1. */
  energy?: number;
  /** One-shot "TriggerName#seq"; increment seq so a repeat re-fires. */
  reaction?: string;
  /** Plays the walk-in + camera push-in once on mount. Default false. */
  intro?: boolean;
  /**
   * Pointer orbit/zoom (the wheel rides full body to head closeup). Default
   * true. Applies only in the panel's fullscreen immersive view; a widget
   * tile is always inert (tapping it opens fullscreen).
   */
  interactive?: boolean;
  /** Loops the authored reaction showcase (wave/cheer/dance/...). Default false. */
  demo?: boolean;
  /**
   * Text strip pinned to the bottom of the fullscreen immersive view (e.g. a
   * live-presence line). Hidden in a widget tile and when empty/absent.
   */
  status?: string;
  /** Adds a red live dot ahead of the status text. Default false. */
  statusLive?: boolean;
  /**
   * A live player docked large at the bottom of the immersive view, with a
   * button that opens `open` in the system browser. Hidden in a widget tile
   * and when absent. `embed` must be an https embed URL on an allowlisted
   * player host (YouTube today); anything else renders nothing.
   */
  stream?: AvatarStream;
  /**
   * Sticker palette for the immersive view. Non-empty shows a Stickers button
   * in the bottom dock; sticker mode lets the viewer add, drag, pinch-scale,
   * twist-rotate and remove stickers over the stage. `src` is a same-origin
   * app-asset URL or data:image; third-party https is refused.
   */
  stickers?: AvatarSticker[];
  /** The placed stickers; keep this in local state and feed `onPlacements` back into it. */
  placements?: AvatarStickerPlacement[];
  /** Fires with the whole placed set after every add, move, pinch, or remove. */
  onPlacements?: (placements: AvatarStickerPlacement[]) => void;
  /**
   * Image (same-origin app-asset URL or data:image) the drawer's Live button
   * animates when there is no `stream` to show.
   */
  offlineArt?: string;
  /** Fires when the viewer presses Live; re-poll the presence source at once. */
  onLiveCheck?: () => void;
  /**
   * Fires with `true` when the avatar enters the panel's fullscreen immersive
   * view and `false` when it leaves. Lets the app gate work (e.g. polling the
   * presence source behind `status`) on actually being on stage.
   */
  onImmersive?: (immersive: boolean) => void;
}
export interface AvatarStream {
  /** https embed URL on an allowlisted player host. */
  embed: string;
  /** https page the dock's button opens in the system browser. */
  open?: string;
  /** Button label; the host supplies a generic one when absent. */
  label?: string;
}
export interface AvatarSticker { id: string; src: string }
/** One placed sticker: centre `x`/`y` as 0..1 of the stage box, `s` scale
 *  multiplier of the host's base sticker size, `r` rotation in degrees. */
export interface AvatarStickerPlacement { id: string; sticker: string; x: number; y: number; s: number; r: number }
export interface ViewHeaderTab { key: string; label: string; disabled?: boolean; icon?: string }
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
export interface SelectOption { value: string; label: string }
export interface SelectProps {
  value?: string;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  onChange?: (value: string) => void;
}
export interface ChipGroupOption { key: string; label?: string }
export interface ChipGroupProps {
  value?: string;
  options: ChipGroupOption[];
  disabled?: boolean;
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
  /** Fires continuously while dragging a point (live, cheap - no persist). */
  onPreview?: (points: CurvePoint[]) => void;
  /** Fires on a commit: drag release, add (double-click), or remove (right-click). */
  onChange?: (points: CurvePoint[]) => void;
}
export interface BadgeProps { label: string; tone?: UiTone; icon?: string }
export interface EmptyProps { title: string; hint?: string; icon?: string; compact?: boolean }
export interface SectionProps extends WithChildren { title: string }

/** Host-mediated file pick + crop + upload. The app must declare each uploadPath
 *  in its manifest capabilities.mediaImport list; the host refuses to open the
 *  file picker or touch the network for unlisted paths. */
export interface MediaImportProps {
  /** Service route to POST the file to, e.g. "/tryx/media". Must be in the
   *  manifest's capabilities.mediaImport allowlist or the button is inert. */
  uploadPath: string;
  /** MIME type filter for the file picker (default "video/*"). */
  accept?: string;
  /** Target aspect ratio as a number (width/height) or "W:H" string. When set,
   *  the host shows the crop dialog before uploading. */
  aspectRatio?: number | string;
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  targetWidth?: number;
  targetHeight?: number;
  /** Button label (falls back to the locale's "Choose video" string). */
  label?: string;
  /** Fires with a fraction 0..1 during the import flow. */
  onProgress?: (fraction: number) => void;
  /** Fires with the parsed service response JSON on success. */
  onComplete?: (result: unknown) => void;
  /** Fires with an error message string on failure. */
  onError?: (message: string) => void;
}

/** The media library grid - the real MediaGrid the panel-background picker uses.
 *  `thumbs` maps an item id to a thumbnail URL; `durationSec` (when > 0) marks an
 *  animated clip so the tile shows its length. */
export interface MediaGridItem { id: string; name: string; durationSec?: number }
export interface MediaGridProps {
  items: MediaGridItem[];
  thumbs: Record<string, string>;
  activeId?: string;
  thumbAspect?: number;
  deleteAriaLabel?: string;
  onPlay?: (id: string) => void;
  onDelete?: (id: string) => void;
}
/** The native themed confirm dialog. `open` is worker-controlled. */
export interface ConfirmDialogProps {
  open: boolean; title: string; message: string;
  note?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean;
  onConfirm?: () => void; onCancel?: () => void;
}
/** The canonical collapsible section header. Controlled: hold `open` and flip it
 *  from onToggle. `right` is optional non-interactive text. */
export interface CollapsibleProps extends WithChildren {
  title: string; open: boolean; right?: string; compact?: boolean;
  onToggle?: () => void;
}
/** A hover/focus tooltip wrapping a single child trigger. */
export interface TooltipProps extends WithChildren {
  body: string; title?: string; side?: 'top' | 'bottom' | 'left' | 'right';
}
/** A ghost icon button that copies `value` to the clipboard on press. The host
 *  writes to the clipboard and shows a hover tooltip that confirms "Copied". */
export interface CopyButtonProps {
  value: string; size?: 'sm' | 'md';
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
export const Range = createRemoteComponent('ui-range' as any, ELEMENT_CTORS['ui-range']) as unknown as React.FC<RangeProps>;
export const Gauge = createRemoteComponent('ui-gauge' as any, ELEMENT_CTORS['ui-gauge']) as unknown as React.FC<GaugeProps>;
export const Sparkline = createRemoteComponent('ui-sparkline' as any, ELEMENT_CTORS['ui-sparkline']) as unknown as React.FC<SparklineProps>;
export const Spinner = createRemoteComponent('ui-spinner' as any, ELEMENT_CTORS['ui-spinner']) as unknown as React.FC<SpinnerProps>;
export const Slider = eventComponent<SliderProps>('ui-slider', ELEMENT_CTORS['ui-slider'], [['onInput', 'input'], ['onChange', 'change']]);
export const Button = eventComponent<ButtonProps>('ui-button', ELEMENT_CTORS['ui-button'], [['onPress', 'press'], ['onLongPress', 'longpress']]);
export const Stepper = eventComponent<StepperProps>('ui-stepper', ELEMENT_CTORS['ui-stepper'], [['onChange', 'change']]);
export const Image = createRemoteComponent('ui-image' as any, ELEMENT_CTORS['ui-image']) as unknown as React.FC<ImageProps>;
export const Video = createRemoteComponent('ui-video' as any, ELEMENT_CTORS['ui-video']) as unknown as React.FC<VideoProps>;
export const Layer = eventComponent<LayerProps>('ui-layer', ELEMENT_CTORS['ui-layer'], [['onPress', 'press']]);
export const Sprite = createRemoteComponent('ui-sprite' as any, ELEMENT_CTORS['ui-sprite']) as unknown as React.FC<SpriteProps>;
export const Scroll = createRemoteComponent('ui-scroll' as any, ELEMENT_CTORS['ui-scroll']) as unknown as React.FC<ScrollProps>;
export const Input = eventComponent<InputProps>('ui-input', ELEMENT_CTORS['ui-input'], [['onValueChange', 'input'], ['onEnter', 'submit'], ['onLeave', 'blur']]);
export const Chart = createRemoteComponent('ui-chart' as any, ELEMENT_CTORS['ui-chart']) as unknown as React.FC<ChartProps>;
export const WorldClock = createRemoteComponent('ui-worldclock' as any, ELEMENT_CTORS['ui-worldclock']) as unknown as React.FC<WorldClockProps>;
export const ClockFace = createRemoteComponent('ui-clockface' as any, ELEMENT_CTORS['ui-clockface']) as unknown as React.FC<ClockFaceProps>;
export const Avatar = eventComponent<AvatarProps>('ui-avatar', ELEMENT_CTORS['ui-avatar'], [['onImmersive', 'immersive'], ['onPlacements', 'placements'], ['onLiveCheck', 'livecheck']]);
export const ViewHeader = eventComponent<ViewHeaderProps>('ui-viewheader', ELEMENT_CTORS['ui-viewheader'], [['onChange', 'change']]);
export const Toggle = eventComponent<ToggleProps>('ui-toggle', ELEMENT_CTORS['ui-toggle'], [['onChange', 'change']]);
export const Segmented = eventComponent<SegmentedProps>('ui-segmented', ELEMENT_CTORS['ui-segmented'], [['onChange', 'change']]);
export const Select = eventComponent<SelectProps>('ui-select', ELEMENT_CTORS['ui-select'], [['onChange', 'change']]);
export const ChipGroup = eventComponent<ChipGroupProps>('ui-chipgroup', ELEMENT_CTORS['ui-chipgroup'], [['onChange', 'change']]);
export const Color = eventComponent<ColorProps>('ui-color', ELEMENT_CTORS['ui-color'], [['onPreview', 'preview'], ['onChange', 'change']]);
export const Card = eventComponent<CardProps>('ui-card', ELEMENT_CTORS['ui-card'], [['onPress', 'press'], ['onLongPress', 'longpress']]);
export const Curve = eventComponent<CurveProps>('ui-curve', ELEMENT_CTORS['ui-curve'], [['onPreview', 'preview'], ['onChange', 'change']]);
export const Badge = createRemoteComponent('ui-badge' as any, ELEMENT_CTORS['ui-badge']) as unknown as React.FC<BadgeProps>;
export const Empty = createRemoteComponent('ui-empty' as any, ELEMENT_CTORS['ui-empty']) as unknown as React.FC<EmptyProps>;
export const Section = createRemoteComponent('ui-section' as any, ELEMENT_CTORS['ui-section']) as unknown as React.FC<SectionProps>;
export const MediaImport = eventComponent<MediaImportProps>('ui-mediaimport', ELEMENT_CTORS['ui-mediaimport'], [['onProgress', 'progress'], ['onComplete', 'complete'], ['onError', 'error']]);
export const MediaGrid = eventComponent<MediaGridProps>('ui-mediagrid', ELEMENT_CTORS['ui-mediagrid'], [['onPlay', 'play'], ['onDelete', 'delete']]);
export const ConfirmDialog = eventComponent<ConfirmDialogProps>('ui-confirm', ELEMENT_CTORS['ui-confirm'], [['onConfirm', 'confirm'], ['onCancel', 'cancel']]);
export const Collapsible = eventComponent<CollapsibleProps>('ui-collapsible', ELEMENT_CTORS['ui-collapsible'], [['onToggle', 'toggle']]);
export const Tooltip = createRemoteComponent('ui-tooltip' as any, ELEMENT_CTORS['ui-tooltip']) as unknown as React.FC<TooltipProps>;
export const CopyButton = createRemoteComponent('ui-copybutton' as any, ELEMENT_CTORS['ui-copybutton']) as unknown as React.FC<CopyButtonProps>;
/* eslint-enable @typescript-eslint/no-explicit-any */
