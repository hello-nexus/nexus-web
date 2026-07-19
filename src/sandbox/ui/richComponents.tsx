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
import { Select as NativeSelect } from '../../components/common/Select/Select';
import type { SelectOption } from '../../components/common/Select/Select';
import { ChipGroup as NativeChipGroup } from '../../components/common/ChipGroup/ChipGroup';
import type { ChipOption } from '../../components/common/ChipGroup/ChipGroup';
import { ViewHeader } from '../../components/common/ViewHeader/ViewHeader';
import type { TabDef } from '../../components/common/Tabs/Tabs';
import { Toggle } from '../../components/common/Toggle/Toggle';
import { HsvPicker } from '../../components/common/HsvPicker/HsvPicker';
import { useLongPress } from './useLongPress';
import { Card } from '../../components/common/Card/Card';
import { IconLabelButton } from '../../components/common/IconLabelButton/IconLabelButton';
import { EmptyState } from '../../components/common/EmptyState/EmptyState';
import { SettingsSection } from '../../components/common/SettingsSection/SettingsSection';
import { ClockWorldView } from '../../panel/widgets/clock/ClockWorldView';
import { CLOCK_DESIGNS } from '../../panel/widgets/clock/designs';
import { MediaCropper } from '../../components/common/MediaCropper/MediaCropper';
import type { NormalizedCrop } from '../../components/common/MediaCropper/MediaCropper';
import { serializeCrop } from '../../components/common/MediaCropper/mediaCrop';
import { MediaGrid } from '../../panel/widgets/lighting/effecteditor/MediaGrid';
import type { MediaItem } from '../../api/mediaLibrary';
import { ConfirmModal } from '../../components/common/ConfirmModal/ConfirmModal';
import { CollapsibleSection } from '../../components/common/CollapsibleSection/CollapsibleSection';
import { HoverTooltip } from '../../components/common/HoverTooltip/HoverTooltip';
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
  const rawTabs = Array.isArray(p.tabs) ? (p.tabs as Array<{ key?: unknown; label?: unknown; disabled?: unknown; icon?: unknown }>) : undefined;
  const tabs: TabDef[] | undefined = rawTabs
    ?.filter((t) => typeof t?.key === 'string')
    .map((t) => ({ key: String(t.key), label: String(t.label ?? t.key), disabled: !!t.disabled, icon: iconNode(t.icon) }));
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
        showTimezone={!!p.showTimezone}
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

// The native themed dropdown (Select, portaled to <body>). The worker passes a
// flat `options` array of { value, label } objects; the host fires `change` with
// the chosen value string.
export function SelectHost(p: HostProps) {
  const rawOptions = Array.isArray(p.options)
    ? (p.options as Array<{ value?: unknown; label?: unknown }>)
    : [];
  const options: SelectOption[] = rawOptions
    .filter((o) => typeof o?.value === 'string')
    .map((o) => ({ value: String(o.value), label: String(o.label ?? o.value) }));
  return (
    <NativeSelect
      value={str(p.value) ?? ''}
      options={options}
      placeholder={str(p.placeholder)}
      disabled={!!p.disabled}
      onChange={(v) => p.__events?.change?.(v)}
    />
  );
}

// The native chip row (ChipGroup, single-select). The worker passes `options`
// as [{ key, label }] and the active `value` key; the host fires `change` with
// the chosen key.
export function ChipGroupHost(p: HostProps) {
  const rawOptions = Array.isArray(p.options)
    ? (p.options as Array<{ key?: unknown; label?: unknown }>)
    : [];
  const options: ChipOption[] = rawOptions
    .filter((o) => typeof o?.key === 'string')
    .map((o) => ({ key: String(o.key), label: String(o.label ?? o.key) }));
  return (
    <NativeChipGroup
      options={options}
      activeKey={str(p.value) ?? ''}
      onChange={(key) => p.__events?.change?.(key)}
    />
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

export function Section(p: HostProps) {
  return (
    <SettingsSection title={str(p.title) ?? ''}>
      {p.children}
    </SettingsSection>
  );
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
    form.append('crop', serializeCrop(crop));
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
          kind={cropState.file.type.startsWith('video/') ? 'video' : 'image'}
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

// The media library grid - the real MediaGrid the panel-background picker renders
// (grid of EffectCard tiles, hover-X delete, selected state). The worker supplies
// serializable items + a thumbnail-URL map; durationSec > 0 marks an animated clip
// so MediaGrid shows its length, otherwise it reads as a static image.
export function MediaGridHost(p: HostProps) {
  const rawItems = Array.isArray(p.items) ? (p.items as Array<Record<string, unknown>>) : [];
  const items: MediaItem[] = rawItems
    .filter((it) => typeof it?.id === 'string' && typeof it?.name === 'string')
    .map((it) => {
      const dur = num(it.durationSec) ?? 0;
      const animated = dur > 0;
      // MediaGrid renders the duration label as frames/fps; the service reports
      // seconds only, so fps is a fixed synthetic base and frames is derived to match.
      return {
        id: String(it.id),
        name: String(it.name),
        type: animated ? 'animated' : 'static',
        fps: 30,
        frames: animated ? Math.max(1, Math.round(dur * 30)) : 0,
        width: 0,
        height: 0,
        importedAtUnixMs: 0,
      };
    });
  const rawThumbs = (p.thumbs && typeof p.thumbs === 'object') ? (p.thumbs as Record<string, unknown>) : {};
  const thumbs: Record<string, string> = {};
  for (const k of Object.keys(rawThumbs)) {
    const v = rawThumbs[k];
    if (typeof v === 'string') thumbs[k] = v;
  }
  const onDelete = p.__events?.delete;
  return (
    <MediaGrid
      items={items}
      activeId={str(p.activeId) ?? null}
      thumbs={thumbs}
      onPlay={(id) => p.__events?.play?.(id)}
      onDelete={onDelete ? (id) => onDelete(id) : undefined}
      deleteAriaLabel={str(p.deleteAriaLabel)}
      thumbAspect={num(p.thumbAspect)}
    />
  );
}

// The native themed confirm dialog. The worker owns the open flag + the pending
// target; the host fires confirm/cancel.
export function ConfirmHost(p: HostProps) {
  return (
    <ConfirmModal
      open={!!p.open}
      title={str(p.title) ?? ''}
      message={str(p.message) ?? ''}
      note={str(p.note)}
      confirmLabel={str(p.confirmLabel)}
      cancelLabel={str(p.cancelLabel)}
      destructive={p.destructive !== false}
      onConfirm={() => p.__events?.confirm?.()}
      onCancel={() => p.__events?.cancel?.()}
    />
  );
}

// The canonical collapsible section header. Controlled: the worker holds `open`
// and toggles it from the `toggle` event. `right` is optional non-interactive text.
export function CollapsibleHost(p: HostProps) {
  return (
    <CollapsibleSection
      title={str(p.title) ?? ''}
      open={p.open !== false}
      onToggle={() => p.__events?.toggle?.()}
      right={p.right != null ? String(p.right) : undefined}
      compact={!!p.compact}
    >
      {p.children}
    </CollapsibleSection>
  );
}

// A hover/focus tooltip. HoverTooltip clones its handlers + ref onto a SINGLE
// child element, so wrap the worker's subtree in one inline-flex span (a real box
// for positioning) rather than passing a possibly-multi-node fragment.
export function TooltipHost(p: HostProps) {
  const rawSide = str(p.side);
  const side = rawSide === 'top' || rawSide === 'bottom' || rawSide === 'left' || rawSide === 'right' ? rawSide : undefined;
  return (
    <HoverTooltip title={str(p.title)} body={str(p.body) ?? ''} side={side}>
      <span style={{ display: 'inline-flex', minWidth: 0 }}>{p.children}</span>
    </HoverTooltip>
  );
}
