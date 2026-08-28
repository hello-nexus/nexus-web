// Blessed host components (React 19) - the real, panel-themed widgets the host
// renders for each SDK element. These are pure (props + children); the RemoteTree
// feeds them synced properties + event listeners. An author can ONLY cause one of
// these to render, which is the structural visual-consistency guarantee.

import { type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { Spinner as NativeSpinner } from '../../components/common/Spinner/Spinner';
import { Stepper as NativeStepper } from '../../components/common/Stepper/Stepper';
import { RangeBar as NativeRangeBar } from '../../components/common/RangeBar/RangeBar';
import { Badge as NativeBadge } from '../../components/common/Badge/Badge';
import { SeriesChart as NativeSeriesChart } from '../../components/common/SeriesChart/SeriesChart';
import { TextInput as NativeTextInput } from '../../components/common/TextInput/TextInput';
import { Ring as NativeRing } from '../../components/common/Ring/Ring';
import { Gauge as NativeGauge } from '../../components/common/Gauge/Gauge';
import { Slider as NativeSlider } from '../../components/common/Slider/Slider';
import { Button as NativeButton } from '../../components/common/Button/Button';
import type { ButtonTone } from '../../components/common/Button/Button';
import { UsageBar } from '../../components/common/UsageBar/UsageBar';
import { Sparkline as NativeSparkline } from '../../components/common/Sparkline/Sparkline';
import { ICON_TABLE } from './icons';
import { alignValue, justifyValue, weightValue, toneVar, cssSize } from './tokens';
import { useLongPress } from './useLongPress';
import { useTranslation } from '../../lib/i18n';

export interface HostProps {
  children?: ReactNode;
  /** Event listeners synced from the worker (keyed by contract event name). */
  __events?: Record<string, ((...args: unknown[]) => void) | undefined>;
  [key: string]: unknown;
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const TEXT_ALIGN: Record<string, CSSProperties['textAlign']> = { start: 'left', center: 'center', end: 'right' };

export function Stack(p: HostProps) {
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: p.direction === 'row' ? 'row' : 'column',
    gap: num(p.gap),
    alignItems: alignValue(str(p.align), 'stretch'),
    justifyContent: justifyValue(str(p.justify), 'flex-start'),
    padding: num(p.padding),
    flexWrap: p.wrap ? 'wrap' : undefined,
    flex: p.grow ? 1 : (typeof p.basis === 'string' ? `0 0 ${p.basis}` : num(p.flex)),
    minWidth: 0, minHeight: 0,
  };
  return <div style={style}>{p.children}</div>;
}

export function Grid(p: HostProps) {
  const cols = num(p.columns);
  const rows = num(p.rows);
  const style: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: cols ? `repeat(${cols}, minmax(0, 1fr))` : undefined,
    gridTemplateRows: rows ? `repeat(${rows}, minmax(0, 1fr))` : undefined,
    gap: num(p.gap),
    padding: num(p.padding),
    alignItems: alignValue(str(p.align), 'stretch'),
    justifyItems: alignValue(str(p.justify), 'stretch'),
    flex: p.grow ? 1 : undefined,
    minWidth: 0, minHeight: 0,
  };
  return <div style={style}>{p.children}</div>;
}

export function Frame(p: HostProps) {
  const style: CSSProperties = {
    display: 'flex',
    flexDirection: p.direction === 'row' ? 'row' : 'column',
    gap: num(p.gap),
    padding: num(p.padding) ?? 12,
    alignItems: alignValue(str(p.align), 'stretch'),
    justifyContent: justifyValue(str(p.justify), 'flex-start'),
    background: p.tone ? toneVar(str(p.tone)) : 'var(--surface, rgba(255,255,255,0.05))',
    borderRadius: num(p.radius) ?? 12,
    border: p.border ? '1px solid var(--border, rgba(255,255,255,0.10))' : undefined,
    flex: p.grow ? 1 : undefined,
    minWidth: 0, minHeight: 0,
  };
  return <div style={style}>{p.children}</div>;
}

export function Spacer(p: HostProps) {
  const size = num(p.size);
  return <div style={{ flex: size ? undefined : 1, width: size, height: size }} />;
}

export function Divider(p: HostProps) {
  return <div style={{ alignSelf: 'stretch', height: 1, background: toneVar(str(p.tone), 'var(--border, rgba(255,255,255,0.12))') }} />;
}

export function Text(p: HostProps) {
  const ls = num(p.letterSpacing);
  const style: CSSProperties = {
    color: toneVar(str(p.tone), 'var(--text, currentColor)'),
    fontSize: cssSize(p.size as number | string | undefined),
    fontWeight: weightValue(str(p.weight)),
    textAlign: TEXT_ALIGN[str(p.align) ?? ''],
    textTransform: str(p.transform) as CSSProperties['textTransform'],
    fontFamily: p.mono ? 'ui-monospace, monospace' : undefined,
    opacity: num(p.opacity),
    letterSpacing: ls != null ? `${ls}em` : undefined,
    lineHeight: num(p.lineHeight),
    fontVariantNumeric: p.tabular ? 'tabular-nums' : undefined,
    whiteSpace: p.truncate ? 'nowrap' : undefined,
    overflow: p.truncate ? 'hidden' : undefined,
    textOverflow: p.truncate ? 'ellipsis' : undefined,
  };
  const content: ReactNode = p.value != null ? String(p.value) : p.children;
  // Selection/copy is disabled globally two ways: the desktop app root
  // (global.scss `body`, opt back in with `.selectable`) and the panel
  // (tokens.scss `.panel-root` + usePanelTextSelectionGuard, opt in with the
  // data attribute). Stamp both so a copyable value works on either surface.
  return (
    <span
      style={style}
      className={p.copyable ? 'selectable' : undefined}
      data-panel-allow-text-selection={p.copyable ? 'true' : undefined}
    >
      {content}
    </span>
  );
}

export function Icon(p: HostProps) {
  const Icn = ICON_TABLE[(str(p.name) ?? '').toLowerCase()];
  if (!Icn) return null;
  return <Icn size={num(p.size) ?? 18} color={toneVar(str(p.tone), 'currentColor')} aria-hidden="true" />;
}

function pctOf(value: unknown, min: unknown, max: unknown): number {
  const v = num(value) ?? 0; const lo = num(min) ?? 0; const hi = num(max) ?? 100;
  if (hi === lo) return 0;
  return Math.max(0, Math.min(1, (v - lo) / (hi - lo)));
}

export function Bar(p: HostProps) {
  const fill = pctOf(p.value, p.min, p.max);
  const color = p.tone ? toneVar(str(p.tone)) : undefined;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      {p.label != null && <span style={{ fontSize: 11, color: 'var(--text-dim, currentColor)' }}>{String(p.label)}</span>}
      <UsageBar value={fill} color={color} />
    </div>
  );
}

export function Range(p: HostProps) {
  return (
    <NativeRangeBar
      lo={num(p.lo) ?? (num(p.min) ?? 0)}
      hi={num(p.hi) ?? (num(p.max) ?? 1)}
      min={num(p.min) ?? 0}
      max={num(p.max) ?? 1}
      gradient={(str(p.gradient) === 'accent' ? 'accent' : 'temp')}
      glow={!!p.glow}
      height={num(p.height) ?? 5}
      radius={num(p.radius) ?? 999}
    />
  );
}

export function Ring(p: HostProps) {
  return (
    <NativeRing
      value={num(p.value) ?? 0}
      min={num(p.min) ?? 0}
      max={num(p.max) ?? 100}
      label={p.label != null ? String(p.label) : undefined}
      sublabel={p.sublabel != null ? String(p.sublabel) : undefined}
      color={toneVar(str(p.tone), 'var(--accent, currentColor)')}
      thickness={num(p.thickness) ?? 8}
    />
  );
}

export function Gauge(p: HostProps) {
  return (
    <NativeGauge
      value={num(p.value)}
      min={num(p.min) ?? 0}
      max={num(p.max) ?? 100}
      label={p.label != null ? String(p.label) : undefined}
      sublabel={p.sublabel != null ? String(p.sublabel) : undefined}
      color={toneVar(str(p.tone), 'var(--accent, currentColor)')}
    />
  );
}

export function Sparkline(p: HostProps) {
  const values = Array.isArray(p.values) ? (p.values as number[]).filter((v) => Number.isFinite(v)) : [];
  const color = toneVar(str(p.tone), 'var(--accent, currentColor)');
  const min = num(p.min);
  const max = num(p.max);
  const domain: [number, number] | undefined = min != null && max != null ? [min, max] : undefined;
  return (
    <NativeSparkline
      values={values}
      width="100%"
      height={24}
      color={color}
      domain={domain}
    />
  );
}

export function Slider(p: HostProps) {
  const emit = (key: 'input' | 'change', value: number) => p.__events?.[key]?.(value);
  const rawFill = p.trackFill;
  const trackFill: boolean | number | undefined =
    typeof rawFill === 'number' ? rawFill : (rawFill != null ? !!rawFill : undefined);
  const rawOrientation = str(p.orientation);
  const orientation: 'inline' | 'stacked' | 'bare' | undefined =
    rawOrientation === 'inline' || rawOrientation === 'stacked' || rawOrientation === 'bare'
      ? rawOrientation : undefined;
  return (
    <NativeSlider
      label={str(p.label) ?? ''}
      value={num(p.value) ?? 0}
      min={num(p.min) ?? 0}
      max={num(p.max) ?? 100}
      step={num(p.step)}
      disabled={!!p.disabled}
      trackFill={trackFill}
      orientation={orientation}
      onChange={(v, commit) => {
        if (commit) emit('change', v);
        else emit('input', v);
      }}
      onCommit={(v) => emit('change', v)}
    />
  );
}

export function Stepper(p: HostProps) {
  return (
    <NativeStepper
      value={num(p.value) ?? 0}
      step={num(p.step) ?? 1}
      min={num(p.min)}
      max={num(p.max)}
      disabled={!!p.disabled}
      onChange={(v) => p.__events?.change?.(v)}
    />
  );
}

function sdkToneToNative(sdkTone: unknown, variant: unknown): ButtonTone {
  const t = str(sdkTone) ?? '';
  const v = str(variant) ?? 'soft';
  if (v === 'ghost') return 'ghost';
  if (t === 'bad') return 'danger';
  if (t === 'accent' && v === 'solid') return 'accent';
  if (v === 'solid') return 'accent';
  return 'neutral';
}

export function Button(p: HostProps) {
  const disabled = !!p.disabled;
  const label = str(p.label);
  const nativeTone = sdkToneToNative(p.tone, p.variant);
  const size = (str(p.size) ?? 'md') as 'sm' | 'md' | 'lg';
  const iconName = str(p.icon);
  const IconEl = iconName ? ICON_TABLE[iconName.toLowerCase()] : undefined;
  const iconNode: ReactNode = IconEl ? <IconEl size={size === 'sm' ? 12 : 16} aria-hidden="true" /> : undefined;
  const lp = useLongPress({
    onLongPress: p.__events?.longpress ? () => p.__events?.longpress?.() : undefined,
    onPress: () => p.__events?.press?.(),
    disabled,
  });
  return (
    <NativeButton
      tone={nativeTone}
      size={size}
      disabled={disabled}
      icon={iconNode}
      aria-label={label ?? undefined}
      onPointerDown={lp.onPointerDown}
      onPointerUp={lp.onPointerUp}
      onPointerLeave={lp.onPointerLeave}
      onPointerCancel={lp.onPointerCancel}
      onClick={lp.onClick}
    >
      {p.children ?? (label != null ? label : null)}
    </NativeButton>
  );
}

// The worker can't reach the clipboard, so `value` crosses as a prop and the host
// performs the write. The hover tooltip (native Button `title`) flips to a copied
// confirmation and reverts after a beat.
export function CopyButton(p: HostProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const resetRef = useRef<number | null>(null);
  useEffect(() => () => { if (resetRef.current) window.clearTimeout(resetRef.current); }, []);
  const value = str(p.value) ?? '';
  const size: 'sm' | 'md' = str(p.size) === 'md' ? 'md' : 'sm';
  const label = copied ? t('sdk.copybutton.copied') : t('sdk.copybutton.copy');
  // Confirm only once the write resolves: the panel WebView served over plain
  // HTTP has no async clipboard (navigator.clipboard is undefined) and a write
  // can be denied - a false "Copied" in either case would lie.
  const onCopy = async () => {
    const clip = navigator.clipboard;
    if (!value || !clip) return;
    try {
      await clip.writeText(value);
    } catch {
      return;
    }
    setCopied(true);
    if (resetRef.current) window.clearTimeout(resetRef.current);
    resetRef.current = window.setTimeout(() => setCopied(false), 1600);
  };
  const Glyph = copied ? Check : Copy;
  return (
    <NativeButton
      tone="ghost"
      size={size}
      title={label}
      aria-label={label}
      disabled={!value || !navigator.clipboard}
      icon={<Glyph size={size === 'sm' ? 14 : 16} aria-hidden="true" />}
      onClick={onCopy}
    />
  );
}

// Only these schemes load - never a bare http: or javascript: URL from a worker.
const SAFE_IMG = /^(https:|data:image\/|blob:)/i;
export function Image(p: HostProps) {
  const src = str(p.src);
  if (!src || !SAFE_IMG.test(src)) return null;
  const style: CSSProperties = {
    objectFit: (str(p.fit) ?? 'cover') as CSSProperties['objectFit'],
    width: num(p.width) ?? '100%', height: num(p.height),
    aspectRatio: p.aspect != null ? String(p.aspect) : undefined,
    borderRadius: num(p.radius) ?? 0,
    background: p.tone ? toneVar(str(p.tone)) : undefined,
    imageRendering: p.pixelated ? 'pixelated' : undefined,
    display: 'block', minWidth: 0,
  };
  return <img src={src} alt={str(p.alt) ?? ''} style={style} loading="lazy" referrerPolicy="no-referrer" draggable={false} />;
}

// Same-origin (/...) is allowed in addition to https/blob: the worker only ever
// points this at our own service media route; arbitrary http: is still rejected.
const SAFE_VIDEO = /^(https:|blob:|\/)/i;
export function Video(p: HostProps) {
  let src = str(p.src);
  if (!src || !SAFE_VIDEO.test(src)) return null;
  // A <video> GET can't carry the SPA's Authorization header, so a same-origin
  // media URL is authenticated with the desktop session's query token instead.
  if (src.startsWith('/')) {
    let tok: string | null = null;
    try { tok = localStorage.getItem('nexus_token'); } catch { tok = null; }
    if (tok) src += (src.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(tok);
  }
  const style: CSSProperties = {
    objectFit: (str(p.fit) ?? 'cover') as CSSProperties['objectFit'],
    width: num(p.width) ?? '100%', height: num(p.height),
    aspectRatio: p.aspect != null ? String(p.aspect) : undefined,
    borderRadius: num(p.radius) ?? 0,
    background: p.tone ? toneVar(str(p.tone)) : undefined,
    display: 'block', minWidth: 0,
  };
  return <video src={src} style={style} autoPlay loop={p.loop !== false} muted playsInline preload="auto" />;
}

// A sprite atlas crosses the boundary as a CSS `url()`, not an <img src>, so the
// scheme check is not enough on its own: a quote, backslash, or paren in the
// string could break out of the url() and inject a declaration. Require the
// scheme AND reject every character that could terminate the url() token.
const CSS_URL_UNSAFE = /["'()\\\s]/;
function safeAtlasUrl(src: string | undefined): string | undefined {
  if (!src || !SAFE_IMG.test(src) || CSS_URL_UNSAFE.test(src)) return undefined;
  return src;
}

// A positioned stage. Establishes the containing block `ui-sprite` children
// position against, and clips them at its edge so a fish that swims out of
// frame does not paint over the rest of the tile.
export function Layer(p: HostProps) {
  const interactive = !!p.interactive;
  const style: CSSProperties = {
    position: 'relative',
    overflow: 'hidden',
    padding: num(p.padding),
    aspectRatio: p.aspect != null ? String(p.aspect) : undefined,
    background: p.tone ? toneVar(str(p.tone)) : undefined,
    borderRadius: num(p.radius) ?? 0,
    // height as well as flex: the stage clips its children, so a Layer that
    // collapsed to zero height in a non-flex parent would hide every sprite.
    flex: p.grow ? 1 : undefined,
    width: '100%',
    height: p.grow ? '100%' : undefined,
    minWidth: 0, minHeight: 0,
    touchAction: interactive ? 'manipulation' : undefined,
    cursor: interactive ? 'pointer' : undefined,
  };
  // The tap coordinate is resolved against the layer's own box before it crosses
  // back to the worker: the worker has no DOM, so it could not do this itself.
  const onClick = interactive
    ? (e: ReactMouseEvent<HTMLDivElement>) => {
        const r = e.currentTarget.getBoundingClientRect();
        p.__events?.press?.({ x: e.clientX - r.left, y: e.clientY - r.top });
      }
    : undefined;
  return <div style={style} onClick={onClick}>{p.children}</div>;
}

// One cell of a sprite atlas. Drawn as a background-position offset into the
// atlas so animating a frame costs one number, and moved with a transform so
// the compositor handles motion without a layout pass.
export function Sprite(p: HostProps) {
  const src = safeAtlasUrl(str(p.src));
  if (!src) return null;
  const cw = num(p.cw) ?? 32;
  const ch = num(p.ch) ?? 32;
  const cols = Math.max(1, Math.trunc(num(p.cols) ?? 1));
  const frame = Math.max(0, Math.trunc(num(p.frame) ?? 0));
  const scale = num(p.scale) ?? 1;
  const transform =
    `translate3d(${num(p.x) ?? 0}px, ${num(p.y) ?? 0}px, 0)` +
    ` scale(${p.flip ? -scale : scale}, ${scale})`;
  const style: CSSProperties = {
    position: 'absolute', left: 0, top: 0,
    width: cw, height: ch,
    transform,
    transformOrigin: 'center center',
    backgroundImage: `url("${src}")`,
    backgroundPosition: `${-(frame % cols) * cw}px ${-Math.floor(frame / cols) * ch}px`,
    backgroundRepeat: 'no-repeat',
    imageRendering: p.pixelated === false ? undefined : 'pixelated',
    opacity: num(p.opacity),
    zIndex: num(p.z),
    willChange: 'transform',
    pointerEvents: 'none',
  };
  return <div style={style} role={p.alt ? 'img' : undefined} aria-label={str(p.alt)} />;
}

export function Scroll(p: HostProps) {
  const dir = str(p.direction) ?? 'vertical';
  const style: CSSProperties = {
    display: 'flex', flexDirection: dir === 'horizontal' ? 'row' : 'column',
    gap: num(p.gap), padding: num(p.padding),
    overflowX: dir === 'horizontal' || dir === 'both' ? 'auto' : 'hidden',
    overflowY: dir === 'vertical' || dir === 'both' ? 'auto' : 'hidden',
    flex: p.grow ? 1 : undefined, minWidth: 0, minHeight: 0,
  };
  return <div style={style}>{p.children}</div>;
}

export function Input(p: HostProps) {
  const rawAlign = str(p.align);
  const align: 'left' | 'center' | 'right' | undefined =
    rawAlign === 'center' ? 'center' : rawAlign === 'end' ? 'right' : rawAlign === 'start' ? 'left' : undefined;
  const rawType = str(p.type);
  const type: 'text' | 'number' | 'search' | 'password' =
    rawType === 'number' || rawType === 'search' || rawType === 'password' ? rawType : 'text';
  const rawSize = str(p.size);
  const size: 'sm' | 'md' = rawSize === 'sm' ? 'sm' : 'md';
  return (
    <NativeTextInput
      value={str(p.value) ?? ''}
      placeholder={str(p.placeholder)}
      type={type}
      disabled={!!p.disabled}
      maxLength={num(p.maxLength)}
      size={size}
      mono={!!p.mono}
      align={align}
      color={toneVar(str(p.tone), undefined)}
      onInput={(v) => p.__events?.input?.(v)}
      onSubmit={(v) => p.__events?.submit?.(v)}
      onBlur={(v) => p.__events?.blur?.(v)}
    />
  );
}

interface RawChartSeries { values: number[]; tone?: string; area?: boolean }
export function Chart(p: HostProps) {
  const rawSeries: RawChartSeries[] = Array.isArray(p.series)
    ? (p.series as RawChartSeries[]).filter((s) => Array.isArray(s?.values))
    : [];
  const series = rawSeries.map((s) => ({
    values: s.values,
    color: toneVar(s.tone ?? str(p.tone), 'var(--accent, currentColor)'),
    area: !!s.area,
  }));
  return (
    <NativeSeriesChart
      series={series}
      min={num(p.min)}
      max={num(p.max)}
      height={num(p.height) ?? 80}
      gridlines={!!p.gridlines}
    />
  );
}

export function Badge(p: HostProps) {
  const color = toneVar(str(p.tone), 'var(--text)');
  const Icn = ICON_TABLE[(str(p.icon) ?? '').toLowerCase()];
  const icon = Icn ? <Icn size={12} aria-hidden="true" /> : undefined;
  return <NativeBadge label={str(p.label) ?? ''} color={color} icon={icon} />;
}

export function Spinner(p: HostProps) {
  return (
    <NativeSpinner
      size={num(p.size) ?? 20}
      color={toneVar(str(p.tone), 'var(--accent, #2563eb)')}
    />
  );
}
