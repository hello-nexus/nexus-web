// Blessed composite host components. These render the SAME pure presentational
// components the native widgets/pages use (WorldClockMap + city cards via
// ClockWorldView, the clock designs, the standard ViewHeader) - imported, not
// reimplemented - so an SDK page is pixel-identical to a native page with zero
// duplication. The worker places these (<WorldClock/>, <ViewHeader/>, <ClockFace/>)
// and supplies only serializable inputs; the host owns every pixel, keeping the
// visual-consistency guarantee and giving SDK pages the standard page chrome.

import type { CSSProperties, ReactNode } from 'react';
import { useRef, useState } from 'react';
import type { HostProps } from './components';
import { ICON_TABLE } from './icons';
import { ViewHeader } from '../../components/common/ViewHeader/ViewHeader';
import type { TabDef } from '../../components/common/Tabs/Tabs';
import { Toggle } from '../../components/common/Toggle/Toggle';
import { HsvPicker } from '../../components/common/HsvPicker/HsvPicker';
import { useLongPress } from './useLongPress';
import { Card } from '../../components/common/Card/Card';
import { IconLabelButton } from '../../components/common/IconLabelButton/IconLabelButton';
import { EmptyState } from '../../components/common/EmptyState/EmptyState';
import { SectionHeader } from '../../components/common/SectionHeader/SectionHeader';
import { ClockWorldView } from '../../panel/widgets/clock/ClockWorldView';
import { CLOCK_DESIGNS } from '../../panel/widgets/clock/designs';
import { MediaCropper } from '../../components/common/MediaCropper/MediaCropper';
import type { NormalizedCrop } from '../../components/common/MediaCropper/MediaCropper';
import { postServiceForm } from '../../api/service';
import { useTranslation } from '../../lib/i18n';
import { useMediaImportAllowlist } from '../mediaImportContext';

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
// Resolve a contract icon name to a node (same lucide table as <ui-icon>), so
// blessed components that take an icon get the identical glyph set.
function iconNode(name: unknown, size = 16): ReactNode | undefined {
  const I = ICON_TABLE[(str(name) ?? '').toLowerCase()];
  return I ? <I size={size} aria-hidden="true" /> : undefined;
}
const fill: CSSProperties = { display: 'flex', flex: 1, minWidth: 0, minHeight: 0, alignItems: 'center', justifyContent: 'center' };

// The full day/night world clock page body (map + scrollable city cards).
// Self-ticks; the worker only supplies an optional tz to highlight.
export function WorldClock(p: HostProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0 }}>
      <ClockWorldView highlightTz={str(p.highlightTz)} />
    </div>
  );
}

// Standard page header (title shown in the top bar; this renders the tab strip).
// Gives SDK pages the same chrome + tabs native pages get.
export function ViewHeaderHost(p: HostProps) {
  const rawTabs = Array.isArray(p.tabs) ? (p.tabs as Array<{ key?: unknown; label?: unknown; disabled?: unknown }>) : undefined;
  const tabs: TabDef[] | undefined = rawTabs
    ?.filter((t) => typeof t?.key === 'string')
    .map((t) => ({ key: String(t.key), label: String(t.label ?? t.key), disabled: !!t.disabled }));
  return (
    <ViewHeader
      title={str(p.title) ?? ''}
      tabs={tabs && tabs.length ? tabs : undefined}
      activeTab={str(p.activeTab)}
      onTabChange={(k) => p.__events?.change?.(k)}
    />
  );
}

export function ClockFace(p: HostProps) {
  const ms = num(p.nowMs);
  if (ms === undefined) return null;
  const entry = CLOCK_DESIGNS[str(p.design) ?? 'digital'] ?? CLOCK_DESIGNS['digital'];
  const Design = entry.component;
  return (
    <div style={fill}>
      <Design
        now={new Date(ms)}
        tz={str(p.tz)}
        showSeconds={!!p.showSeconds}
        showDate={p.showDate !== false}
        size={str(p.size) ?? '4x2'}
        hour12={!!p.hour12}
        useAccentColor={!!p.useAccentColor}
      />
    </div>
  );
}

// A boolean switch - the native Toggle. The worker sends `value`; the host
// fires `change` with the next boolean.
export function ToggleHost(p: HostProps) {
  return (
    <Toggle
      checked={!!p.value}
      disabled={!!p.disabled}
      ariaLabel={str(p.label)}
      onChange={(b) => p.__events?.change?.(b)}
    />
  );
}

// A segmented switcher - a row of the native IconLabelButton (the same pill the
// clock design picker uses). `options` is [{ key, label?, icon? }].
export function Segmented(p: HostProps) {
  const opts = Array.isArray(p.options)
    ? (p.options as Array<{ key?: unknown; label?: unknown; icon?: unknown }>)
    : [];
  const active = str(p.value);
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
      {opts.filter((o) => typeof o?.key === 'string').map((o) => {
        const key = String(o.key);
        return (
          <IconLabelButton
            key={key}
            active={key === active}
            disabled={!!p.disabled}
            icon={iconNode(o.icon)}
            label={o.label != null ? String(o.label) : undefined}
            onPress={() => p.__events?.change?.(key)}
          />
        );
      })}
    </div>
  );
}

// The native free-form HSV colour picker (SV square + hue strip + hex field) -
// the same control lighting uses, rendered identically. `value` is a hex string;
// the host fires `preview` continuously during a drag and `change` once on commit.
export function ColorHost(p: HostProps) {
  return (
    <HsvPicker
      value={str(p.value) ?? '#000000'}
      onPreview={(hex) => p.__events?.preview?.(hex)}
      onCommit={(hex) => p.__events?.change?.(hex)}
    />
  );
}

// A standard Card surface; holds children, optional title/subtitle chrome, and
// is pressable (fires `press`, or `longpress` on a held press) when `interactive`.
// Card only forwards onClick, so the long-press pointer handlers ride a
// layout-neutral display:contents wrapper that the inner card bubbles through.
export function CardHost(p: HostProps) {
  const interactive = !!p.interactive;
  const lp = useLongPress({
    onLongPress: interactive && p.__events?.longpress ? () => p.__events?.longpress?.() : undefined,
    onPress: interactive ? () => p.__events?.press?.() : undefined,
  });
  return (
    <div
      style={{ display: 'contents' }}
      onPointerDown={lp.onPointerDown} onPointerUp={lp.onPointerUp}
      onPointerLeave={lp.onPointerLeave} onPointerCancel={lp.onPointerCancel}
    >
      <Card
        title={str(p.title)}
        subtitle={str(p.subtitle)}
        interactive={interactive}
        onClick={interactive ? lp.onClick : undefined}
      >
        {p.children}
      </Card>
    </div>
  );
}

// The native empty state - icon + title + hint.
export function EmptyHost(p: HostProps) {
  return (
    <EmptyState
      title={str(p.title) ?? ''}
      hint={str(p.hint)}
      icon={iconNode(p.icon, 28)}
      compact={!!p.compact}
    />
  );
}

// The native uppercase section header.
export function Section(p: HostProps) {
  return <SectionHeader>{str(p.title) ?? ''}</SectionHeader>;
}

// Host-mediated file pick + crop + upload. The worker declares the target route
// via `uploadPath`; the host validates it against the app's mediaImport capability
// allowlist before opening the file picker or touching the network. The upload
// uses postServiceForm, which fails closed over the relay tunnel (LAN/desktop only).
export function MediaImportHost(p: HostProps) {
  const { t } = useTranslation();
  const allowlist = useMediaImportAllowlist();
  const uploadPath = str(p.uploadPath);
  const allowed = !!uploadPath && allowlist.includes(uploadPath);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const [cropState, setCropState] = useState<{ src: string; file: File } | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'cropping' | 'uploading'>('idle');

  const label = str(p.label) ?? t('sdk.mediaimport.choose');
  const accept = str(p.accept) ?? 'video/*';

  const aspectRaw = p.aspectRatio;
  let aspect: number | undefined;
  if (typeof aspectRaw === 'number' && Number.isFinite(aspectRaw) && aspectRaw > 0) {
    aspect = aspectRaw;
  } else if (typeof aspectRaw === 'string' && aspectRaw.includes(':')) {
    const [aw, ah] = aspectRaw.split(':').map(Number);
    if (aw && ah) aspect = aw / ah;
  }

  const doUpload = async (file: File, src: string | null, crop: NormalizedCrop) => {
    if (!uploadPath) return;
    setPhase('uploading');
    setBusy(true);
    if (src) URL.revokeObjectURL(src);
    p.__events?.progress?.(0.5);

    const form = new FormData();
    form.append('file', file, file.name);
    form.append('crop', `${crop.x.toFixed(6)},${crop.y.toFixed(6)},${crop.w.toFixed(6)},${crop.h.toFixed(6)}`);
    const tw = num(p.targetWidth);
    const th = num(p.targetHeight);
    if (tw) form.append('targetWidth', String(tw));
    if (th) form.append('targetHeight', String(th));

    try {
      const result = await postServiceForm<unknown>(uploadPath, form);
      if (result === null) {
        p.__events?.error?.(t('sdk.mediaimport.errorNetwork'));
        return;
      }
      p.__events?.progress?.(1);
      p.__events?.complete?.(result);
    } finally {
      setBusy(false);
      setPhase('idle');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    p.__events?.progress?.(0.1);
    if (aspect !== undefined) {
      const src = URL.createObjectURL(file);
      setCropState({ src, file });
      setPhase('cropping');
    } else {
      // No aspect ratio: skip the cropper and upload with a full-frame crop.
      void doUpload(file, null, { x: 0, y: 0, w: 1, h: 1 });
    }
  };

  // MediaCropper.onConfirm is typed `() => void`; call doUpload via void so the
  // returned Promise is intentionally discarded - the finally block in doUpload
  // always resets busy/phase regardless of outcome.
  const handleCropConfirm = (crop: NormalizedCrop) => {
    if (!cropState) return;
    const { file, src } = cropState;
    setCropState(null);
    void doUpload(file, src, crop);
  };

  const handleCropCancel = () => {
    if (cropState) URL.revokeObjectURL(cropState.src);
    setCropState(null);
    setPhase('idle');
    p.__events?.progress?.(0);
  };

  const buttonStyle: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '8px 12px', borderRadius: 10,
    border: '1px solid var(--border, rgba(255,255,255,0.12))',
    background: 'var(--surface, rgba(255,255,255,0.06))',
    color: allowed ? 'var(--text, currentColor)' : 'var(--text-faded, rgba(255,255,255,0.35))',
    opacity: (busy || !allowed) ? 0.5 : 1,
    cursor: (busy || !allowed) ? 'default' : 'pointer',
    font: 'inherit', fontWeight: 600, lineHeight: 1,
  };

  const statusText = phase === 'uploading' ? t('sdk.mediaimport.uploading')
    : phase === 'cropping' ? t('sdk.mediaimport.cropping')
    : null;

  return (
    <>
      {cropState && aspect !== undefined && (
        <MediaCropper
          src={cropState.src}
          aspect={aspect}
          busy={busy}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6 }}>
        <button
          type="button"
          style={buttonStyle}
          disabled={busy || !allowed}
          aria-busy={busy}
          onClick={allowed && !busy ? () => fileRef.current?.click() : undefined}
        >
          {statusText ?? label}
        </button>
        {!allowed && uploadPath && (
          <span style={{ fontSize: 11, color: 'var(--bad, #ef4444)' }} role="alert">
            {t('sdk.mediaimport.notAllowed')}
          </span>
        )}
        <input
          ref={fileRef}
          type="file"
          accept={accept}
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </>
  );
}
