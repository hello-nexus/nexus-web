// Blessed composite host components. These render the SAME pure presentational
// components the native widgets/pages use (WorldClockMap + city cards via
// ClockWorldView, the clock designs, the standard ViewHeader) — imported, not
// reimplemented — so an SDK page is pixel-identical to a native page with zero
// duplication. The worker places these (<WorldClock/>, <ViewHeader/>, <ClockFace/>)
// and supplies only serializable inputs; the host owns every pixel, keeping the
// visual-consistency guarantee and giving SDK pages the standard page chrome.

import type { CSSProperties } from 'react';
import type { HostProps } from './components';
import { ViewHeader } from '../../components/common/ViewHeader/ViewHeader';
import type { TabDef } from '../../components/common/Tabs/Tabs';
import { ClockWorldView } from '../../panel/widgets/clock/ClockWorldView';
import { CLOCK_DESIGNS } from '../../panel/widgets/clock/designs';

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
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
