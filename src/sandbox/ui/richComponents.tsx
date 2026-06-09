// Blessed composite host components. These render the SAME pure presentational
// components the native widgets/pages use (WorldClockMap + city cards via
// ClockWorldView, the clock designs, the standard ViewHeader) — imported, not
// reimplemented — so an SDK page is pixel-identical to a native page with zero
// duplication. The worker places these (<WorldClock/>, <ViewHeader/>, <ClockFace/>)
// and supplies only serializable inputs; the host owns every pixel, keeping the
// visual-consistency guarantee and giving SDK pages the standard page chrome.

import type { CSSProperties, ReactNode } from 'react';
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

// A boolean switch — the native Toggle. The worker sends `value`; the host
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

// A segmented switcher — a row of the native IconLabelButton (the same pill the
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

// The native free-form HSV colour picker (SV square + hue strip + hex field) —
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

// The native empty state — icon + title + hint.
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
