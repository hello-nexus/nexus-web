// Bundles the Preview* components alongside the REGISTRY data array; one
// file per preview to satisfy the fast-refresh rule would be dozens of tiny
// files. Storybook entries reload (not HMR) on edit.
import { useEffect, useRef, useState, type CSSProperties, type FC } from 'react';
import { Monitor, Palette, Sparkles, X, Plus, Settings, Download, AlertTriangle, HardDrive, Heart, Pause, Pointer, Power } from 'lucide-react';
import { ViewHeader } from '../components/common/ViewHeader/ViewHeader';
import { Sparkline } from '../components/common/Sparkline/Sparkline';
import { SensorCard } from '../components/common/SensorCard/SensorCard';
import { Card } from '../components/common/Card/Card';
import { InfoList, InfoRow } from '../components/common/InfoList/InfoList';
import { StatTile } from '../components/common/StatTile/StatTile';
import { SystemSpecsPanel } from '../components/common/SystemSpecsPanel/SystemSpecsPanel';
import { Avatar } from '../components/common/Avatar/Avatar';
import { Slider } from '../components/common/Slider/Slider';
import { RangeSlider } from '../components/common/Slider/RangeSlider';
import { EditableText } from '../components/common/Editable/EditableText';
import { EditableNumber } from '../components/common/Editable/EditableNumber';
import { HsvPicker } from '../components/common/HsvPicker/HsvPicker';
import { PaletteRing } from '../components/common/PaletteRing/PaletteRing';
import { EffectTemplateSelector } from '../components/common/EffectTemplateSelector/EffectTemplateSelector';
import { DeviceModal } from '../components/common/DeviceModal/DeviceModal';
import { Slideout } from '../components/common/Slideout/Slideout';
import { CardDeleteButton } from '../components/common/CardDeleteButton/CardDeleteButton';
import { InfoTooltip } from '../components/common/InfoTooltip/InfoTooltip';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { ChartHoverTooltip, ChartTooltipHeader, ChartTooltipRow, ChartTooltipVal } from '../components/common/ChartHoverTooltip/ChartHoverTooltip';
import { DeviceWarningIcon } from '../components/common/DeviceWarningIcon/DeviceWarningIcon';
import { DeviceGroupIcon } from '../components/common/DeviceGroupIcon/DeviceGroupIcon';
import { NexusControlOffIcon } from '../components/common/NexusControlOffIcon/NexusControlOffIcon';
import { NexusControlCard } from '../components/common/NexusControlCard/NexusControlCard';
import { FeatureDisabled } from '../components/common/FeatureDisabled/FeatureDisabled';
import { Popover } from '../components/common/Popover/Popover';
import { DatePicker } from '../components/common/DatePicker/DatePicker';
import { EffectCard } from '../components/common/EffectCard/EffectCard';
import { PairedPcsContent } from '../components/common/PairedPcs/PairedPcsContent';
import { EffectControls } from '../panel/widgets/lighting/page/EffectControls';
import { Tabs } from '../components/common/Tabs/Tabs';
import { ChipGroup } from '../components/common/ChipGroup/ChipGroup';
import { ConfirmModal } from '../components/common/ConfirmModal/ConfirmModal';
import { PromptModal } from '../components/common/PromptModal/PromptModal';
import { KlipyPicker } from '../components/common/KlipyPicker/KlipyPicker';
import { UsageBar } from '../components/common/UsageBar/UsageBar';
import { CapacityBar } from '../components/common/CapacityBar/CapacityBar';
import { SupportedDevicesModal } from '../components/common/SupportedDevicesModal/SupportedDevicesModal';
import { SupportedDevicesList, type SupportedDeviceRow } from '../components/common/SupportedDevicesList/SupportedDevicesList';
import { Overlay } from '../components/common/Overlay/Overlay';
import { ColorPickerWithPresets } from '../components/common/ColorPickerWithPresets/ColorPickerWithPresets';
import { SearchInput } from '../components/common/SearchInput/SearchInput';
import { Toggle } from '../components/common/Toggle/Toggle';
import { EmptyState } from '../components/common/EmptyState/EmptyState';
import { Select } from '../components/common/Select/Select';
import { IconLabelButton } from '../components/common/IconLabelButton/IconLabelButton';
import { AdvancedModeCta } from '../components/common/AdvancedModeCta/AdvancedModeCta';
import { ModeMenu } from '../components/common/ModeMenu/ModeMenu';
import { DeviceCountSummary } from '../components/common/DeviceCountSummary/DeviceCountSummary';
import { SimpleModeNotice } from '../components/common/SimpleModeNotice/SimpleModeNotice';
import { Button } from '../components/common/Button/Button';
import { EndTaskButton } from '../components/common/EndTaskButton/EndTaskButton';
import { ConflictAllClear } from '../components/common/ConflictAllClear/ConflictAllClear';
import { ConflictAppCard } from '../components/common/ConflictAppCard/ConflictAppCard';
import { SkipOnboardingButton } from '../components/common/SkipOnboardingButton/SkipOnboardingButton';
import { ToastProvider, useToast } from '../components/common/Toast/Toast';
import { WidgetHeader } from '../components/common/WidgetHeader/WidgetHeader';
import { DEFAULT_ACCENT, PRESET_ACCENTS } from '../lib/settings';
import { defaultStateFor, type EffectState, type EffectTemplateBundle } from '../types/lighting';
import { defaultTemplatesFor } from '../types/lightingTemplates';
import { cachedAnimateDefaults, fetchAnimateDefaults } from '../api/lighting';
import type { HardwareSensor } from '../hooks/useSensors';
import { PanelMixerSliderPreview } from './PanelMixerSliderPreview';
import { TextStyles } from './TextStyles';
import { SurfaceStyles } from './SurfaceStyles';
import { MicroBar } from '../panel/widgets/monitoring/MicroBar';
import { GaugeTrack } from '../panel/widgets/monitoring/gauges/GaugeTrack';
import { GaugeValue } from '../panel/widgets/monitoring/gauges/GaugeValue';
import { pairingPreviewQr } from '../components/common/PairingQr/pairingPreviewData';
import { PanelThemeSettings, type PanelThemeSettingsState } from '../panel/editor/PanelThemeSettings';
import { DEFAULT_PANEL_SLIDESHOW_INTERVAL } from '../panel/background/panelBackground';
import { SectionHeader } from '../components/common/SectionHeader/SectionHeader';
import { MenuDivider } from '../components/common/MenuDivider/MenuDivider';
import { CollapsibleSection } from '../components/common/CollapsibleSection/CollapsibleSection';
import { SortableList, type SortableRowArgs } from '../components/common/SortableList/SortableList';
import { GroupedSortableList } from '../components/common/SortableList/GroupedSortableList';
import { type Arrangement } from '../components/common/SortableList/groupedDrag';
import { SettingsSection } from '../components/common/SettingsSection/SettingsSection';
import { SettingRow, SettingSelect, SettingSlider, SettingToggle } from '../components/common/SettingRow/SettingRow';
import { ServiceLaunchButton } from '../components/common/ServiceLaunchButton/ServiceLaunchButton';
import { DesktopOnlyBadge } from '../components/common/DesktopOnlyBadge/DesktopOnlyBadge';
import { ExperimentalBadge } from '../components/common/ExperimentalBadge/ExperimentalBadge';
import { PairingQrView } from '../components/common/PairingQr/PairingQrView';
import { AboutModal } from '../components/common/AboutModal/AboutModal';
import { HeartBurst, useHeartBurstTrigger } from '../components/common/HeartBurst/HeartBurst';
import { UpdateBadge } from '../components/common/UpdateBadge/UpdateBadge';
import { TopBarStatusButton } from '../components/common/TopBarStatusButton/TopBarStatusButton';
import { UpdateModal } from '../components/common/UpdateModal/UpdateModal';
import { NexusMark, NexusWordmark } from '../components/icons/NexusBrand';
import { PanelArrowButton } from '../panel/chrome/PanelArrowButton';
import { PanelPageIndicator } from '../panel/chrome/PanelPageIndicator';
import { WidgetCellLabel } from '../panel/widgets/common/WidgetCellLabel';
import { StableDigits } from '../panel/widgets/common/StableDigits';
import { FitLine } from '../panel/widgets/common/FitLine';
import { WidgetOfflineState } from '../panel/widgets/common/WidgetOfflineState';
import { SIZE_ICONS } from '../panel/widgets/common/SizeIcons';
import { IconPicker } from '../panel/widgets/common/IconPicker';
import { EmojiPicker } from '../panel/widgets/common/EmojiPicker';
import type { DeckIcon, DeckConfig } from '../panel/widgets/deck/types';
import { DeckEditor } from '../panel/widgets/deck/DeckEditor';
import { DeckPageStrip } from '../panel/widgets/deck/DeckPageStrip';
import { makePhysicalDeckTarget } from '../panel/widgets/deck/deckTarget';
import { MediaCropper } from '../components/common/MediaCropper/MediaCropper';
import { SyncConflictModal } from '../components/common/SyncConflictModal/SyncConflictModal';
import { Spinner as StorybookSpinner } from '../components/common/Spinner/Spinner';
import { Stepper as StorybookStepper } from '../components/common/Stepper/Stepper';
import { RangeBar } from '../components/common/RangeBar/RangeBar';
import { Badge as StorybookBadge } from '../components/common/Badge/Badge';
import { LiveFollowControl } from '../components/common/LiveFollowControl/LiveFollowControl';
import { SeriesChart } from '../components/common/SeriesChart/SeriesChart';
import { TimeSeriesChart } from '../components/common/TimeSeriesChart/TimeSeriesChart';
import { TimelineBrush } from '../components/common/TimelineBrush/TimelineBrush';
import { EventTimeline } from '../components/common/EventTimeline/EventTimeline';
import { TextInput } from '../components/common/TextInput/TextInput';
import { Ring as StorybookRing } from '../components/common/Ring/Ring';
import { Gauge as StorybookGauge } from '../components/common/Gauge/Gauge';
import { CanvasNoticeBar } from '../components/common/CanvasNoticeBar';
// Side-effect: pulls the global `.panel-root { --panel-*: … }` token rules into
// the Storybook bundle so the panel-scoped preview below resolves its vars.
// Idempotent - PanelDevicePage imports the same sheet.
import '../panel/styles/tokens.scss';
import styles from './StorybookModal.module.scss';

/*
 * Component registry. This is the source of truth for the Storybook viewer.
 * Add an entry here whenever a new shared component lands under
 * src/components/ (or a sub-component used by 2+ views). Removing a component
 * means removing its entry here.
 *
 * Entries should have a `Preview` when they can render with stable local stub
 * props. View-level orchestration (whole pages, shells, drawers tied to live
 * state) is intentionally out of scope - this is a primitives catalogue, not a
 * routing map.
 */

export type StorybookCategory =
  | 'foundation'
  | 'inputs' | 'editable' | 'cards' | 'modals' | 'charts'
  | 'navigation' | 'status' | 'panel-kit';

export interface StorybookEntry {
  name: string;
  category: StorybookCategory;
  filePath: string;
  description: string;
  Preview?: FC;
  notes?: string;
  usageCount?: number;
  // Foundation pages (text styles, color tokens) span the full grid width
  // because their previews are wide tables, not small component cards.
  fullWidth?: boolean;
}

/* ── Previews ────────────────────────────────────────────────────────────── */

function PreviewSliderInline() {
  const [v, setV] = useState(75);
  const cap = v > 60 ? 60 : undefined;
  return <Slider label="Sample" value={v} min={0} max={100} onChange={setV} fillCap={cap} marker={cap} />;
}

function PreviewSliderStacked() {
  const [v, setV] = useState(0);
  return <Slider orientation="stacked" editable label="Bipolar" value={v} min={-100} max={100} zeroMarker
    onChange={x => setV(x)} />;
}

function PreviewSliderFormatted() {
  const [v, setV] = useState(1.5);
  return <Slider orientation="stacked" label="Response time" value={v} min={0.1} max={5.0} step={0.1}
    formatValue={x => x.toFixed(1) + 's'} onChange={setV} />;
}

function PreviewSliderRange() {
  const [v, setV] = useState(800);
  return <Slider orientation="stacked" label="DPI" value={v} min={100} max={3200} step={50} showRange
    formatValue={x => `${x} DPI`} onChange={setV} />;
}

function PreviewEditableText() {
  const [name, setName] = useState('Click to edit');
  return <EditableText value={name} onCommit={setName} />;
}

function PreviewEditableNumber() {
  const [v, setV] = useState(42);
  return <EditableNumber value={v} min={0} max={100} onCommit={setV} />;
}

function PreviewDatePicker() {
  const iso = new Date().toISOString().slice(0, 10);
  const [v, setV] = useState(iso);
  return <DatePicker value={v} max={iso} onChange={setV} />;
}

function PreviewHeartBurst() {
  const [active, setActive] = useState(false);
  const burstKey = useHeartBurstTrigger(active);
  return (
    <div className={styles.previewHoverCard} style={{ position: 'relative' }}>
      <span>Anonymous telemetry</span>
      <button type="button" className={styles.previewBtn} onClick={() => setActive(a => !a)}>
        Toggle
      </button>
      <HeartBurst burstKey={burstKey} />
    </div>
  );
}

function PreviewPopover() {
  const [openA, setOpenA] = useState(false);
  const [openB, setOpenB] = useState(false);
  const wrapA = useRef<HTMLDivElement | null>(null);
  const wrapB = useRef<HTMLDivElement | null>(null);
  return (
    <div className={styles.previewStack}>
      <div
        ref={wrapA}
        className={styles.previewHoverCard}
        style={{ position: 'relative', justifyContent: 'space-between' }}
      >
        <span>Bottom-start</span>
        <button type="button" onClick={() => setOpenA(o => !o)}>Toggle</button>
        <Popover open={openA} onClose={() => setOpenA(false)} anchorRef={wrapA} placement="bottom-start">
          <strong>Bottom start</strong>
          <p style={{ margin: 0 }}>Anchored under the trigger, grows right.</p>
        </Popover>
      </div>
      <div
        ref={wrapB}
        className={styles.previewHoverCard}
        style={{ position: 'relative', justifyContent: 'space-between' }}
      >
        <span>Right-start</span>
        <button type="button" onClick={() => setOpenB(o => !o)}>Toggle</button>
        <Popover open={openB} onClose={() => setOpenB(false)} anchorRef={wrapB} placement="right-start">
          <strong>Right start</strong>
          <p style={{ margin: 0 }}>Anchored to the right of the trigger.</p>
        </Popover>
      </div>
    </div>
  );
}

function PreviewInfoTooltip() {
  return (
    <div className={styles.previewStack}>
      <div className={styles.previewHoverCard}>
        <span>Monitoring</span>
        <InfoTooltip message="Live view of your system's CPU, memory, network, and app-focus activity." side="right" />
      </div>
      <div className={styles.previewHoverCard}>
        <span>Cooling</span>
        <InfoTooltip message="Shape how fans respond to temperature. Build curves, assign them to fan channels, and monitor live readings." side="bottom" />
      </div>
      <div className={styles.previewHoverCard}>
        <span>Devices</span>
        <InfoTooltip message="Every USB device Nexus can see. Browse the supported-hardware catalogue or inspect the raw USB table." side="top" />
      </div>
    </div>
  );
}

function PreviewHoverTooltip() {
  return (
    <div className={styles.previewStack}>
      <div className="chip-group" style={{ display: 'flex', gap: '0.3rem' }}>
        <HoverTooltip title="Fixed" body="Hold a constant duty regardless of temperature." side="bottom">
          <button type="button" className="chip-action chip-active" aria-label="Fixed">
            <Monitor size={14} aria-hidden />
          </button>
        </HoverTooltip>
        <HoverTooltip title="Linear" body="Ramp duty smoothly between a min and max temperature." side="bottom">
          <button type="button" className="chip-action" aria-label="Linear">
            <Sparkles size={14} aria-hidden />
          </button>
        </HoverTooltip>
        <HoverTooltip title="Custom" body="Multi-point shape. Drag points to adjust, double-click to add, right-click to remove." side="bottom">
          <button type="button" className="chip-action" aria-label="Custom">
            <Palette size={14} aria-hidden />
          </button>
        </HoverTooltip>
      </div>
      <HoverTooltip body="Single-line variant - just a body, no title." side="right">
        <button type="button" className="chip-action" aria-label="Body only">
          <Settings size={14} aria-hidden />
        </button>
      </HoverTooltip>
      <HoverTooltip
        title="Multi-line variant"
        body={<>Line one<br />Line two<br />Line three</>}
        side="right"
      >
        <button type="button" className="chip-action" aria-label="Multi-line body">
          <AlertTriangle size={14} aria-hidden />
        </button>
      </HoverTooltip>
    </div>
  );
}

function PreviewChartHoverTooltip() {
  return (
    <div style={{ position: 'relative', height: 90 }}>
      <ChartHoverTooltip>
        <ChartTooltipHeader><span>14:32:05</span></ChartTooltipHeader>
        <ChartTooltipRow color="var(--accent)" name="Temperature">
          <ChartTooltipVal>45°C</ChartTooltipVal>
        </ChartTooltipRow>
        <ChartTooltipRow color="var(--accent-glow)" name="Fan duty">
          <ChartTooltipVal>33%</ChartTooltipVal>
        </ChartTooltipRow>
      </ChartHoverTooltip>
    </div>
  );
}

function PreviewDeviceWarningIcon() {
  return (
    <div className={styles.previewStack}>
      <div className={styles.previewHoverCard}>
        <span>Y70 Touch Display</span>
        <DeviceWarningIcon code="usb-disconnected" />
      </div>
      <div className={styles.previewHoverCard}>
        <span>Unknown code</span>
        <DeviceWarningIcon code="some-future-code" />
      </div>
    </div>
  );
}

function PreviewDeviceGroupIcon() {
  const rows: Array<[label: string, id: string, iconType?: string]> = [
    ['Motherboard (OpenRGB)', 'openrgb-1', 'motherboard'],
    ['GPU (OpenRGB)', 'openrgb-2', 'gpu'],
    ['RAM (OpenRGB)', 'openrgb-3', 'dram'],
    ['Motherboard headers (cooling)', 'motherboard'],
    ['HYTE NP50', 'np50:ABCD'],
    ['HYTE SmartHub', 'smarthub:1'],
    ['Lian Li hub', 'lianli:hub'],
    ['Philips Hue', 'hue:bridge', 'bulb'],
    ['Unknown device', 'something-else'],
  ];
  return (
    <div className={styles.previewStack}>
      {rows.map(([label, id, iconType]) => (
        <div key={id} className={styles.previewHoverCard}>
          <DeviceGroupIcon id={id} iconType={iconType} />
          <span>{label}</span>
        </div>
      ))}
    </div>
  );
}

function PreviewNexusControlOffIcon() {
  return (
    <div className={styles.previewStack}>
      <div className={styles.previewHoverCard}>
        <span>Corsair iCUE LINK Hub</span>
        <NexusControlOffIcon />
      </div>
    </div>
  );
}

function PreviewNexusControlCard() {
  const [checked, setChecked] = useState(true);
  return <NexusControlCard checked={checked} onChange={() => setChecked(c => !c)} />;
}

function PreviewFeatureDisabled() {
  return <FeatureDisabled feature="lighting" />;
}

function PreviewCardDeleteButton() {
  const [items, setItems] = useState(['Curve A', 'Media clip']);
  return (
    <div className={styles.previewStack}>
      {items.map(name => (
        <div key={name} className={styles.previewHoverCard}>
          <span>{name}</span>
          <CardDeleteButton onDelete={() => setItems(xs => xs.filter(x => x !== name))}
            ariaLabel={`Delete ${name}`} />
        </div>
      ))}
      {items.length === 0 && <span>All removed</span>}
    </div>
  );
}

function PreviewSparkline() {
  const values = Array.from({ length: 30 }, (_, i) => 30 + Math.sin(i / 3) * 20 + sampleNoise(i, 1));
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <Sparkline values={values} width={140} height={32} />
      <Sparkline values={values} width={140} height={32} fillOnly />
    </div>
  );
}

function PreviewSensorCard() {
  const stub = (id: string, name: string, value: number): HardwareSensor => ({
    id, name, type: 'Temperature', value, units: '°C', formatted: `${value}°C`,
    parent: { id: 'cpu', name: 'CPU' },
  });
  return <SensorCard title="CPU Temperatures" subtitle="Sample" sensors={[
    stub('1', 'CPU Package', 56),
    stub('2', 'CPU Core 0', 54),
    stub('3', 'CPU Core 1', 58),
  ]} />;
}

function PreviewCard() {
  return (
    <Card title="Sample card" subtitle="Compose into bespoke surfaces" icon={<HardDrive size={18} />}>
      <p className={styles.previewText}>Card primitive owns background, border, padding, and the title row.</p>
    </Card>
  );
}

function PreviewSystemSpecsPanel() {
  return (
    <div className={styles.previewStack}>
      <SystemSpecsPanel
        rows={[
          { label: 'Processor', value: 'AMD Ryzen 7 9800X3D' },
          { label: 'Motherboard', value: 'ASUS ROG Crosshair' },
          { label: 'Memory', value: '64 GB DDR5-6000' },
        ]}
        copyLabel="Copy"
        copiedLabel="Copied!"
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
        <SystemSpecsPanel
          variant="tiles"
          rows={[
            { icon: <Monitor size={20} />, label: 'GPU', value: 'RTX 5080' },
            { icon: <Monitor size={20} />, label: 'OS', value: 'Windows 11' },
          ]}
        />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
        <SystemSpecsPanel
          variant="tiles"
          iconInline
          rows={[
            { icon: <Monitor size={16} />, label: 'GPU', value: '42%' },
            { icon: <Monitor size={16} />, label: 'VRAM', value: '3.1 GB' },
          ]}
        />
      </div>
    </div>
  );
}

function PreviewInfoList() {
  return (
    <InfoList>
      <InfoRow label="Vendor" value="Sample Co." />
      <InfoRow label="Category" value="Mouse" capitalize />
      <InfoRow label="Wireless" value="Yes" tone="accent" />
      <InfoRow label="Firmware" value="1.4.2" tone="dim" />
    </InfoList>
  );
}

function PreviewStatTile() {
  return (
    <div style={{ display: 'flex', gap: '10px' }}>
      <StatTile label="Avg FPS" value="132" />
      <StatTile label="Sessions" value="5" />
    </div>
  );
}

function PreviewViewHeader() {
  const [active, setActive] = useState('one');
  return <ViewHeader title="Sample View" tabs={[
    { key: 'one', label: 'Tab One' }, { key: 'two', label: 'Tab Two' },
  ]} activeTab={active} onTabChange={setActive} />;
}

function PreviewTabs() {
  const [active, setActive] = useState('day');
  const [paused, setPaused] = useState(false);
  return <Tabs
    tabs={[
      { key: 'day', label: 'Day' },
      { key: 'week', label: 'Week' },
      {
        key: 'month', label: 'Month',
        // Trailing control demo: only shown on the active tab, mirroring the
        // Lighting page's per-tab pause toggle. Tabs renders this as a
        // sibling of the tab's own button (not nested inside it), so its
        // click never reaches the tab's onChange.
        trailing: active === 'month' ? (
          <span
            role="button"
            tabIndex={0}
            aria-label={paused ? 'Resume' : 'Pause'}
            onClick={e => { e.stopPropagation(); setPaused(p => !p); }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setPaused(p => !p); }
            }}
            style={{ display: 'inline-flex', cursor: 'pointer', opacity: paused ? 1 : 0.6 }}
          >
            <Pause size={12} />
          </span>
        ) : undefined,
      },
      { key: 'app', label: 'App' },
    ]}
    activeKey={active}
    onChange={setActive}
  />;
}

function PreviewChipGroup() {
  const [active, setActive] = useState('balanced');
  return <ChipGroup
    ariaLabel="Sample chip group"
    options={[
      { key: 'quiet', label: 'Quiet', tooltip: 'Prefer quiet' },
      { key: 'balanced', label: 'Balanced', tooltip: 'Prefer balanced' },
      { key: 'turbo', label: 'Turbo', tooltip: 'Prefer turbo' },
    ]}
    activeKey={active}
    onChange={setActive}
  />;
}

function PreviewChipGroupMulti() {
  const [active, setActive] = useState<ReadonlySet<string>>(new Set(['port1', 'port3']));
  return <ChipGroup
    ariaLabel="Sample multi-select chip group"
    multiSelect
    options={[
      { key: 'port1', label: 'Port 1' },
      { key: 'port2', label: 'Port 2' },
      { key: 'port3', label: 'Port 3' },
      { key: 'port4', label: 'Port 4' },
    ]}
    activeKeys={active}
    onToggleKey={key => setActive(prev => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    })}
  />;
}

function PreviewConfirmModal() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={styles.previewBtn} onClick={() => setOpen(true)}>
        Delete sample item
      </button>
      <ConfirmModal
        open={open}
        title="Delete item?"
        message={'This cannot be undone.\nThe item will be permanently removed.'}
        note="Only applies to this device. Other profiles are unaffected."
        onConfirm={() => setOpen(false)}
        onCancel={() => setOpen(false)}
      >
        <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-dim)' }}>
          children renders extra content here, e.g. a password field for a destructive confirm.
        </p>
      </ConfirmModal>
    </>
  );
}

// Searches the live service: the catalog runs inside the app, and without a
// Klipy key the picker shows its own unavailable state, which is a state worth
// previewing too.
function PreviewKlipyPicker() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  return (
    <>
      <button type="button" className={styles.previewBtn} onClick={() => setOpen(true)}>
        Browse GIFs
      </button>
      {last && <p className={styles.previewNote}>Last pick: <strong>{last}</strong></p>}
      <KlipyPicker
        open={open}
        busySlug={busy}
        onPick={gif => {
          setBusy(gif.slug);
          window.setTimeout(() => { setBusy(null); setLast(gif.title || gif.slug); setOpen(false); }, 600);
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

function PreviewPromptModal() {
  const [open, setOpen] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const existing = ['Default', 'Gaming', 'Quiet'];
  return (
    <>
      <button type="button" className={styles.previewBtn} onClick={() => setOpen(true)}>
        New Profile
      </button>
      {last && <p className={styles.previewNote}>Last submitted: <strong>{last}</strong></p>}
      <PromptModal
        open={open}
        title="New Profile"
        message="Enter a name for the new profile:"
        placeholder="e.g. Streaming"
        maxLength={20}
        validate={(raw) => {
          const trimmed = raw.trim();
          if (!trimmed) return null;
          const dupe = existing.some(n => n.toLowerCase() === trimmed.toLowerCase());
          return dupe ? 'A profile with this name already exists.' : null;
        }}
        onConfirm={(value) => { setLast(value); setOpen(false); }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

const sampleNoise = (index: number, seed: number) => ((index * 37 + seed * 17) % 11) / 2;

function PreviewTimeSeriesChart() {
  const DAY = 86_400_000;
  const [now] = useState(() => Date.now());
  const points = (base: number, amp: number, seedOffset: number) => Array.from({ length: 48 }, (_, i) => {
    const t = now - (48 - i) * (DAY / 8);
    const avg = base + amp * Math.sin(i / 4 + seedOffset) + sampleNoise(i, seedOffset);
    return { t, avg, max: avg + 4 };
  });
  const tempPoints = Array.from({ length: 48 }, (_, i) => {
    const t = now - (48 - i) * (DAY / 8);
    const avg = 55 + 30 * Math.sin(i / 3) + sampleNoise(i, 4) * 2;
    return { t, avg, max: avg + 5 };
  });
  const rpmPoints = Array.from({ length: 48 }, (_, i) => {
    const t = now - (48 - i) * (DAY / 8);
    const avg = 1200 + 600 * Math.sin(i / 3) + sampleNoise(i, 6) * 30;
    return { t, avg, max: avg + 40 };
  });
  // Covers the event lane: a clustered pair, a plain marker, and a privacy
  // session still in use (endT null), which draws its bar to the right edge.
  const laneEvents = [
    { key: 'e1', id: 1, t: now - DAY * 4, kind: 'app-open' as const, label: 'Chrome', detail: null, custom: false, endT: null },
    { key: 'e2', id: 2, t: now - DAY * 4 + 60_000, kind: 'usb-attach' as const, label: 'Keyboard', detail: '1234:ABCD', custom: false, endT: null },
    { key: 'e3', id: 3, t: now - DAY * 2, kind: 'custom' as const, label: 'Started the render', detail: null, custom: true, endT: null },
    { key: 'e4', id: null, t: now - DAY, kind: 'privacy-webcam' as const, label: 'Zoom', detail: null, custom: false, endT: null },
  ];
  return (
    <TimeSeriesChart
      series={[
        { id: 'cpu', name: 'CPU', color: '#8b5cf6', points: points(55, 12, 0) },
        { id: 'gpu', name: 'GPU', color: '#22d3ee', points: points(48, 18, 2) },
      ]}
      events={laneEvents}
      renderEventTooltip={e => e.label}
      height={220}
      valueFormat={v => `${Math.round(v)}°C`}
      xTickFormat={t => new Date(t).toLocaleDateString(undefined, { weekday: 'short' })}
      avgLabel="Avg"
      maxLabel="Max"
      yAxisSide="right"
      ribbons={[
        { points: tempPoints, fill: 'var(--accent)', valueLabel: `${Math.round(tempPoints[tempPoints.length - 1].avg)}°C` },
        { points: rpmPoints, fill: 'var(--accent)', valueLabel: `${Math.round(rpmPoints[rpmPoints.length - 1].avg)} RPM` },
      ]}
      tooltipExtra={() => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, paddingTop: 6, borderTop: '1px solid var(--separator)' }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: '#8b5cf6', flexShrink: 0 }} />
          <span style={{ fontSize: 'var(--type-small)', color: 'var(--text-dim)' }}>Chrome</span>
          <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--type-mini)' }}>20m</span>
        </div>
      )}
    />
  );
}

function PreviewTimelineBrush() {
  const DAY = 86_400_000;
  const [now] = useState(() => Date.now());
  const domainStart = now - 7 * DAY;
  const [range, setRange] = useState<[number, number]>([now - DAY, now]);
  const silhouette = Array.from({ length: 200 }, (_, i) => ({
    t: domainStart + (i / 199) * (now - domainStart),
    v: 40 + 20 * Math.sin(i / 6) + sampleNoise(i, 1) * 2,
  }));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <TimelineBrush
        domainStart={domainStart}
        domainEnd={now}
        from={range[0]}
        to={range[1]}
        onChange={(from, to) => setRange([from, to])}
        silhouette={silhouette}
        ariaLabel="Time range"
        ariaValueText={(from, to) => `${new Date(from).toLocaleString()} to ${new Date(to).toLocaleString()}`}
        formatEdgeLabels={(start, end) => [
          {
            day: new Date(start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            time: new Date(start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
          },
          {
            day: new Date(end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
            time: new Date(end).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
          },
        ]}
      />
    </div>
  );
}

function PreviewEventTimeline() {
  const [now] = useState(() => Date.now());
  const HOUR = 3_600_000;
  const lanes = [
    { id: 'appCrash', label: 'App crash' },
    { id: 'whea', label: 'WHEA' },
    { id: 'tdr', label: 'GPU reset' },
  ];
  const events = [
    { id: 'e1', laneId: 'appCrash', t: now - 20 * HOUR, color: 'var(--bad)', weight: 2 },
    { id: 'e2', laneId: 'appCrash', t: now - 19.7 * HOUR, color: 'var(--bad)', weight: 2 },
    { id: 'e3', laneId: 'whea', t: now - 12 * HOUR, color: 'var(--warn)', weight: 1 },
    { id: 'e4', laneId: 'whea', t: now - 5 * HOUR, color: 'var(--warn)', weight: 1 },
    { id: 'e5', laneId: 'tdr', t: now - 2 * HOUR, color: 'var(--warn)', weight: 1 },
  ];
  return (
    <EventTimeline
      lanes={lanes}
      events={events}
      domain={[now - 24 * HOUR, now]}
      xTickFormat={t => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric' })}
      renderTooltip={cluster => (
        <div style={{ fontSize: 'var(--type-small)' }}>
          {cluster.events.length} event{cluster.events.length > 1 ? 's' : ''} in {cluster.laneId}
        </div>
      )}
    />
  );
}

function PreviewSupportedDevicesModal() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={styles.previewBtn} onClick={() => setOpen(true)}>
        Browse catalog
      </button>
      <SupportedDevicesModal
        open={open}
        onClose={() => setOpen(false)}
        source="all"
      />
    </>
  );
}

const SUPPORTED_DEVICES_LIST_STUB: SupportedDeviceRow[] = [
  { vendor: 'HYTE', model: 'Keeb TKL', category: 'keyboard', vendorId: '0x3402', productId: '0x0300', capabilities: ['rgb'], source: 'nexus' },
  { vendor: 'Corsair', model: 'iCUE LINK Hub', category: 'lighting', vendorId: '0x1B1C', productId: '0x0C3F', capabilities: ['RGB', 'Fan Control'], source: 'openrgb' },
  { vendor: 'Elgato', model: 'Stream Deck MK.2', category: 'controller', vendorId: '0x0FD9', productId: '0x0080', capabilities: ['keys', 'brightness', 'screen'], source: 'nexus' },
  { vendor: 'NZXT', model: 'Kraken Elite RGB', category: 'cooling', vendorId: '0x1E71', productId: '0x2007', capabilities: ['RGB', 'LCD', 'Pump Speed'], source: 'openrgb' },
];

function PreviewSupportedDevicesList() {
  return (
    <SupportedDevicesList
      devices={SUPPORTED_DEVICES_LIST_STUB}
      detectedVidPids={new Set(['0x1532:0x0290'])}
    />
  );
}

function PreviewHsvPicker() {
  const [color, setColor] = useState(DEFAULT_ACCENT);
  return <div className={styles.previewHsv}>
    <HsvPicker value={color} onPreview={setColor} onCommit={setColor} />
  </div>;
}

function PreviewPaletteRing() {
  const [hue, setHue] = useState(0.05);
  const [colorize, setColorize] = useState(0.5);
  return <PaletteRing
    hue={hue}
    colorize={colorize}
    onChange={(h, c) => { setHue(h); setColorize(c); }}
    onCommit={() => { /* no-op for preview */ }}
  />;
}

const EFFECT_TEMPLATE_PREVIEW_EFFECT = 'aurora';

function resolvePreviewEffectState(
  effect: string,
  bundle: EffectTemplateBundle,
  index = bundle.selected,
): EffectState {
  const base = defaultStateFor(effect);
  const slot = bundle.slots[index];
  return slot
    ? { ...base, ...slot, params: { ...base.params, ...slot.params } }
    : base;
}

function mergePreviewEffectState(prev: EffectState, patch: Partial<EffectState>): EffectState {
  return {
    ...prev,
    ...patch,
    params: patch.params ? { ...prev.params, ...patch.params } : prev.params,
  };
}

// Upgrades the preview bundle from the baseline to the canonical defaults once
// the session cache holds them (fetching if a lighting surface hasn't already).
function useAnimateDefaultsBundle(): [EffectTemplateBundle, (b: EffectTemplateBundle) => void] {
  const [bundle, setBundle] = useState(() => defaultTemplatesFor(EFFECT_TEMPLATE_PREVIEW_EFFECT, cachedAnimateDefaults()));
  useEffect(() => {
    if (cachedAnimateDefaults()) return;
    let cancelled = false;
    fetchAnimateDefaults().then(defaults => {
      if (!cancelled && defaults) setBundle(defaultTemplatesFor(EFFECT_TEMPLATE_PREVIEW_EFFECT, defaults));
    });
    return () => { cancelled = true; };
  }, []);
  return [bundle, setBundle];
}

function PreviewEffectTemplateSelector() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [bundle] = useAnimateDefaultsBundle();
  return (
    <EffectTemplateSelector
      className={styles.previewTemplateSelector}
      effect={EFFECT_TEMPLATE_PREVIEW_EFFECT}
      slots={bundle.slots}
      activeIndex={activeIndex}
      onSelect={setActiveIndex}
      ariaLabel="Preset thumbnails preview"
    />
  );
}

function PreviewEffectControls() {
  const [bundle, setBundle] = useAnimateDefaultsBundle();
  const [state, setState] = useState(() => (
    resolvePreviewEffectState(EFFECT_TEMPLATE_PREVIEW_EFFECT, bundle)
  ));
  // Follow the async baseline-to-canonical bundle upgrade into the controls.
  useEffect(() => {
    setState(resolvePreviewEffectState(EFFECT_TEMPLATE_PREVIEW_EFFECT, bundle));
  }, [bundle]);

  const selectTemplate = (index: number) => {
    const selected = Math.min(Math.max(index, 0), bundle.slots.length - 1);
    const next = { ...bundle, selected };
    setBundle(next);
    setState(resolvePreviewEffectState(EFFECT_TEMPLATE_PREVIEW_EFFECT, next));
  };

  const updateState = (patch: Partial<EffectState>) => {
    const next = mergePreviewEffectState(state, patch);
    const slots = [...bundle.slots];
    slots[bundle.selected] = next;
    setState(next);
    setBundle({ ...bundle, slots });
  };

  const reset = () => {
    const next = defaultTemplatesFor(EFFECT_TEMPLATE_PREVIEW_EFFECT, cachedAnimateDefaults());
    setBundle(next);
    setState(resolvePreviewEffectState(EFFECT_TEMPLATE_PREVIEW_EFFECT, next));
  };

  return (
    <div className={styles.previewEffectControls}>
      <EffectControls
        effect={EFFECT_TEMPLATE_PREVIEW_EFFECT}
        state={state}
        bundle={bundle}
        onTemplateSelect={selectTemplate}
        canReset
        onChange={updateState}
        onCommit={() => { /* no-op for preview */ }}
        onReset={reset}
      />
    </div>
  );
}

// Self-contained (no props) - reads real localStorage on mount, so this
// renders whatever paired PCs, if any, actually exist in this browser.
function PreviewPairedPcsContent() {
  return <PairedPcsContent />;
}

function PreviewEffectCard() {
  const [active, setActive] = useState<'overlayA' | 'overlayB' | 'media' | null>('overlayA');
  return (
    <div className={styles.previewStack}>
      {/* Overlay layout: shared by the lighting shader browser and the panel
          Theme animation picker - full-bleed thumbnail, label over the lower
          third. */}
      <div className={styles.previewGridTwo}>
        <EffectCard
          overlay
          label="Aurora"
          thumbUrl={null}
          active={active === 'overlayA'}
          onClick={() => setActive('overlayA')}
        />
        <EffectCard
          overlay
          label="Orange"
          thumbUrl={null}
          active={active === 'overlayB'}
          onClick={() => setActive('overlayB')}
        />
      </div>
      {/* Static placeholder: shown when GPU is unavailable (no thumbnail can
          be generated). Non-animated so it doesn't imply a loading state. */}
      <div className={styles.previewGridTwo}>
        <EffectCard
          overlay
          label="Plasma"
          thumbUrl={null}
          thumbStatic
          active={false}
          onClick={() => {}}
        />
      </div>
      {/* Default (caption-below) layout: media library grid, meta line +
          hover-reveal delete. */}
      <div className={styles.previewGridTwo}>
        <EffectCard
          asDiv
          label="Galaxy loop"
          thumbUrl={null}
          active={active === 'media'}
          onClick={() => setActive('media')}
          meta="3.4s"
          onDelete={() => { /* preview */ }}
          deleteAriaLabel="Delete"
        />
      </div>
    </div>
  );
}

function PreviewDeviceModal() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={styles.previewBtn} onClick={() => setOpen(true)}>
        Open sample modal
      </button>
      <DeviceModal open={open} onClose={() => setOpen(false)} title="Sample modal">
        <p className={styles.previewModalBody}>
          DeviceModal wraps the standard escape-to-close + click-outside dismiss + X-button pattern.
        </p>
      </DeviceModal>
    </>
  );
}

function PreviewSlideout() {
  const [side, setSide] = useState<'right' | 'left' | null>(null);
  return (
    <>
      <button type="button" className={styles.previewBtn} onClick={() => setSide('right')}>
        Open slideout (right)
      </button>
      <button type="button" className={styles.previewBtn} onClick={() => setSide('left')}>
        Open slideout (left)
      </button>
      <Slideout
        open={side !== null}
        onClose={() => setSide(null)}
        side={side ?? 'right'}
        title="Sample slideout"
      >
        <p className={styles.previewModalBody}>
          Edge-anchored slide-in panel matching the panel editor's desktop add-widget drawer look.
          `side` picks the edge it docks to and slides in from.
        </p>
      </Slideout>
    </>
  );
}

function PreviewOverlay() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={styles.previewBtn} onClick={() => setOpen(true)}>
        Open bare overlay
      </button>
      <Overlay open={open} onClose={() => setOpen(false)} variant="dialog" className={styles.previewOverlaySurface}>
        <p className={styles.previewModalBody}>
          Overlay only ships the backdrop + dismiss behavior; the consumer brings the surface chrome.
        </p>
        <button type="button" className={styles.previewBtn} onClick={() => setOpen(false)}>Close</button>
      </Overlay>
    </>
  );
}

function PreviewRangeSliderTemp() {
  const [v, setV] = useState<[number, number]>([35, 75]);
  return (
    <RangeSlider
      orientation="stacked"
      editable
      label="Temperature"
      value={v}
      min={20}
      max={100}
      formatValue={x => `${x}°`}
      onChange={setV}
    />
  );
}

function PreviewRangeSliderSpeed() {
  const [v, setV] = useState<[number, number]>([30, 90]);
  return (
    <RangeSlider
      orientation="stacked"
      editable
      label="Speed"
      value={v}
      min={0}
      max={100}
      formatValue={x => `${x}%`}
      onChange={setV}
    />
  );
}

function PreviewColorPickerWithPresets() {
  const [color, setColor] = useState<string>(PRESET_ACCENTS[0]);
  const [custom, setCustom] = useState('');
  return (
    <ColorPickerWithPresets
      value={color}
      presets={PRESET_ACCENTS}
      onPreview={setColor}
      onCommit={setColor}
      allowCustom
      customColor={custom}
      onCustomCommit={setCustom}
    />
  );
}

function PreviewSearchInput() {
  const [q, setQ] = useState('');
  return <SearchInput value={q} onChange={setQ} placeholder="Search..." />;
}

function PreviewToggle() {
  const [on, setOn] = useState(true);
  return <Toggle checked={on} onChange={setOn} ariaLabel="Sample toggle" />;
}

function PreviewButtonMatrix() {
  return (
    <div className={styles.previewStack}>
      <div className={styles.previewRow}>
        <Button size="sm">Small</Button>
        <Button size="md">Medium</Button>
        <Button size="lg">Large</Button>
      </div>
      <div className={styles.previewRow}>
        <Button tone="neutral">Neutral</Button>
        <Button tone="accent">Accent</Button>
        <Button tone="danger">Danger</Button>
        <Button tone="danger-solid">Danger solid</Button>
        <Button tone="ghost">Ghost</Button>
      </div>
      <div className={styles.previewRow}>
        <Button icon={<Plus size={16} />}>Add</Button>
        <Button icon={<Download size={16} />} tone="accent">Install</Button>
        <Button icon={<Settings size={16} />} aria-label="Settings" />
        <Button icon={<X size={16} />} aria-label="Close" tone="ghost" />
      </div>
      <div className={styles.previewRow}>
        <Button pill>Pill</Button>
        <Button pill tone="accent">Active</Button>
        <Button loading>Saving</Button>
        <Button loading loadingHidesLabel tone="danger">End task</Button>
        <Button disabled>Disabled</Button>
      </div>
    </div>
  );
}


function PreviewSkipOnboardingButton() {
  return (
    <div className={styles.previewStack}>
      <div style={{ position: 'relative', minHeight: 64 }}>
        <SkipOnboardingButton onSkip={() => { /* preview only */ }} />
      </div>
    </div>
  );
}

function PreviewEndTaskButton() {
  // Swallowed in capture phase so the click never reaches EndTaskButton's own
  // handler - it calls the real /conflicts/kill endpoint with no override prop.
  return (
    <div className={styles.previewStack}>
      <div className={styles.previewHoverCard} onClickCapture={e => e.stopPropagation()}>
        <span>iCUE</span>
        <EndTaskButton conflictId="preview-icue" />
      </div>
    </div>
  );
}

function PreviewConflictAppCard() {
  // Swallowed in capture phase, same as PreviewEndTaskButton - the card's End
  // Task button and its owner switch call the real /conflicts/kill endpoint
  // with no override prop.
  return (
    <div className={styles.previewStack} onClickCapture={e => e.stopPropagation()}>
      <ConflictAppCard conflict={{ id: 'preview-icue', displayName: 'iCUE', category: 'cooling', processName: 'iCUE.exe', pid: 4212 }} />
      <ConflictAppCard
        conflict={{ id: 'preview-icue', displayName: 'iCUE', category: 'cooling', processName: 'iCUE.exe', pid: 4212 }}
        devices={[
          { key: 'device:corsair', name: 'iCUE LINK System Hub', owner: 'app' },
          { key: 'lighting:openrgb-s-RAM1', name: 'Vengeance RGB', owner: 'mixed' },
        ]}
        onSetOwner={async () => {}}
      />
      <ConflictAppCard
        conflict={{ id: 'preview-icue', displayName: 'iCUE', category: 'cooling', processName: 'iCUE.exe', pid: 4212 }}
        devices={[
          { key: 'device:corsair', name: 'iCUE LINK System Hub', owner: 'nexus' },
          { key: 'lighting:openrgb-s-RAM1', name: 'Vengeance RGB', owner: 'nexus' },
        ]}
        onSetOwner={async () => {}}
        terminated
      />
      <ConflictAppCard
        conflict={{ id: 'preview-icue', displayName: 'iCUE', category: 'cooling', processName: 'iCUE.exe', pid: 4212 }}
        autostart={[
          { kind: 'runKeyMachine', entryName: 'Corsair iCUE5 Software' },
          { kind: 'service', entryName: 'CorsairDeviceListerService' },
        ]}
        onDisableAutostart={async () => true}
      />
    </div>
  );
}

function PreviewToggleOff() {
  const [on, setOn] = useState(false);
  return <Toggle checked={on} onChange={setOn} ariaLabel="Sample toggle" />;
}

function PreviewEmptyState() {
  return (
    <EmptyState
      icon={<Monitor strokeWidth={1.4} />}
      title="No displays detected"
      hint="Plug in a DDC/CI capable monitor to control brightness from here."
    />
  );
}

function PreviewSelect() {
  const [v, setV] = useState('balanced');
  return (
    <Select
      value={v}
      onChange={setV}
      options={[
        // The optional `icon` slot renders before the label in both the trigger
        // and each row (used by the language picker for flags). A `divider`
        // entry renders a thin rule grouping the options around it.
        { value: 'silent', label: 'Silent', icon: '🌙' },
        { value: 'balanced', label: 'Balanced', icon: '⚖️' },
        { value: 'turbo', label: 'Turbo', icon: '🔥' },
        { value: '__sep__', label: '', divider: true },
        { value: 'custom', label: 'Custom...', icon: '⚙️' },
      ]}
      ariaLabel="Profile"
    />
  );
}

function PreviewSdkSelect() {
  const [v, setV] = useState('cpu-temp');
  return (
    <Select
      value={v}
      onChange={setV}
      options={[
        { value: 'cpu-temp', label: 'CPU Temperature' },
        { value: 'gpu-temp', label: 'GPU Temperature' },
        { value: 'mem-util', label: 'Memory Utilization' },
      ]}
      placeholder="Choose a stat"
    />
  );
}

function PreviewSdkChipGroup() {
  const [v, setV] = useState('center');
  return (
    <ChipGroup
      activeKey={v}
      onChange={setV}
      options={[
        { key: 'left', label: 'Left' },
        { key: 'center', label: 'Center' },
        { key: 'right', label: 'Right' },
      ]}
    />
  );
}

function PreviewIconLabelButton() {
  const [active, setActive] = useState('spark');
  return (
    <div className={styles.previewIconLabelRow}>
      <IconLabelButton
        icon={<Sparkles size={18} />}
        label="Spark"
        active={active === 'spark'}
        onPress={() => setActive('spark')}
      />
      <IconLabelButton
        icon={<Monitor size={18} />}
        label="Panel"
        active={active === 'panel'}
        onPress={() => setActive('panel')}
      />
      <IconLabelButton
        icon={<Palette size={18} />}
        label="Theme"
        active={active === 'theme'}
        onPress={() => setActive('theme')}
      />
    </div>
  );
}

function PreviewAdvancedModeCta() {
  return (
    <div className={styles.previewStack} style={{ width: 520 }}>
      <AdvancedModeCta
        label="More effects, templates and per-device options"
        onPress={() => {}}
      />
    </div>
  );
}

function PreviewModeMenu() {
  // The menu positions itself against its anchor, so the preview supplies the
  // positioned wrapper the lighting / cooling tab row provides in the app.
  const anchorRef = useRef<HTMLDivElement>(null);
  return (
    <div className={styles.previewStack} style={{ width: 520, height: 200 }}>
      <div ref={anchorRef} style={{ position: 'relative' }}>
        <ModeMenu
          open
          onClose={() => {}}
          anchorRef={anchorRef}
          ariaLabel="Page mode"
          entries={[
            {
              key: 'off',
              icon: <Power size={20} />,
              title: 'Off',
              description: 'Stops driving RGB. Devices fall back to their own lighting.',
              active: true,
              onSelect: () => {},
            },
            {
              key: 'simple',
              icon: <Pointer size={20} />,
              title: 'Simple mode',
              description: 'One colour on every device. No effects, patterns or per-device control.',
              onSelect: () => {},
            },
          ]}
        />
      </div>
    </div>
  );
}

function PreviewSimpleModeNotice() {
  return (
    <div className={styles.previewStack} style={{ width: 520 }}>
      <SimpleModeNotice message="A custom preset is active. Switch to advanced mode to manage it." />
    </div>
  );
}

function PreviewDeviceCountSummary() {
  return (
    <div className={styles.previewStack} style={{ width: 420 }}>
      <DeviceCountSummary detected="4/6 lighting devices controlled" action={<Button size="sm" pill>Control all</Button>} />
      <DeviceCountSummary detected="14/14 fans controlled" />
    </div>
  );
}

function PreviewWidgetHeader() {
  return (
    <div className={styles.previewStack}>
      <WidgetHeader title="Monitoring" subtitle="CPU" />
    </div>
  );
}

function PreviewMicroBars() {
  return (
    <div className={styles.previewStack} style={{ gap: 10, width: 220 }}>
      <MicroBar label="CPU TOTAL" formatted="42 %" fillPercent={42} />
      <MicroBar label="TEMP" formatted="68 C" fillPercent={68} />
      <MicroBar label="POWER" formatted="92 W" fillPercent={61} />
    </div>
  );
}

function PreviewStableDigits() {
  return (
    <div className={styles.previewStack} style={{ gap: 6, fontSize: 28, fontWeight: 800 }}>
      <div><StableDigits text="04:59.17" /></div>
      <div><StableDigits text="11:11.11" /></div>
      <div><StableDigits text="10:08 AM" /></div>
    </div>
  );
}

function PreviewFitLine() {
  return (
    <div className={styles.previewStack} style={{ gap: 10, width: 140, fontSize: 18, color: 'var(--text)' }}>
      <FitLine text="Sep 2026" />
      <FitLine text="September 2026" />
      <FitLine text="septiembre de 2026" align="start" />
    </div>
  );
}

function PreviewWidgetOfflineState() {
  return (
    <div className="panel-root" style={{ display: 'flex', gap: 12 }}>
      <div style={{ width: 90, height: 90, background: 'var(--bg-card)', borderRadius: 12 }}>
        <WidgetOfflineState compact />
      </div>
      <div style={{ width: 186, height: 186, background: 'var(--bg-card)', borderRadius: 12 }}>
        <WidgetOfflineState />
      </div>
    </div>
  );
}

function PreviewSectionHeader() {
  return (
    <div className="panel-root" style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SectionHeader>Widgets</SectionHeader>
        <div style={{ color: 'var(--text)', fontSize: 13 }}>Widget labels · blur · opacity</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SectionHeader>Theme</SectionHeader>
        <div style={{ color: 'var(--text)', fontSize: 13 }}>Sync with desktop</div>
      </div>
    </div>
  );
}

function PreviewCollapsibleSection() {
  const [open, setOpen] = useState(true);
  const [openCompact, setOpenCompact] = useState(false);
  const [openBoxed, setOpenBoxed] = useState(true);
  return (
    <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <CollapsibleSection
        title="Philips Hue"
        open={open}
        onToggle={() => setOpen(o => !o)}
        right={<span style={{ fontVariantNumeric: 'tabular-nums' }}>3</span>}
      >
        <div style={{ color: 'var(--text-dim)', padding: '4px 8px' }}>Two paired lights</div>
      </CollapsibleSection>
      <CollapsibleSection
        compact
        title="CPU sensors"
        open={openCompact}
        onToggle={() => setOpenCompact(o => !o)}
        right={<span style={{ fontVariantNumeric: 'tabular-nums' }}>12</span>}
      >
        <div style={{ color: 'var(--text-dim)', padding: '4px 8px' }}>Compact (smaller) variant</div>
      </CollapsibleSection>
      <CollapsibleSection
        boxed
        title="CPU"
        open={openBoxed}
        onToggle={() => setOpenBoxed(o => !o)}
        right={<span style={{ fontVariantNumeric: 'tabular-nums' }}>Intel Core i9</span>}
      >
        <div style={{ color: 'var(--text-dim)' }}>Boxed variant (monitoring Detailed)</div>
      </CollapsibleSection>
    </div>
  );
}

function PreviewSortableList() {
  const [ids, setIds] = useState(['Item 1', 'Item 2', 'Item 3']);
  return (
    <SortableList
      ids={ids}
      onReorder={setIds}
      renderRow={(id, a) => (
        <div
          ref={a.ref}
          role="listitem"
          style={{ ...a.style, padding: '0.5rem', background: 'var(--surface)', borderRadius: 'var(--radius-sm)', cursor: 'grab' }}
          {...a.attributes}
          {...a.listeners}
          className={a.isDragging ? a.placeholderClassName : undefined}
        >
          {id}
        </div>
      )}
    />
  );
}

function PreviewGroupedSortableList() {
  const [arrangement, setArrangement] = useState<Arrangement>({
    rowIds: ['Card 1', 'g1', 'Card 2'],
    groupMembers: { g1: ['Card 3'], g2: [] },
  });
  const row = (id: string, a: SortableRowArgs, tint: string) => (
    <div
      ref={a.ref}
      role="listitem"
      style={{ ...a.style, padding: '0.5rem', background: tint, borderRadius: 'var(--radius-sm)', cursor: 'grab' }}
      {...a.attributes}
      {...a.listeners}
      className={a.isDragging ? a.placeholderClassName : undefined}
    >
      {id}
    </div>
  );
  return (
    <div style={{ width: 260 }}>
      <GroupedSortableList
        arrangement={arrangement}
        onArrange={setArrangement}
        renderBlock={(id, a) => row(id, a, 'var(--surface)')}
        renderGroup={(id, a, children) => (
          <div ref={a.ref} style={{ ...a.style, border: '1px dashed var(--border)', borderRadius: 'var(--radius)', padding: '0.35rem' }} {...a.attributes}>
            <div {...a.listeners} style={{ cursor: 'grab', padding: '0.25rem', color: 'var(--text-dim)', fontSize: 'var(--type-mini)', textTransform: 'uppercase' }}>
              {id === 'g1' ? 'Desk' : 'Empty group'}
            </div>
            {children}
          </div>
        )}
      />
    </div>
  );
}

function PreviewSettingsSection() {
  return (
    <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SettingsSection title="General" description="Optional muted description under the title.">
        <div style={{ color: 'var(--text)', fontSize: 14, padding: '0.4rem 0' }}>Language</div>
        <div style={{ color: 'var(--text)', fontSize: 14, padding: '0.4rem 0' }}>Show conflict warnings</div>
      </SettingsSection>
      <SettingsSection title="Danger zone" titleStyle={{ color: 'var(--bad)' }}>
        <div style={{ color: 'var(--text)', fontSize: 14, padding: '0.4rem 0' }}>Shut down · Reset to defaults</div>
      </SettingsSection>
    </div>
  );
}

function PreviewPanelThemeSettings() {
  const [theme, setTheme] = useState<PanelThemeSettingsState>({
    appThemeMode: 'dark', appResolvedThemeMode: 'dark', themeSyncWithDesktop: false, themeMode: 'dark',
    appAccentColor: '#8b5cf6', accentSyncWithDesktop: false, accentColor: '#8b5cf6',
    backgroundColor: '', backgroundColorLight: '',
    // Solid keeps the (thumbnail-fetching) animation picker out of the preview.
    backgroundMode: 'solid', backgroundEffect: 'aurora', backgroundTemplate: 0, backgroundTemplates: {},
    backgroundOpacity: 0.4,
    backdrop: 'theme' as const,
    backgroundEffectState: { speed: 0, intensity: 1, hue: 0, colorize: 0, saturation: 1, contrast: 1, params: {} },
    backgroundMediaId: null, backgroundMediaType: null, backgroundMediaAlpha: false,
    backgroundSlideshow: false, backgroundSlideshowInterval: DEFAULT_PANEL_SLIDESHOW_INTERVAL, backgroundSlideshowShuffle: false, backgroundSlideshowFinishVideos: true,
    backgroundMediaOrder: [],
    backgroundFrost: 0,
    widgetOpacity: 1, widgetLabels: true, widgetPadding: 50,
  });
  const set = (patch: Partial<PanelThemeSettingsState>) => setTheme(t => ({ ...t, ...patch }));
  return (
    <div className="panel-root" style={{ width: 340, maxWidth: '100%' }}>
      <PanelThemeSettings
        theme={theme}
        resolvedThemeMode="dark"
        onThemeSyncCommit={v => set({ themeSyncWithDesktop: v })}
        onThemeModeCommit={m => set({ themeMode: m })}
        onAccentSyncCommit={v => set({ accentSyncWithDesktop: v })}
        onAccentPreview={hex => set({ accentColor: hex })}
        onAccentCommit={hex => set({ accentColor: hex })}
        onBackgroundPreview={hex => set({ backgroundColor: hex })}
        onBackgroundCommit={hex => set({ backgroundColor: hex })}
        onBackgroundModeCommit={mode => set({ backgroundMode: mode })}
        onBackdropCommit={v => set({ backdrop: v })}
        showBackdropSelector
        onBackgroundEffectCommit={fx => set({ backgroundEffect: fx })}
        onBackgroundTemplateCommit={n => set({ backgroundTemplate: n })}
        onBackgroundEffectStatePreview={s => set({ backgroundEffectState: s })}
        onBackgroundEffectStateCommit={s => set({ backgroundEffectState: s })}
        onBackgroundOpacityPreview={o => set({ backgroundOpacity: o })}
        onBackgroundOpacityCommit={o => set({ backgroundOpacity: o })}
        onBackgroundMediaCommit={() => { /* no media service in Storybook */ }}
        onBackgroundSlideshowCommit={patch => set({
          ...(patch.enabled !== undefined ? { backgroundSlideshow: patch.enabled } : {}),
          ...(patch.interval !== undefined ? { backgroundSlideshowInterval: patch.interval } : {}),
          ...(patch.shuffle !== undefined ? { backgroundSlideshowShuffle: patch.shuffle } : {}),
          ...(patch.finishVideos !== undefined ? { backgroundSlideshowFinishVideos: patch.finishVideos } : {}),
        })}
        onBackgroundMediaOrderCommit={ids => set({ backgroundMediaOrder: ids })}
        onWidgetOpacityPreview={o => set({ widgetOpacity: o })}
        onWidgetOpacityCommit={o => set({ widgetOpacity: o })}
        onWidgetLabelsCommit={v => set({ widgetLabels: v })}
        onBackgroundFrostPreview={v => set({ backgroundFrost: v })}
        onBackgroundFrostCommit={v => set({ backgroundFrost: v })}
        onWidgetPaddingPreview={v => set({ widgetPadding: v })}
        onWidgetPaddingCommit={v => set({ widgetPadding: v })}
      />
    </div>
  );
}

function PreviewSettingRow() {
  const [startup, setStartup] = useState(true);
  const [beta, setBeta] = useState(false);
  const [mode, setMode] = useState('balanced');
  const [level, setLevel] = useState(60);
  return (
    <div className={styles.previewStack}>
      <SettingToggle label="Run at startup" description="Launch Nexus when you sign in"
        checked={startup} onChange={setStartup} />
      <SettingToggle label="Beta updates" checked={beta} onChange={setBeta} disabled />
      {/* Both leading-icon tiers: the caller passes a bare glyph and the row
          sizes and colours it, so the two never drift apart. */}
      <SettingToggle
        label="Prominent tier" description="First-run and import screens"
        icon={<Heart />} iconLeading
        checked={startup} onChange={setStartup}
      />
      <SettingToggle
        label="Subtle tier" description="Settings lists"
        icon={<Heart />} iconLeading="subtle"
        checked={beta} onChange={setBeta}
      />
      <SettingSelect label="Performance mode" value={mode} onChange={setMode}
        options={[{ value: 'quiet', label: 'Quiet' }, { value: 'balanced', label: 'Balanced' }, { value: 'max', label: 'Max' }]} />
      <SettingSlider label="Brightness" value={level} min={0} max={100} step={1} editable trackFill
        formatValue={v => `${Math.round(v)}%`} onChange={v => setLevel(v)} />
      <SettingSlider label="Frosted glass" value={level} min={0} max={100} step={10} editable trackFill
        description="descriptionBelow: seats under the label, clear of the slider."
        descriptionBelow
        formatValue={v => `${Math.round(v)}%`} onChange={v => setLevel(v)} />
      <SettingRow
        label="Backdrop"
        description="Full-width description: the control keeps its place as this text changes length."
        descriptionBelow
      >
        <ChipGroup
          options={[{ key: 'a', label: 'Theme' }, { key: 'b', label: 'Wallpaper' }, { key: 'c', label: 'Desktop' }]}
          activeKey="b"
          onChange={() => {}}
          ariaLabel="Backdrop"
        />
      </SettingRow>
      <SettingRow label="Icon color" wrapControl>
        <div className={styles.previewRow}>
          {['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6']
            .map(c => <span key={c} className={styles.previewSwatch} style={{ background: c }} />)}
        </div>
      </SettingRow>
    </div>
  );
}

function PreviewServiceLaunchButton() {
  return (
    <div className={styles.previewRow}>
      <ServiceLaunchButton />
      <ServiceLaunchButton iconOnly />
    </div>
  );
}

function PreviewPairingQr() {
  const [now] = useState(() => Date.now());
  // Deterministic decorative QR-look fixture; encodes nothing.
  const qr = pairingPreviewQr(now);
  return <PairingQrView qrDataUrl={qr.qrDataUrl} expiresAt={qr.expiresAt} loading={false} now={now} />;
}

function PreviewAboutModal() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={styles.previewBtn} onClick={() => setOpen(true)}>
        Open About
      </button>
      <AboutModal open={open} onClose={() => setOpen(false)} onCheckUpdate={() => setOpen(false)} />
    </>
  );
}

function PreviewUpdateBadge() {
  return (
    <div style={{ padding: 8 }}>
      <UpdateBadge updateMode="notify" canAutoInstall downloadUrl="" onOpen={() => {}} onInstall={() => {}} />
    </div>
  );
}

function PreviewTopBarStatusButton() {
  return (
    <div style={{ display: 'flex', gap: '0.35rem', padding: 8 }}>
      <TopBarStatusButton tone="warn" icon={<AlertTriangle size={16} />} label="App conflict" onClick={() => {}} />
      <TopBarStatusButton tone="good" icon={<Download size={16} />} label="Install update" onClick={() => {}} />
    </div>
  );
}

function PreviewUpdateModal() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={styles.previewBtn} onClick={() => setOpen(true)}>
        Open Update Modal
      </button>
      <UpdateModal
        open={open}
        autoCheck={false}
        onClose={() => setOpen(false)}
        status={{
          currentVersion: '1.0.0',
          latestVersion: '1.1.0',
          updateAvailable: true,
          updateReady: false,
          canAutoInstall: true,
          downloadUrl: '',
          channel: 'production',
          updateMode: 'notify',
          releaseNotes: '## What\'s new\n- Performance improvements\n- Bug fixes',
          lastCheckedUnix: 0,
          lastCheckError: '',
          state: 'idle',
          justUpdatedTo: '',
          publishedAtUnix: 1719619200,
        }}
      />
    </>
  );
}

function PreviewBrand() {
  return (
    <div className={styles.previewRow}>
      <NexusMark size={40} />
      <NexusWordmark height={22} />
    </div>
  );
}

function PreviewPanelArrowButtons() {
  return (
    <div style={{ position: 'relative', height: 72, width: '100%' }}>
      <PanelArrowButton side="prev" onClick={() => {}} ariaLabel="Previous page" />
      <PanelArrowButton side="next" onClick={() => {}} ariaLabel="Next page" />
    </div>
  );
}

function PreviewPanelPageIndicator() {
  const [page, setPage] = useState(0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <PanelPageIndicator total={4} active={page} visibilityToken={page} />
      <button type="button" className={styles.previewBtn} onClick={() => setPage(p => (p + 1) % 4)}>
        Next page
      </button>
    </div>
  );
}

function PreviewWidgetCellLabel() {
  return <WidgetCellLabel label="Cooling" />;
}

function PreviewSizeIcons() {
  return (
    <div className={styles.previewRow}>
      {Object.entries(SIZE_ICONS).map(([size, Icon]) => <Icon key={size} aria-label={size} />)}
    </div>
  );
}

function PreviewGaugeTrack() {
  return (
    <div className={styles.previewStack}>
      <GaugeTrack fillPercent={35} />
      <div style={{ '--gauge-track-height': '8px', '--gauge-track-glow': '8px' } as CSSProperties}>
        <GaugeTrack fillPercent={72} />
      </div>
    </div>
  );
}

function PreviewGaugeValue() {
  return (
    <div className={styles.previewStack}>
      <div style={{ fontSize: '1.8em', fontWeight: 800 }}>
        <GaugeValue formatted="2312 RPM" />
      </div>
      <div style={{ fontSize: '1.8em', fontWeight: 800 }}>
        <GaugeValue formatted="2300 RPM" />
      </div>
      <div style={{ width: 90, fontSize: '1.8em', fontWeight: 800, outline: '1px dashed var(--panel-card-border)' }}>
        <GaugeValue formatted="10240.5 MB/s" />
      </div>
    </div>
  );
}

function PreviewIconPicker() {
  const [icon, setIcon] = useState<DeckIcon | undefined>({ kind: 'lucide', value: 'Rocket' });
  return (
    <div style={{ width: '100%', maxWidth: 320 }}>
      <IconPicker value={icon} onChange={setIcon} />
    </div>
  );
}

function PreviewEmojiPicker() {
  const [emoji, setEmoji] = useState<string | undefined>('\u{1F600}');
  return (
    <div style={{ width: '100%', maxWidth: 320 }}>
      <EmojiPicker value={emoji} onSelect={setEmoji} searchable />
    </div>
  );
}

// Uses the real makePhysicalDeckTarget factory (not a bespoke mock) so the
// story exercises the same code path DeckSettings/StreamDeckDevicePage do:
// a 2x3 Mini-shaped grid, editable in place.
function PreviewDeckEditorPhysical() {
  const [config, setConfig] = useState<DeckConfig>({ pages: [{ slots: [] }] });
  const [page, setPage] = useState(0);
  const [folderPath, setFolderPath] = useState<number[]>([]);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const target = makePhysicalDeckTarget(3, 2, 6, config, setConfig);
  return (
    <div style={{ width: '100%', maxWidth: 420 }}>
      <DeckEditor
        target={target}
        page={page}
        onPageChange={p => { setPage(p); setFolderPath([]); }}
        folderPath={folderPath}
        onFolderPathChange={setFolderPath}
        selectedSlot={selectedSlot}
        onSelectedSlotChange={setSelectedSlot}
        surface="desktop"
        desktopEditor
      />
    </div>
  );
}

function PreviewDeckPageStrip() {
  const [pageCount, setPageCount] = useState(3);
  const [page, setPage] = useState(0);
  const [hasContent, setHasContent] = useState<Record<number, boolean>>({ 1: true });
  return (
    <div style={{ width: '100%', maxWidth: 420 }}>
      <DeckPageStrip
        pageCount={pageCount}
        currentPage={page}
        onSelectPage={setPage}
        onAddPage={() => { setPageCount(n => n + 1); setPage(pageCount); }}
        onRemoveCurrentPage={() => {
          setPageCount(n => Math.max(1, n - 1));
          setHasContent(prev => { const next = { ...prev }; delete next[page]; return next; });
          setPage(p => Math.max(0, p - 1));
        }}
        currentPageHasContent={!!hasContent[page]}
      />
    </div>
  );
}

function PreviewToastInner() {
  const { push } = useToast();
  return (
    <Button
      onClick={() => push({
        title: 'IMG_0042.jpg from iPhone',
        body: 'Saved to Nexus Inbox',
        action: { label: 'Open folder', onClick: () => {} },
      })}
    >
      Push toast
    </Button>
  );
}

function PreviewToast() {
  return (
    <ToastProvider>
      <PreviewToastInner />
    </ToastProvider>
  );
}

function PreviewDesktopOnlyBadge() {
  return <DesktopOnlyBadge />;
}

function PreviewExperimentalBadge() {
  return <ExperimentalBadge />;
}

// Inline SVG sample image (160x90) for the cropper preview.
// Provides a visible still without loading a remote asset.
const SAMPLE_CROP_SRC = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjkwIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSIxNjAiIGhlaWdodD0iOTAiIGZpbGw9IiMzMzM2NTMiLz48dGV4dCB4PSI4MCIgeT0iNTAiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM5OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiPnNhbXBsZTwvdGV4dD48L3N2Zz4=';

function PreviewMediaCropper() {
  const [open, setOpen] = useState(true);
  const [lastCrop, setLastCrop] = useState<string | null>(null);
  if (!open) {
    return (
      <div style={{ padding: 16, color: 'var(--text-dim)', fontSize: 13 }}>
        {lastCrop ? `Crop: ${lastCrop}` : 'Cancelled'}
        <button type="button" style={{ marginLeft: 12, fontSize: 12 }} onClick={() => setOpen(true)}>
          Reopen
        </button>
      </div>
    );
  }
  return (
    <MediaCropper
      src={SAMPLE_CROP_SRC}
      aspect={16 / 9}
      onConfirm={c => { setLastCrop(`${c.x.toFixed(3)},${c.y.toFixed(3)},${c.w.toFixed(3)},${c.h.toFixed(3)}`); setOpen(false); }}
      onCancel={() => setOpen(false)}
    />
  );
}

function PreviewMenuDivider() {
  return (
    <div style={{ width: 200, background: 'var(--bg-elevated)', padding: '0.35rem', borderRadius: 'var(--radius-sm)' }}>
      <div style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: 'var(--type-small)' }}>Row above</div>
      <MenuDivider />
      <div style={{ padding: '0.4rem 0.6rem', color: 'var(--text-dim)', fontSize: 'var(--type-small)' }}>Row below</div>
    </div>
  );
}

function PreviewSpinner() {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <StorybookSpinner size={16} />
      <StorybookSpinner size={20} />
      <StorybookSpinner size={28} />
    </div>
  );
}

function PreviewAvatar() {
  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
      <Avatar name="Nova" size={28} />
      <Avatar name="Kestrel" size={36} />
      <Avatar name="Ryder" size={96} />
    </div>
  );
}

function PreviewCanvasNoticeBar() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ position: 'relative', width: '100%', height: 56, background: '#111', borderRadius: 6, overflow: 'hidden' }}>
        <CanvasNoticeBar visible tone="wait" message="Setting up the graphics card for lighting - your devices stay dark until it finishes." />
      </div>
      <div style={{ position: 'relative', width: '100%', height: 56, background: '#111', borderRadius: 6, overflow: 'hidden' }}>
        <CanvasNoticeBar
          visible
          message="No usable GPU on this PC, so this effect previews here but won't light your devices."
          action={{ label: 'Choose GPU', onClick: () => {} }}
        />
      </div>
    </div>
  );
}

function PreviewStepper() {
  const [v, setV] = useState(12);
  return <StorybookStepper value={v} min={0} max={59} onChange={setV} />;
}

function PreviewRangeBar() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <RangeBar lo={0.2} hi={0.7} gradient="temp" glow />
      <RangeBar lo={0.3} hi={0.9} gradient="accent" />
      <RangeBar lo={0} hi={0.5} height={8} />
    </div>
  );
}

function PreviewBadge() {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <StorybookBadge label="Accent" color="var(--accent)" />
      <StorybookBadge label="Good" color="var(--good, #22c55e)" />
      <StorybookBadge label="Bad" color="var(--bad, #ef4444)" />
      {/* minWidth reserves a fixed pill width so a live numeric readout
          (e.g. the monitoring tab chips) doesn't resize as its digits change. */}
      <StorybookBadge label="9%" minWidth="2.75rem" />
      <StorybookBadge label="100%" minWidth="2.75rem" />
      {/* compact trims the horizontal padding for a badge sized tightly
          around its own reserved minWidth - the monitoring tab chips. */}
      <StorybookBadge label="99%" minWidth="2.5rem" compact />
      <StorybookBadge label="999.9 MB/s" minWidth="4.75rem" compact />
    </div>
  );
}

function PreviewLiveFollowControl() {
  const [following, setFollowing] = useState(true);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
      <LiveFollowControl following={following} detachedLabel="3:45:22 PM" onBackToLive={() => setFollowing(true)} />
      <button type="button" onClick={() => setFollowing(f => !f)}>Toggle</button>
    </div>
  );
}

function PreviewSeriesChart() {
  const s1 = { values: [10, 40, 30, 70, 55, 90, 60], color: 'var(--accent)', area: true };
  const s2 = { values: [50, 20, 60, 40, 80, 30, 75], color: 'var(--warn, #f59e0b)' };
  return <SeriesChart series={[s1, s2]} height={80} gridlines />;
}

function PreviewTextInput() {
  const [v, setV] = useState('');
  return <TextInput value={v} placeholder="Type here..." onInput={setV} ariaLabel="Sample text input" />;
}

const SYNC_CONFLICT_PREVIEW = [
  {
    profileId: 'profile-1',
    name: 'Gaming',
    localUpdatedAt: '2026-06-30T18:04:00.000Z',
    localHostname: 'HYTEY70',
    cloudRevision: 4,
    cloudUpdatedAt: '2026-06-30T20:11:00.000Z',
    cloudName: 'Gaming',
    cloudHostname: 'HYTEY70',
    updatedByInstallId: 'install-abc',
  },
];

function PreviewSyncConflictModal() {
  const [open, setOpen] = useState(true);
  const [conflicts, setConflicts] = useState(SYNC_CONFLICT_PREVIEW);
  if (!open || conflicts.length === 0) {
    return (
      <button type="button" className={styles.previewBtn} onClick={() => { setConflicts(SYNC_CONFLICT_PREVIEW); setOpen(true); }}>
        Reopen
      </button>
    );
  }
  return (
    <SyncConflictModal
      open={open}
      conflicts={conflicts}
      onResolve={(profileId) => { setConflicts(prev => prev.filter(c => c.profileId !== profileId)); }}
      onClose={() => setOpen(false)}
    />
  );
}

function PreviewRing() {
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <StorybookRing value={25} label="25" sublabel="%" />
      <StorybookRing value={60} label="60" sublabel="%" color="var(--accent)" />
      <StorybookRing value={90} label="90" sublabel="%" color="var(--bad, #ef4444)" />
    </div>
  );
}

function PreviewGauge() {
  return <StorybookGauge value={65} min={0} max={100} label="65%" sublabel="CPU" />;
}

/* ── Registry ────────────────────────────────────────────────────────────── */

export const REGISTRY: StorybookEntry[] = [
  // ── Foundation ───────────────────────────────────────────────────────
  {
    name: 'Text styles', category: 'foundation',
    filePath: 'src/styles/_text.scss',
    description: 'The 8 canonical text mixins. Tiered usage: @include text-* when the whole bundle fits; var(--type-*) / var(--weight-*) when only one metric differs; raw literals are drift (flagged by audit:text-styles, capped by the ratchet test). Panel widgets that scale with cell size use em on purpose. Use the matrix to pick the right style x color.',
    Preview: TextStyles,
    fullWidth: true,
  },
  {
    name: 'Surfaces', category: 'foundation',
    filePath: 'src/styles/variables.scss',
    description: 'Canonical spacing, radius, shadow, blur, and opacity tokens. Reach for these instead of raw px/rem or one-off rgba alphas. Five opacity tiers cover ~80% of the literal alphas the codebase used to scatter.',
    Preview: SurfaceStyles,
    fullWidth: true,
  },
  {
    name: 'Brand (NexusMark / NexusWordmark / GithubGlyph)', category: 'foundation',
    filePath: 'src/components/icons/NexusBrand.tsx',
    description: 'The interlocking-N mark and NEXUS wordmark as currentColor SVGs traced from the brand art. size / height props govern rendered dimensions directly (viewBoxes are tight to the visible bbox). Also exports GithubGlyph - the GitHub mark SVG (fills with currentColor) for use wherever a GitHub link appears.',
    Preview: PreviewBrand,
  },
  // ── Inputs ────────────────────────────────────────────────────────────
  {
    name: 'Stepper', category: 'inputs',
    filePath: 'src/components/common/Stepper/Stepper.tsx',
    description: 'Compact vertical chevron stepper: up/down buttons flanking a zero-padded value display. Supports min/max clamping and disabled state. Host-renderer bridge for the SDK Stepper element.',
    Preview: PreviewStepper,
  },
  {
    name: 'TextInput', category: 'inputs',
    filePath: 'src/components/common/TextInput/TextInput.tsx',
    description: 'Single-line text input. Programmatic value sync via ref (preserves cursor). Supports sm/md padding, mono font, alignment, and optional tone color. Host-renderer bridge for the SDK Input element.',
    Preview: PreviewTextInput,
    notes: 'id / name / autoComplete / ariaLabel / invalid are optional pass-through props for form fields that need password-manager hints (autoComplete) or an inline error border (invalid).',
  },
  {
    name: 'Slider (inline)', category: 'inputs',
    filePath: 'src/components/common/Slider/Slider.tsx',
    description: 'Inline label | track | value layout. Default orientation. Every slider now paints the accent fill track + bright (white-on-dark) thumb - there is no un-filled variant. The optional marker prop draws a caret at a secondary value and markerLabel stacks a node (e.g. an info affordance) above it; fillCap dims the fill past a cap value (shown here past 60) to signal a level the device is set above but cannot exceed.', Preview: PreviewSliderInline,
  },
  {
    name: 'Slider (stacked, editable, zero marker)', category: 'inputs',
    filePath: 'src/components/common/Slider/Slider.tsx',
    description: 'Vertical layout with click-to-edit value and an optional tick at zero. Drives every animate-mode shader uniform in the Lighting drawer.', Preview: PreviewSliderStacked,
    notes: 'Click the value to type a precise number. Drag updates live; pointer release fires onCommit.',
  },
  {
    name: 'Slider (formatted)', category: 'inputs',
    filePath: 'src/components/common/Slider/Slider.tsx',
    description: 'Same Slider with a formatValue function for non-integer or unit-suffixed display. Used for response time, percent labels, etc.', Preview: PreviewSliderFormatted,
  },
  {
    name: 'Slider (showRange)', category: 'inputs',
    filePath: 'src/components/common/Slider/Slider.tsx',
    description: 'Stacked slider with min and max printed under the track. Used by any range-bound control where the user needs to see the bounds.', Preview: PreviewSliderRange,
  },
  {
    name: 'RangeSlider (temperature)', category: 'inputs',
    filePath: 'src/components/common/Slider/RangeSlider.tsx',
    description: 'Dual-knob slider. Two thumbs with an accent band painted between them. Used in the cooling fan-curve linear band for temperature.', Preview: PreviewRangeSliderTemp,
    notes: 'minGap defaults to 10% of (max - min). Active knob clamps at the gap; the other knob is not pushed. Track-click-to-snap is disabled in dual-knob mode.',
  },
  {
    name: 'RangeSlider (speed)', category: 'inputs',
    filePath: 'src/components/common/Slider/RangeSlider.tsx',
    description: 'Same RangeSlider primitive with a percent formatter. Used in the cooling fan-curve linear band for speed.', Preview: PreviewRangeSliderSpeed,
  },
  {
    name: 'SearchInput', category: 'inputs',
    filePath: 'src/components/common/SearchInput/SearchInput.tsx',
    description: 'Themed text input with a leading search icon and a clear button when non-empty. Replaces the duplicate inline implementations in SupportedDevicesModal, AppPicker, and the panel add-widget filter.', Preview: PreviewSearchInput,
  },
  {
    name: 'Toggle', category: 'inputs',
    filePath: 'src/components/common/Toggle/Toggle.tsx',
    description: 'Switch-style on/off toggle. 40x22 pill, 16x16 white knob, accent fill on checked. Replaces the duplicate device-modal-toggle global class, panel themeToggle, settings ToggleRow, and panel SettingsRow toggle.', Preview: PreviewToggle,
  },
  {
    name: 'Toggle (off)', category: 'inputs',
    filePath: 'src/components/common/Toggle/Toggle.tsx',
    description: 'Same Toggle primitive in the unchecked state.', Preview: PreviewToggleOff,
  },
  {
    name: 'ChipGroup', category: 'inputs',
    filePath: 'src/components/common/ChipGroup/ChipGroup.tsx',
    description: 'Single-select chip row reusing the cooling curve/mode .chip-action buttons (.chip-active fills the selected one with the accent, labelled in the contrast-paired --accent-text). Single-select renders a radiogroup: one tab stop on the checked chip, arrows move focus without selecting, Space/Enter commits - callers write firmware and device settings on change, so selection must not follow focus. multiSelect keeps aria-pressed toggle buttons. fullWidth stretches the row so it reads as a segmented control; wrap reflows onto further lines for a data-length chip list (the lighting preset app bindings) instead of widening its container.', Preview: PreviewChipGroup,
  },
  {
    name: 'ChipGroup (multi-select)', category: 'inputs',
    filePath: 'src/components/common/ChipGroup/ChipGroup.tsx',
    description: 'Same ChipGroup in multi-select mode (multiSelect: true). Each chip toggles independently via onToggleKey; activeKeys is a ReadonlySet. Used by the hub composition port picker.', Preview: PreviewChipGroupMulti,
  },
  {
    name: 'Select', category: 'inputs',
    filePath: 'src/components/common/Select/Select.tsx',
    description: 'Custom select: a button trigger plus a listbox portaled to <body> and clamped to the viewport, not the native <select> popup, which renders off-screen on the Y70 kiosk WebView. One control across desktop, phone, and Y70. Pass options for flat lists or <option> children (value + text, optional disabled/className/icon); optgroups are unsupported. Each option takes an optional `icon` ReactNode shown before the label in the trigger and the row (the language picker uses it for flags). On a keyboard/pointer desktop (not touch), a list of 8+ entries grows an auto-focused in-menu search field that substring-filters the options while the arrow keys still walk the filtered results. Used by SettingsView, CoolingView FanCard + CurveEditor, LightingView ModeControls, and the panel widget settings rows.', Preview: PreviewSelect,
    notes: 'One size and one box across the app - a surface that needs its own palette (deck inspector, monitoring settings, cooling fan / curve rows) sets --select-bg / --select-border / --select-border-hover / --select-text on the wrapper rather than framing the trigger a second time. triggerIconOnly collapses the trigger to just the selected option icon (no label or chevron; the label moves to the trigger title) for compact icon controls like a header language flag - the open menu keeps the full icon + label rows. Long lists (8+) get an in-menu search on keyboard/pointer devices; the preview here is below that threshold.',
  },
  {
    name: 'ui-select (SDK dropdown)', category: 'inputs',
    filePath: 'src/sandbox/ui/richComponents.tsx',
    description: 'SDK host-renderer bridge for the ui-select element. Wraps the native Select; the worker passes value (string), options ({value,label}[]), placeholder, and disabled; the host fires change with the chosen value string.',
    Preview: PreviewSdkSelect,
  },
  {
    name: 'ui-chipgroup (SDK chip row)', category: 'inputs',
    filePath: 'src/sandbox/ui/richComponents.tsx',
    description: 'SDK host-renderer bridge for the ui-chipgroup element. Wraps the native ChipGroup (single-select); the worker passes value (the active key string), options ({key,label}[]), and disabled; the host fires change with the chosen key string.',
    Preview: PreviewSdkChipGroup,
  },
  {
    name: 'IconLabelButton', category: 'inputs',
    filePath: 'src/components/common/IconLabelButton/IconLabelButton.tsx',
    description: 'Compact icon-over-label button with an active state and touch-up press handling. Used by panel widget size and monitoring design selectors.', Preview: PreviewIconLabelButton,
  },
  {
    name: 'Button', category: 'inputs',
    filePath: 'src/components/common/Button/Button.tsx',
    description: 'Canonical button. Replaces every ad-hoc button SCSS class across views. Three sizes (sm/md/lg) x five tones (neutral/accent/danger/danger-solid/ghost), optional pill shape, an optional leading icon (there is no trailing slot), optional loading + disabled states. Icon-only buttons render square automatically when no children are passed.',
    Preview: PreviewButtonMatrix,
    fullWidth: true,
    notes: 'Reach for size="md" tone="neutral" for tertiary actions. tone="accent" for primary CTAs. tone="danger" for destructive. tone="danger-solid" for a destructive modal confirm, where the outline reads too quietly. tone="ghost" when bordered chrome would compete with adjacent UI. accent and danger-solid carry a raised bottom edge, which is what separates a primary action from a selected chip on the same fill.',
  },
  {
    name: 'EndTaskButton', category: 'inputs',
    filePath: 'src/components/common/EndTaskButton/EndTaskButton.tsx',
    description: 'Danger Button wired to kill a detected conflicting app by catalog id (POST /conflicts/kill). Keeps its spinner up after a successful kill until the watcher clears the row and it unmounts; resets on failure, and when the app comes back under a new pid - an Automatic service the SCM restarts keeps the row and its React key, so without that the spinner would never clear. `busy` spins it while another control runs the same kill; `onKilled` + `terminated` hand the ended state to a surface that keeps the row listed, where it renders a green Terminated marker. Used by ConflictAppCard, so by ConflictWarningModal, ConflictOnboardingScreen and the device-page NexusControlOff gate.',
    Preview: PreviewEndTaskButton,
  },
  {
    name: 'SkipOnboardingButton', category: 'inputs',
    filePath: 'src/components/common/SkipOnboardingButton/SkipOnboardingButton.tsx',
    description: 'Low-emphasis escape hatch pinned to the top-right of every onboarding screen after the welcome step, where there is finally something to skip. Absolutely positioned, so its host needs position: relative.',
    Preview: PreviewSkipOnboardingButton,
  },

  {
    name: 'SettingRow / SettingToggle / SettingSelect / SettingSlider', category: 'inputs',
    filePath: 'src/components/common/SettingRow/SettingRow.tsx',
    description: 'Canonical settings row: label (+ optional description / icon) left, control right. wrapControl lets a control too wide for the space beside the label (a swatch grid) shrink and wrap there instead of squeezing the label; stackOnNarrow drops the control under the description below 480px. The one settings row for the whole app (Settings pages, lighting/keeb pages, panel editor sheet, device Settings tab); the panel SettingsRow re-exports it. SettingToggle, SettingSelect, and SettingSlider (a right-aligned inline slider bar) bundle the matching control. iconLeading renders the icon as a leading column instead of inline before the label, in one of two tiers: true is the prominent tier used by first-run and import screens, "subtle" the dense tier for settings lists. The row owns both size and colour, so pass a bare glyph with no size prop.',
    Preview: PreviewSettingRow,
    notes: 'Token fallbacks (--panel-* → app globals) keep it correct inside .panel-root and on the dashboard. No per-row divider - rules belong to SectionHeader.',
  },

  // ── Editable text ─────────────────────────────────────────────────────
  {
    name: 'EditableText', category: 'editable',
    filePath: 'src/components/common/Editable/EditableText.tsx',
    description: 'Click-to-edit string. Enter commits, Escape reverts, blur commits. 20 char default cap. Used by fan/curve rename and profile rename.', Preview: PreviewEditableText,
  },
  {
    name: 'EditableNumber', category: 'editable',
    filePath: 'src/components/common/Editable/EditableNumber.tsx',
    description: 'Click-to-edit number, clamped to [min, max] and snapped to step. Composed inside Slider when `editable` is set; standalone for any tabular numeric edit.', Preview: PreviewEditableNumber,
  },
  {
    name: 'DatePicker', category: 'inputs',
    filePath: 'src/components/common/DatePicker/DatePicker.tsx',
    description: 'Themed date input - trigger + month-grid popup. Replaces native `<input type="date">` whose popup ignored app chrome. Used in Screen Time browse (day nav, custom-range clear). Respects min / max bounds.', Preview: PreviewDatePicker,
    notes: 'Click outside or Escape closes. "Today" button jumps to today if within bounds. Disabled cells are past / future out of range.',
  },
  {
    name: 'InfoTooltip', category: 'status',
    filePath: 'src/components/common/InfoTooltip/InfoTooltip.tsx',
    description: 'Subtle info affordance rendered next to section titles. Hover (pointer) or click (touch) reveals a one-sentence explanation in an elevated-surface tooltip matching the app chrome. Used by ViewHeader (via titleTooltip prop) and inline next to Cooling section h3s.', Preview: PreviewInfoTooltip,
    notes: 'Hover, or Tab into the icon, or click to toggle. Esc closes. Auto-positions via the `side` prop (top/bottom/left/right).',
  },
  {
    name: 'HoverTooltip', category: 'status',
    filePath: 'src/components/common/HoverTooltip/HoverTooltip.tsx',
    description: 'Instant hover tooltip that wraps any trigger element. Optional bold title line above a muted body line, portal\'d to document.body so curve-card overflow / scroll containers can\'t clip it. Companion to InfoTooltip - use this when the trigger is the surrounding content (chip button, icon-only control) rather than an (i) icon. Used by the cooling curve-type chips so each chip surfaces its description on hover with zero open delay.', Preview: PreviewHoverTooltip,
    notes: 'Opens on pointerenter and keyboard focus, closes on leave / blur. Tooltip itself is pointer-events: none so the trigger keeps ownership of the cursor. Pass `title` for the bold first line plus `body` for the description, or just `body` for a single-line variant. `body` accepts any ReactNode, so a multi-line list (e.g. session lines separated by <br />) works too - used by the monitoring privacy-access indicators.',
  },
  {
    name: 'DeviceWarningIcon', category: 'status',
    filePath: 'src/components/common/DeviceWarningIcon/DeviceWarningIcon.tsx',
    description: 'Right-aligned warning glyph for a device row/card, shown whenever the service reports a device-level issue via DeviceListItem.warning. Code-driven - the warning code maps to a localized tooltip, so any handler can flag a problem without new UI per device family. Used by the sidebar DEVICES section and the Devices-page card grid.',
    Preview: PreviewDeviceWarningIcon,
    notes: 'Renders the raw code as a fallback tooltip if it has no mapped i18n key, so an unmapped code fails visibly instead of silently.',
  },
  {
    name: 'DeviceGroupIcon', category: 'status',
    filePath: 'src/components/common/DeviceGroupIcon/DeviceGroupIcon.tsx',
    description: 'The glyph before a hardware group\'s name on the lighting and cooling rails: curated device art for a known device-id prefix (NP50, SmartHub, Lian Li, Corsair, keeb, Q-series, Kraken, CNVS), a generic board / GPU / RAM / fan / bulb mark for an OpenRGB or smart-light iconType, else the generic device. User-made groups carry no icon.',
    Preview: PreviewDeviceGroupIcon,
    notes: 'Curated art is the same /assets/devices/*.svg the Devices page shows, drawn as a currentColor mask so it matches the lucide glyphs beside it. Sized to the compact CollapsibleSection chevron.',
  },
  {
    name: 'NexusControlOffIcon', category: 'status',
    filePath: 'src/components/common/NexusControlOffIcon/NexusControlOffIcon.tsx',
    description: 'Right-aligned glyph on a sidebar device row when Nexus Control is off for that device (supportsNexusControl true, nexusControlEnabled false). A bare non-focusable icon, same pattern as DeviceWarningIcon.',
    Preview: PreviewNexusControlOffIcon,
  },
  {
    name: 'NexusControlCard', category: 'cards',
    filePath: 'src/components/common/NexusControlCard/NexusControlCard.tsx',
    description: 'Label + toggle in a card: the "Nexus Control" on/off switch. Used by DevicePage\'s NexusControlOff full-page gate, shown for both a curated device and a promoted monitor with Nexus Control off - the row-level toggle for both lives on the Devices-page device row instead.',
    Preview: PreviewNexusControlCard,
  },
  {
    name: 'HeartBurst', category: 'status',
    filePath: 'src/components/common/HeartBurst/HeartBurst.tsx',
    description: 'Burst of small red hearts rising and drifting apart, then unmounting - fired from the telemetry consent toggle on an off-to-on flip. Pure CSS transform/opacity keyframes, each heart self-removes on its own animationend. useHeartBurstTrigger derives the required burstKey from a boolean so the burst never fires on mount.', Preview: PreviewHeartBurst,
    notes: 'Respects prefers-reduced-motion (renders nothing). Caller wraps the anchor in a position:relative container - HeartBurst anchors to its top-right corner. Hearts render in a document.body portal on the --z-particles layer, so they are never clipped by a scrolling ancestor or covered by other stacking contexts.',
  },
  {
    name: 'Popover', category: 'modals',
    filePath: 'src/components/common/Popover/Popover.tsx',
    description: 'Inline-anchored floating panel. Consumer wraps trigger + Popover in a position:relative container and passes the wrapper as anchorRef; Popover handles click-outside dismiss, Escape, and corner-anchored placement (bottom-start, bottom-end, right-start, right-end, top-start, left-start). Used by the sidebar Status Shield (Connected / Limited mode) popover.',
    Preview: PreviewPopover,
    notes: 'Renders nothing when `open` is false. Place inside a positioned wrapper so the popover is positioned relative to it. Pass `placement` to control which corner sits next to the anchor.',
  },
  {
    name: 'CardDeleteButton', category: 'inputs',
    filePath: 'src/components/common/CardDeleteButton/CardDeleteButton.tsx',
    description: 'Shared circular X overlay for "delete this card" actions. Hover-reveal by default via a data-attribute the parent container opts into (`:hover [data-card-delete="hover"] { opacity: 1 }`). Used by lighting effect cards and media library thumbnails. Cooling curve cards now use a bottom-anchored "Remove curve" affordance instead so the top-right slot can hold the live output % chip + wire nub.', Preview: PreviewCardDeleteButton,
    notes: 'Hover the item row to reveal the X. Keyboard focus also reveals it. Set revealOnHover={false} for always-visible variants.',
  },
  {
    name: 'HsvPicker', category: 'editable',
    filePath: 'src/components/common/HsvPicker/HsvPicker.tsx',
    description: 'SV square + hue slider + hex input. Live preview during drag, commit on release. Used for the accent color picker; reusable for any color control.', Preview: PreviewHsvPicker,
  },
  {
    name: 'ColorPickerWithPresets', category: 'editable',
    filePath: 'src/components/common/ColorPickerWithPresets/ColorPickerWithPresets.tsx',
    description: 'Fixed 10-column swatch grid for theming surfaces (app accent, panel accent, panel background). Click commits immediately; allowCustom adds a trailing slot that commits the colour it shows and opens an HsvPicker popover for any off-palette colour.', Preview: PreviewColorPickerWithPresets,
    notes: 'Pass a 20-entry preset list to render two rows. Row 2 should be a vertically paired darker / more saturated sibling of row 1 by hue family; the selected swatch gets a text-colour ring (not accent - on a grid of colours an accent ring vanishes on the swatch that IS the accent). Swatches stretch to 1/10 of the container width and cap at ~36px on desktop, so the grid fills phone-sheet widths edge-to-edge. With allowCustom the grid gains a column for the full-height custom slot, which opens an HsvPicker popover. The slot shows the current value whenever that value is off-palette (so it tracks a drag preview); pass customColor + onCustomCommit and it keeps showing the saved pick after a preset is selected, and clicking it re-applies that pick as it opens.',
  },
  {
    name: 'PaletteRing', category: 'editable',
    filePath: 'src/components/common/PaletteRing/PaletteRing.tsx',
    description: 'Radial hue + palette-width picker. Drag the arc body to rotate (hue), drag a handle to resize (colorize). A triangle indicator on the inner edge marks the centre of the selection; at mono (single circle) it points opposite the circle to indicate the effective colour. Handle and triangle fill use var(--text) so they flip dark in light theme. Used as the hero control in the Lighting animate drawer.', Preview: PreviewPaletteRing,
    notes: 'Colorize caps at 0.75 so even the tightest arc still shows a touch of palette variation.',
  },
  {
    name: 'EffectTemplateSelector', category: 'inputs',
    filePath: 'src/components/common/EffectTemplateSelector/EffectTemplateSelector.tsx',
    description: 'Shared row of four preset buttons, each showing the real generated thumbnail for that universal slot, across desktop lighting, panel quick lighting, and the panel theme background sheet.', Preview: PreviewEffectTemplateSelector,
    notes: 'Styling is driven by --effect-template-* custom properties so app and panel surfaces share markup without sharing chrome tokens.',
  },
  {
    name: 'EffectControls', category: 'inputs',
    filePath: 'src/panel/widgets/lighting/page/EffectControls.tsx',
    description: 'Animate effect editor shared by the Lighting right-pane Effect tab and fullscreen drawer. Combines EffectTemplateSelector, PaletteRing, shader sliders, and reset behavior for a selected effect.', Preview: PreviewEffectControls,
    notes: 'View-level component intentionally cataloged because it has two live mount points and is the canonical animate preset/editor composition.',
  },

  // ── Cards / surfaces ──────────────────────────────────────────────────
  {
    name: 'Card', category: 'cards',
    filePath: 'src/components/common/Card/Card.tsx',
    description: 'Canonical card surface (background, border, radius, padding) with optional icon / title / subtitle / actions header. Compose for any panel. `icon` renders a leading glyph before the title; `interactive` adds a hover state; `compact` tightens padding for dense layouts (tile grids); `fillHeight` fills the parent height and scrolls the body on its own instead of content-sizing (an inline detail sidebar); `selected` is the rail selected-item treatment (accent border + accent-soft fill, the lighting / cooling device cards); `role`/`ariaLabel` name the root as a landmark.', Preview: PreviewCard,
  },
  {
    name: 'SensorCard', category: 'cards',
    filePath: 'src/components/common/SensorCard/SensorCard.tsx',
    description: 'Sensor display: title + optional subtitle + name/value rows. Composes Card for the chrome.', Preview: PreviewSensorCard,
  },
  {
    name: 'InfoList / InfoRow', category: 'cards',
    filePath: 'src/components/common/InfoList/InfoList.tsx',
    description: 'Bounded widget of label/value rows. Use for compact device meta, status keys, or any vertical key/value listing. Tones: accent / good / warn / bad / dim.', Preview: PreviewInfoList,
  },
  {
    name: 'StatTile', category: 'cards',
    filePath: 'src/components/common/StatTile/StatTile.tsx',
    description: 'A boxed value + label pair for a stat-tile row or grid - the Steam per-game drilldown and the Frames game detail both render their avg/1% low/99th/sessions/hours stats through this.', Preview: PreviewStatTile,
  },
  {
    name: 'SystemSpecsPanel', category: 'cards',
    filePath: 'src/components/common/SystemSpecsPanel/SystemSpecsPanel.tsx',
    description: 'The one component every system-specs surface renders through: Devices > System Specs, Benchmark\'s pre-run summary and per-run results tile, the Diagnostics Summary tab, and the monitoring process-detail usage tiles. `variant="list"` is a copyable label:value sheet; `variant="tiles"` renders bare icon+value Card tiles with no owning grid, so a caller can drop a single tile into its own grid or lay out a whole grid of them. `iconInline` (tiles only) pairs the icon and label on one row instead of stacking icon/label/value each on their own line.',
    Preview: PreviewSystemSpecsPanel,
    notes: 'Rows are pre-translated by the caller - the component owns no i18n keys. loading blanks every list-variant value instead of showing a "-" placeholder, for a stable row count while the first fetch is in flight. copyLabel/copiedLabel are omitted together to hide the copy toolbar (Benchmark\'s tiles never show one).',
  },
  {
    name: 'PairedPcsContent', category: 'cards',
    filePath: 'src/components/common/PairedPcs/PairedPcsContent.tsx',
    description: 'The phone panel\'s remembered-PCs list (swipe-up tray, phone surface only): Card + CardDeleteButton rows for every PC this phone has claimed, independent of current LAN reachability. Connect applies the record\'s token and navigates into /panel/phone; a needsRepair record offers a re-pair link instead.',
    Preview: PreviewPairedPcsContent,
  },
  {
    name: 'EffectCard', category: 'cards',
    filePath: 'src/components/common/EffectCard/EffectCard.tsx',
    description: 'The one shared thumbnail card: lighting shader browser, panel Theme animation picker, media library, and the lighting widget tile all use it. overlay=true gives a full-bleed thumbnail with the label stroked over the lower third (both shader pickers); default layout is thumbnail-above-caption with optional meta line + hover-reveal delete X (media library).', Preview: PreviewEffectCard,
    notes: 'Pass overlay for the full-bleed label-on-thumbnail shader-picker layout. Pass asDiv when the card contains a nested button (CardDeleteButton) - nested buttons are invalid HTML. Pass nonInteractive for a display-only card (plain div, no hover ring / cursor) - the lighting widget tile. thumbUrl=null renders a shimmer skeleton.',
  },
  {
    name: 'AdvancedModeCta', category: 'cards',
    filePath: 'src/components/common/AdvancedModeCta/AdvancedModeCta.tsx',
    description: 'Wide card-button at the bottom of the simple-mode lighting/cooling pages: "Advanced mode" eyebrow over a page-specific line describing what the full page adds, with a chevron affordance. Pressing it flips that page\'s ui.*DashboardMode field to advanced (the page passes the flip as onPress).',
    Preview: PreviewAdvancedModeCta,
  },
  {
    name: 'ModeMenu', category: 'cards',
    filePath: 'src/components/common/ModeMenu/ModeMenu.tsx',
    description: 'The lighting / cooling page-mode menu, dropped from the first mode tab: large rows carrying a glyph, a title and one line saying what the choice does. Off is always offered; the second row is whichever of simple / advanced the page is not in, and picking it flips that page\'s ui.*DashboardMode field. usePageModeMenu (same folder) builds the entries plus the tab\'s own glyph + caret label.',
    Preview: PreviewModeMenu,
  },
  {
    name: 'SimpleModeNotice', category: 'cards',
    filePath: 'src/components/common/SimpleModeNotice/SimpleModeNotice.tsx',
    description: 'Accent-tinted line on the simple-mode lighting/cooling pages, shown when the active configuration has no tile on the page (a custom cooling preset, a lighting effect or mixed per-device colours) - without it the page reads as though nothing is running. The page owns the wording and the condition.',
    Preview: PreviewSimpleModeNotice,
  },
  {
    name: 'DeviceCountSummary', category: 'cards',
    filePath: 'src/components/common/DeviceCountSummary/DeviceCountSummary.tsx',
    description: 'One-line "what am I driving" summary at the top of the simple-mode lighting/cooling pages: how many of the devices the service found Nexus actually controls, plus an optional trailing action (the one-click "control all"). The line arrives translated - the page owns the plural key and the noun (devices on lighting, fans on cooling).',
    Preview: PreviewDeviceCountSummary,
  },
  {
    name: 'DeviceCanvas', category: 'cards',
    filePath: 'src/components/common/DeviceCanvas/DeviceCanvas.tsx',
    description: 'Free-arrange device canvas for the Lighting view: drag-position device tiles, marquee multi-select, per-device LED preview driven by the live shader effect, right-click DeviceContextMenu. Device names render in a layer above every frame, de-collided vertically so they never overlap; clicking a name selects (and drags) that device whatever the frame stacking.',
    notes: 'No live preview - needs live device geometry, LED maps, and shader state.',
  },
  {
    name: 'ConflictAppCard', category: 'cards',
    filePath: 'src/components/common/ConflictAppCard/ConflictAppCard.tsx',
    description: 'Detected-conflict row: app name, executable / PID meta line, and an EndTaskButton. With `devices` (from useConflictDevices) it also lists the hardware Nexus recognizes that the app drives too, each tagged with who drives it now, under an all-or-none "Nexus controls these / <app> controls these" switch; choosing Nexus flips every device on and then ends the app, spinning the End task button while it runs. `terminated` keeps the row of an ended app listed with its devices, swapping the button for a green Terminated marker and dropping the switch. With `autostart` (from useConflictAutostart) a "Disable auto start" button sits under End task, over a line naming each Windows startup entry or service it will turn off - only for the apps the service holds a hand-verified recipe for, and only while one is still armed; ending the task does not stop the next boot, so a terminated row keeps it. A partial or failed disable leaves the button up under a warning. Used by ConflictWarningModal and ConflictOnboardingScreen (with devices) and the device-page NexusControlOff gate (plain row).',
    Preview: PreviewConflictAppCard,
  },

  // ── Modals ────────────────────────────────────────────────────────────
  {
    name: 'Overlay', category: 'modals',
    filePath: 'src/components/common/Overlay/Overlay.tsx',
    description: 'Canonical modal/sheet base. Owns the backdrop, escape-to-close, and click-outside dismiss; the consumer brings the surface chrome via className. Variants: dialog (centred), alert (alertdialog role + Enter-to-confirm), sheet (transparent backdrop for slide drawers).', Preview: PreviewOverlay,
    notes: 'DeviceModal, ConfirmModal, and SupportedDevicesModal compose Overlay - reach for those existing wrappers before using Overlay directly. Internally registers with useModalA11y (src/components/common/Overlay/useModalA11y.ts): traps Tab within the surface, locks background scroll, restores focus to the trigger on close, and joins a shared open-stack so Escape/Enter only reach the topmost of several stacked modals.',
  },
  {
    name: 'DeviceModal', category: 'modals',
    filePath: 'src/components/common/DeviceModal/DeviceModal.tsx',
    description: 'Reusable modal shell built on Overlay. Title + close button + standard escape/click-outside dismiss. medium / wide / fullscreen variants.', Preview: PreviewDeviceModal,
  },
  {
    name: 'Slideout', category: 'modals',
    filePath: 'src/components/common/Slideout/Slideout.tsx',
    description: 'Edge-anchored slide-in panel built on Overlay\'s sheet variant, matching the panel editor\'s desktop add-widget drawer look (translucent scrim, backdrop-base surface, border on the docked edge, slide-in animation). `side` docks it right (default) or left; width and inner padding are set through the --slideout-* custom properties. Title + optional icon + optional headerRight + close button. Esc and a backdrop click both dismiss.', Preview: PreviewSlideout,
    notes: 'Use for a dashboard detail/inspector drawer outside the panel editor (e.g. the monitoring process-detail slideout) - PanelEditorSheet stays the widget-grid editor\'s own component.',
  },
  {
    name: 'ConfirmModal', category: 'modals',
    filePath: 'src/components/common/ConfirmModal/ConfirmModal.tsx',
    description: 'Native-in-app confirmation modal with title + body + optional note + confirm/cancel actions. Esc cancels, Enter confirms, click-outside cancels. Cancel autofocused so destructive intent must be explicit. Used instead of window.confirm so the dialog matches app chrome.', Preview: PreviewConfirmModal,
    notes: 'destructive defaults to true (red confirm button). Pass destructive={false} for non-destructive confirmations like "save changes?". Optional children render after the note, before the actions row - e.g. a current-password field for delete-account. confirmDisabled disables the confirm button and suppresses Enter-to-confirm while an async action is in flight.',
  },
  {
    name: 'KlipyPicker', category: 'modals',
    filePath: 'src/components/common/KlipyPicker/KlipyPicker.tsx',
    description: 'Search-and-pick modal over the Klipy GIF catalog: trending on open, debounced search, infinite scroll, one tap hands the pick to the caller. Thumbnails and search go through the service (a panel has no route to Klipy), and the required KLIPY attribution sits in the footer.',
    notes: 'busySlug marks the card that is importing and locks the grid. Pass thumbAspect so the cards preview the crop the consuming surface will make (16:9 for the lighting canvas, the panel aspect for backgrounds). A refused import is shown through importError while the picker stays open.',
    Preview: PreviewKlipyPicker,
  },
  {
    name: 'PromptModal', category: 'modals',
    filePath: 'src/components/common/PromptModal/PromptModal.tsx',
    description: 'Native-in-app text-input modal. Replaces window.prompt with a themed dialog so the input experience is consistent across macOS / Linux / Windows (WKWebView, Edge kiosk, browsers all suppress or restyle native prompts). Autofocuses the input, Enter submits, Esc cancels, click-outside cancels. Supports a sync validator that displays its error inline and disables the submit button.', Preview: PreviewPromptModal,
    notes: 'Use the validate callback for live duplicate-name checks. The submit button is disabled while the value is empty or invalid, so the caller does not need to defensively re-validate.',
  },
  {
    name: 'SupportedDevicesModal', category: 'modals',
    filePath: 'src/components/common/SupportedDevicesModal/SupportedDevicesModal.tsx',
    description: 'Fullscreen device catalogue browser with search + pagination + highlight of currently-detected VID/PIDs. Used by the Devices view to surface the full supported-hardware list (peripherals + lighting merged). Composes SupportedDevicesList for the rows.', Preview: PreviewSupportedDevicesModal,
    notes: 'source="peripherals" | "lighting" selects which catalogue to load. Pass detectedVidPids to mark already-connected devices.',
  },
  {
    name: 'SupportedDevicesList', category: 'cards',
    filePath: 'src/components/common/SupportedDevicesList/SupportedDevicesList.tsx',
    description: 'Presentational device-catalog table: source badge, brand, model, type, VID:PID, capabilities. Odd rows carry a subtle greyscale wash instead of row-separator lines. No fetch, no provider hooks - the caller supplies the rows, so this also mounts cleanly outside the app tree (SupportedDevicesModal in-app; the marketing site elsewhere) and renders via react-dom/server for SEO.', Preview: PreviewSupportedDevicesList,
    notes: 'Zebra and hover backgrounds ride --devices-row-alt / --devices-row-hover custom properties with dark-friendly defaults, so a host page can override either without touching the component. detectedVidPids is optional - omit it entirely when the host has no notion of "connected".',
  },
  {
    name: 'AboutModal', category: 'modals',
    filePath: 'src/components/common/AboutModal/AboutModal.tsx',
    description: 'Lightweight "About Nexus" dialog opened from the top-bar "..." menu. Brand mark + wordmark, build version, link to hellonexus.com. Composes Overlay (alert variant, Enter/Esc close).',
    Preview: PreviewAboutModal,
  },
  {
    name: 'WelcomeScreen', category: 'modals',
    filePath: 'src/components/common/WelcomeScreen/WelcomeScreen.tsx',
    description: 'Non-dismissable first-run gate mounted on the desktop Dashboard: brand mark + heading, a start-with-OS toggle (platform-aware label) and an anonymous-telemetry toggle, and an Enter button that writes both plus /onboarding/complete before dismissing.',
    notes: 'No live preview - the Enter button posts real /telemetry/consent, /start, and /onboarding/complete requests to the connected service, so opening it here would mutate the running install\'s actual first-run state.',
  },
  {
    name: 'FeaturesOnboardingScreen', category: 'modals',
    filePath: 'src/components/common/FeaturesOnboardingScreen/FeaturesOnboardingScreen.tsx',
    description: 'Non-dismissable onboarding gate, queued right after WelcomeScreen: a 2x2 grid of feature-pillar cards (Lighting, Cooling, Monitoring, Diagnostics), all on by default, and a Continue button that patches only the pillars switched off before writing /onboarding/features-complete.',
    notes: 'No live preview - Continue posts real /preferences and /onboarding/features-complete requests (and /onboarding/lighting-complete when Lighting is switched off), so opening it here would mutate the running install\'s feature switches.',
  },
  {
    name: 'Nexus2ImportSection', category: 'modals',
    filePath: 'src/components/common/Nexus2WelcomeScreen/Nexus2ImportSection.tsx',
    description: 'Grouped Nexus 2 import flow: previews on open, two consolidated checkboxes (Y70 panel personalization, Q-Series panel personalization) each expanding to their wire categories, apply (always replacing the current personalization), and per-group results in an internally scrolling box. Hosted by ImportCenter, which the onboarding gate and the Settings entry both open.',
    notes: 'No live preview - it posts real /migration/nexus2/preview and /apply requests on open/submit, so opening it here would mutate the running install\'s panel layouts.',
  },
  {
    name: 'ImportOnboardingScreen', category: 'modals',
    filePath: 'src/components/common/ImportOnboarding/ImportOnboardingScreen.tsx',
    description: 'The one onboarding gate for bringing a previous setup over. Hosts ImportCenter with every app found on this PC (Nexus 2 first, then FanControl). It never closes an app or touches its autostart - ConflictOnboardingScreen does that, per app, on an explicit click.',
    notes: 'No live preview - continuing posts real apply and dismiss requests for every detected app, so opening it here would overwrite the running install\'s configuration.',
  },
  {
    name: 'ConflictAllClear', category: 'status',
    filePath: 'src/components/common/ConflictAllClear/ConflictAllClear.tsx',
    description: 'All-clear row for the conflict surfaces: dashed box, green check, "nothing is competing with Nexus". Shared so ConflictWarningModal and ConflictOnboardingScreen state it identically.',
    Preview: () => <ConflictAllClear />,
  },
  {
    name: 'FeatureDisabled', category: 'status',
    filePath: 'src/components/common/FeatureDisabled/FeatureDisabled.tsx',
    description: 'Full-page disabled shell for a feature pillar (Lighting/Cooling/Monitoring/Diagnostics) switched off in Settings, matching DevicePage\'s NexusControlOff layout: title, hint, and a re-enable NexusControlCard. FeatureGate mounts this instead of the page\'s real content while the pillar is off, so the page\'s data hooks never run.',
    Preview: PreviewFeatureDisabled,
    notes: 'The re-enable toggle writes through useUiSettingsUpdateSafe, which no-ops outside a UiSettingsProvider - safe to click here.',
  },
  {
    name: 'ConflictOnboardingScreen', category: 'modals',
    filePath: 'src/components/common/ConflictOnboardingScreen/ConflictOnboardingScreen.tsx',
    description: 'The last onboarding gate: apps already driving the lighting, fans or peripherals Nexus is taking over. A full screen like the gates before it, not the sidebar badge\'s ConflictWarningModal. Lists one ConflictAppCard per detected app, each with End task. Continuing ends nothing; the action is per-app and explicit.',
    notes: 'No live preview - the cards post real /conflicts/kill requests, so a click here would end a running app.',
  },
  {
    name: 'FanControlImportSection', category: 'modals',
    filePath: 'src/components/common/FanControlImport/FanControlImportSection.tsx',
    description: 'FanControl import flow: picks one of that app\'s saved configurations, previews what maps onto this PC (curves with their target mode, fans with how each was matched, and what is being left behind), and applies the selected categories - curves, calibration, fan names, offsets, fixed speeds. Hosted by ImportCenter, which the onboarding gate, the cooling page\'s preset dropdown and the Settings entry all open.',
    notes: 'No live preview - it posts real /migration/fancontrol/preview and /apply requests, so opening it here would overwrite the running install\'s fan curves.',
  },
  {
    name: 'ImportCenter', category: 'modals',
    filePath: 'src/components/common/ImportCenter/ImportCenter.tsx',
    description: 'The one import surface: every app a setup can come from listed on the left, each with a switch deciding whether it is included, and the highlighted app\'s own flow on the right. An app that is not installed still gets a row, greyed, with the reason. Hosted by ImportDialog (the cooling page\'s preset dropdown and the Settings entry) and by both onboarding gates, which drive the import from their own footer.',
    notes: 'No live preview - each source posts real preview/apply requests, so opening it here would overwrite the running install\'s fan curves and panel layouts.',
  },
  {
    name: 'ImportDialog', category: 'modals',
    filePath: 'src/components/common/ImportCenter/ImportDialog.tsx',
    description: 'Modal host for ImportCenter, used by the on-demand entry points: the cooling page\'s preset dropdown (FanControl) and the Privacy & Data tab\'s Nexus 2 row. The modal body is the single scroller, so a tall preview scrolls as one page.',
    notes: 'No live preview - hosts ImportCenter, which posts real preview/apply requests.',
  },
  {
    name: 'LightingOnboardingScreen', category: 'modals',
    filePath: 'src/components/common/LightingOnboardingScreen/LightingOnboardingScreen.tsx',
    description: 'Non-dismissable second onboarding gate, queued behind WelcomeScreen: a grid of the lighting page\'s ZoneCards in whole-card toggle mode (controlled/ignored, all controlled by default), a conflicting-apps warning when any are detected, and a Continue button that writes /onboarding/lighting-complete before dismissing.',
    notes: 'No live preview - device toggles post real /devices/lighting-devices/controlled writes and Continue posts /onboarding/lighting-complete, so opening it here would mutate the running install\'s lighting state.',
  },
  {
    name: 'UpdateBadge', category: 'status',
    filePath: 'src/components/common/UpdateBadge/UpdateBadge.tsx',
    description: 'Top-bar green status button shown when a software update is available. Renders a TopBarStatusButton whose tooltip + action follow the update mode: notify opens the UpdateModal (release notes), staged installs immediately. On platforms with no staging/install flow (canAutoInstall=false), always opens the release asset URL in a new tab instead.',
    Preview: PreviewUpdateBadge,
  },
  {
    name: 'TopBarStatusButton', category: 'status',
    filePath: 'src/components/common/TopBarStatusButton/TopBarStatusButton.tsx',
    description: 'Tinted icon-only alert button for the top bar\'s right cluster. Shares the bar\'s 32px icon-button footprint but stays coloured in its tone (warn = amber conflicts, good = green updates) to flag an active state; hover washes the same tone and the label shows as a bottom tooltip. Used by ConflictWarningBadge and UpdateBadge.',
    Preview: PreviewTopBarStatusButton,
  },
  {
    name: 'UpdateModal', category: 'modals',
    filePath: 'src/components/common/UpdateModal/UpdateModal.tsx',
    description: 'OTA update dialog. Shows release notes with an "Update now" / "Later" choice in the notes view; switches to a progress bar while downloading/verifying; shows a spinner while the installer relaunches the service. On platforms with no staging/install flow (canAutoInstall=false) the primary action instead opens the release asset URL in a new tab.',
    Preview: PreviewUpdateModal,
  },
  {
    name: 'MediaCropper', category: 'modals',
    filePath: 'src/components/common/MediaCropper/MediaCropper.tsx',
    description: 'Aspect-locked image cropper modal. Drag to pan, corner handles to resize. Emits NormalizedCrop { x, y, w, h } in 0..1 of the source image. Used when importing lighting media, selecting a background media item for a panel device, and cropping the account avatar (aspect={1}).',
    Preview: PreviewMediaCropper,
  },
  {
    name: 'SyncConflictModal', category: 'modals',
    filePath: 'src/components/common/SyncConflictModal/SyncConflictModal.tsx',
    description: 'Steam-cloud-style keep-local/take-cloud prompt for profile sync conflicts. Lists each conflicting profile with a this-machine-vs-cloud comparison (name + updated time) and Keep local / Use cloud actions. Auto-shown by SyncConflictGate at the app layout root; also opened manually from the Account page\'s sync section.',
    Preview: PreviewSyncConflictModal,
  },

  // ── Charts ────────────────────────────────────────────────────────────
  {
    name: 'Sparkline', category: 'charts',
    filePath: 'src/components/common/Sparkline/Sparkline.tsx',
    description: 'Tiny SVG sparkline. Auto-scales or accepts a fixed domain. Flat alpha fill (color, fillOpacity) plus optional separate strokeColor / strokeWidth. Pass sampleCount to lock a window length and left-pad shorter buffers. fillOnly drops the stroke line for a seek-bar-style silhouette (right example above), bumping the default fillOpacity to match its weight. Used by Monitoring CPU/GPU/Network and panel widgets (SparklineGauge, LineGauge, CoolingWidget); fillOnly is used by the Monitoring process-list row minigraphs.', Preview: PreviewSparkline,
  },
  {
    name: 'ChartHoverTooltip', category: 'charts',
    filePath: 'src/components/common/ChartHoverTooltip/ChartHoverTooltip.tsx',
    description: 'The hover value box shared by chart surfaces: an absolutely-positioned card with an optional bordered header row plus dot/name/value series rows. TimeSeriesChart renders its timestamp + per-series avg/max rows in it; the cooling curve editor shows a hovered or dragged handle\'s exact temperature and duty. Placement is the caller\'s job - pair the ref with useChartHoverTooltip inside a position:relative wrapper: anchor \'top\' pins it to the top of the chart while following the cursor horizontally (the monitoring charts), anchor \'follow\' centers it vertically on a trackPoint-fed anchor so it rides a specific element (the curve editor\'s handle).', Preview: PreviewChartHoverTooltip,
    notes: 'Compose with ChartTooltipHeader, ChartTooltipRow (color dot omitted when no color is given) and ChartTooltipVal children - a row accepts multiple vals (e.g. avg + max). The box is pointer-events: none so it never steals the hover from the chart under it.',
  },
  {
    name: 'TimeSeriesChart', category: 'charts',
    filePath: 'src/components/common/TimeSeriesChart/TimeSeriesChart.tsx',
    description: 'Multi-series line chart over a real date/time domain (not a fixed live-seconds window). Tracks container width via ResizeObserver. A gap wider than 1.5x the actual median point spacing (derived from the data, not a nominal bucket size) breaks the line instead of interpolating across it, and an isolated point renders as a dot. Used by the Diagnostics Cooling tab\'s temperature history and the Monitoring page\'s persistent history chart.', Preview: PreviewTimeSeriesChart,
    notes: 'Points carry {t, avg, max}; only avg is plotted, both are shown in the hover tooltip. xTickFormat/valueFormat let the caller pick range-appropriate label granularity and unit formatting. Optional bands prop draws translucent spans (e.g. sustained-high episodes). Optional tooltipExtra(t) appends caller content after the series rows (e.g. the Cooling tab\'s per-bucket app breakdown) - renders nothing when it returns null. yAxisSide flips the tick-label lane to the right edge (the Monitoring history chart\'s convention). ribbons renders fixed-height, opacity-modulated bands (e.g. temperature) INSIDE the plot, stacked under the line and sharing its own x-domain/pixel mapping - each segment\'s opacity maps linearly from that ribbon\'s own window-observed min/max, and each ribbon carries its own points, fill, optional icon, and optional right-edge valueLabel.',
  },
  {
    name: 'TimelineBrush', category: 'charts',
    filePath: 'src/components/common/TimelineBrush/TimelineBrush.tsx',
    description: 'Minimap scrub bar for panning/zooming a time window within a larger domain: drag the highlighted box to pan, drag either edge to resize (floored at a minimum window), click the track to recenter, drag the right edge within 6px of the domain end to snap onto it. Optional amplitude-only silhouette backdrop and live from/to edge labels. Backs the monitoring tabs\' history chart brush.', Preview: PreviewTimelineBrush,
    notes: 'Pure geometry lives in timelineBrushUtils.ts. onChange(from, to, phase) fires phase "drag" for every intermediate move and "end" on commit (pointer up or a keyboard action) - callers debounce on drag and fetch immediately on end. Keyboard: role="slider", arrows pan 10% of the window, Shift+arrows resize it (right edge anchored), Home/End jump to the domain start/end (End re-touches the live edge).',
  },
  {
    name: 'EventTimeline', category: 'charts',
    filePath: 'src/components/common/EventTimeline/EventTimeline.tsx',
    description: 'Swimlane timeline of discrete events: one lane per category, dots plotted at each event\'s exact time and colored by the caller (e.g. severity). Tracks container width via ResizeObserver; near-coincident same-lane events collapse into one counted dot so wide ranges stay legible. Used by the Diagnostics System tab\'s incident timeline.', Preview: PreviewEventTimeline,
    notes: 'Events carry {laneId, t, color, weight?}; a mixed cluster takes its highest-weight event\'s color. Hover shows an anchored tooltip (renderTooltip(cluster)); click fires onSelect(cluster) and the caller-controlled selectedKey draws a persistent highlight. domain sets the x window (never squished to the data); xTickFormat picks label granularity.',
  },
  {
    name: 'UsageBar', category: 'charts',
    filePath: 'src/components/common/UsageBar/UsageBar.tsx',
    description: 'Simple single-color usage bar. Accepts a 0-1 fraction and an optional color override. Used in the Monitoring dashboard for RAM and storage utilization.',
    Preview: () => (
      <div className={styles.previewBarStack}>
        <UsageBar value={0.62} />
        <UsageBar value={0.88} color="var(--warn)" />
        <UsageBar value={0.95} color="var(--bad)" />
      </div>
    ),
    notes: 'Value is clamped to [0, 1]. Color defaults to var(--accent) when omitted.',
  },

  {
    name: 'CapacityBar', category: 'charts',
    filePath: 'src/components/common/CapacityBar/CapacityBar.tsx',
    description: 'Three-segment capacity bar: other usage (muted border-strong), accent slice (accent color), available (track background).',
    Preview: () => (
      <CapacityBar
        total={1_000_000_000_000}
        other={400_000_000_000}
        accent={8_900_000_000}
      />
    ),
    notes: 'Proportional rendering. When total=0 renders an empty track. accent segment is clamped so other+accent never exceeds 100%.',
  },
  {
    name: 'SeriesChart', category: 'charts',
    filePath: 'src/components/common/SeriesChart/SeriesChart.tsx',
    description: 'Multi-series SVG line/area chart. Accepts pre-resolved color strings per series; preserveAspectRatio="none" so it fills any container. Optional gridlines at 25/50/75%. Host-renderer bridge for the SDK Chart element.',
    Preview: PreviewSeriesChart,
  },
  {
    name: 'RangeBar', category: 'charts',
    filePath: 'src/components/common/RangeBar/RangeBar.tsx',
    description: 'Horizontal range indicator: a colored segment [lo, hi] on a faint track. Two built-in gradients (temp, accent). Optional glow. Host-renderer bridge for the SDK Range element.',
    Preview: PreviewRangeBar,
  },
  {
    name: 'Ring', category: 'charts',
    filePath: 'src/components/common/Ring/Ring.tsx',
    description: 'Full-donut arc meter (72x72 fixed). Stroke-dasharray fill with optional center label/sublabel. Host-renderer bridge for the SDK Ring element.',
    Preview: PreviewRing,
  },
  {
    name: 'Gauge', category: 'charts',
    filePath: 'src/components/common/Gauge/Gauge.tsx',
    description: '270-degree open arc meter. SVG viewBox 0 0 100 100, max-width 170px. Optional center label and sublabel. Host-renderer bridge for the SDK Gauge element.',
    Preview: PreviewGauge,
  },

  // ── Navigation ────────────────────────────────────────────────────────
  {
    name: 'ViewHeader', category: 'navigation',
    filePath: 'src/components/common/ViewHeader/ViewHeader.tsx',
    description: 'Page heading + integrated tab bar. Canonical header for every primary view.', Preview: PreviewViewHeader,
  },
  {
    name: 'Tabs', category: 'navigation',
    filePath: 'src/components/common/Tabs/Tabs.tsx',
    description: 'Segmented tab group, flat at rest - the active tab carries the --bg pill (the immersive editors override it through --tab-active-bg). Supports optional leading icons through TabDef.icon, per-tab disable via TabDef.disabled, and an optional right-aligned trailing control via TabDef.trailing (shown here on Month) - rendered as a sibling of the tab\'s own button sharing one pill, never nested inside it, so its clicks are shielded from the tab\'s onChange without creating an invalid nested-interactive-control. Used inside ViewHeader for page-level tabs and standalone for in-page toggles (panel theme settings, icon picker).', Preview: PreviewTabs,
    notes: 'Pairs with ViewHeader - do not roll your own tab bars. Disabled tabs get opacity 0.4 + not-allowed cursor.',
  },
  {
    name: 'Sidebar', category: 'navigation',
    filePath: 'src/components/common/Sidebar/Sidebar.tsx',
    description: 'Main app navigation column: drag-to-reorder nav rows, compact (icon-only) mode, service status shield, bottom-pinned Settings. `addItem` closes the list with a short + strip that fades in on sidebar hover. SidebarNavButton reuses the exact row chrome for one-off entries, incl. a `disabled` (aria-disabled, still tabbable) variant for rows that are already placed.',
    notes: 'No live preview - needs DnD context, service state, and profile store.',
  },
  {
    name: 'ProfileDropdown', category: 'navigation',
    filePath: 'src/components/common/ProfileDropdown/ProfileDropdown.tsx',
    description: 'Profile picker grouped into an Account section (log in / signed-in account) and a Profiles section (switch list + create + manage). sidebar and avatar variants; compact mode collapses to the avatar disc. Import/export live on the Profiles settings page.',
    notes: 'No live preview - bound to the profiles store and save API.',
  },
  {
    name: 'MenuDivider', category: 'navigation',
    filePath: 'src/components/common/MenuDivider/MenuDivider.tsx',
    description: 'Thin rule separating groups of rows in a dropdown or menu popover. Used by ProfileDropdown to split Account / Profiles / actions.',
    Preview: PreviewMenuDivider,
  },
  // ── Status ────────────────────────────────────────────────────────────
  {
    name: 'Spinner', category: 'status',
    filePath: 'src/components/common/Spinner/Spinner.tsx',
    description: 'Indeterminate loading spinner: rotating arc over faint track, SMIL-animated. Size (default 20px) and color are props. Host-renderer bridge for the SDK Spinner element.',
    Preview: PreviewSpinner,
  },
  {
    name: 'Avatar', category: 'status',
    filePath: 'src/components/common/Avatar/Avatar.tsx',
    description: 'Circular avatar. Renders the src image when present; falls back to the first letter of name over an accent-filled circle when src is absent or fails to load. size is a px diameter (default 36, matching the control-avatar size token). Used by the public account profile page (/u/<username>).',
    Preview: PreviewAvatar,
  },
  {
    name: 'Badge', category: 'status',
    filePath: 'src/components/common/Badge/Badge.tsx',
    description: 'Status pill with tone-tinted color and color-mixed background. Accepts an optional icon ReactNode. Host-renderer bridge for the SDK Badge element.',
    Preview: PreviewBadge,
  },
  {
    name: 'LiveFollowControl', category: 'status',
    filePath: 'src/components/common/LiveFollowControl/LiveFollowControl.tsx',
    description: 'Live / back-to-live toggle for a metric history header: a Live badge (dot to the right of the label) while following, or the caller-formatted viewed-frame time (arrow to its right) once detached - clicking it calls onBackToLive. Both stay mounted in the same reserved slot so toggling never shifts the row. Shared by the monitoring page and Diagnostics > Cooling.',
    Preview: PreviewLiveFollowControl,
  },
  {
    name: 'EmptyState', category: 'status',
    filePath: 'src/components/common/EmptyState/EmptyState.tsx',
    description: 'Centered icon + title + optional hint + optional action. Used by panel widgets when their data source has no entries (no displays, no media playing) and by app views to convey "nothing here yet". Pass `compact` for tight panel widget contexts.', Preview: PreviewEmptyState,
  },
  {
    name: 'DesktopOnlyBadge', category: 'status',
    filePath: 'src/components/common/DesktopOnlyBadge/DesktopOnlyBadge.tsx',
    description: 'Pill badge shown below a field or control that is unavailable on keyboard-less surfaces (Y70 / Q-series). Monitor icon + caption from common.desktopOnly. No props required; usable anywhere a feature is gated on surfaceSupportsTextInput returning false.',
    Preview: PreviewDesktopOnlyBadge,
  },
  {
    name: 'ExperimentalBadge', category: 'status',
    filePath: 'src/components/common/ExperimentalBadge/ExperimentalBadge.tsx',
    description: 'Pill badge flagging a device whose support is experimental (non-HYTE/iBUYPOWER hardware). Composes Badge inside a HoverTooltip that spells out the caveat. Shown left of the Nexus Control switch on the Devices list and under the on/off switch on the device page.',
    Preview: PreviewExperimentalBadge,
  },
  {
    name: 'Toast', category: 'status',
    filePath: 'src/components/common/Toast/Toast.tsx',
    description: 'Transient notifications stacked bottom-right (ToastProvider + useToast().push). Auto-dismiss after 6s, click dismisses, optional accent action button. Used for incoming phone→PC transfer notices at the dashboard root.', Preview: PreviewToast,
    notes: 'The pushed toast portals to the viewport corner, not inside this card.',
  },
  {
    name: 'ServiceLaunchButton', category: 'status',
    filePath: 'src/components/common/ServiceLaunchButton/ServiceLaunchButton.tsx',
    description: 'Launch-the-local-service button with a shared module-level launching state: clicking any instance spins them all and tightens the status poll until the service binds the port (10s timeout). iconOnly variant for the compact sidebar wraps itself in HoverTooltip.',
    Preview: PreviewServiceLaunchButton,
    notes: 'Clicking in Storybook triggers a real launch attempt against the local service endpoint.',
  },
  {
    name: 'PairingQrView', category: 'status',
    filePath: 'src/components/common/PairingQr/PairingQrView.tsx',
    description: 'Shared pairing-QR pane: white QR square with a fade-from-white reveal on each re-mint, plus a countdown that flashes in the final 5s. Pure presentation - the caller owns minting the QR token. Used by the Pair-remote modal QR tab and the 2x2 pairing widget so both render identically. PairingOffState is the companion "pairing disabled" pane.',
    Preview: PreviewPairingQr,
    notes: 'Preview is frozen (static now prop), so the countdown does not tick. variant="card" renders the smaller in-widget layout.',
  },
  {
    name: 'OpenInAppBanner', category: 'status',
    filePath: 'src/components/common/OpenInAppBanner/OpenInAppBanner.tsx',
    description: 'Mobile-only banner offering to open the current page in the native app via the hellonexus:// scheme. Detects platform, remembers dismissal per version suffix.',
    notes: 'No live preview - renders null outside a mobile browser context.',
  },
  {
    name: 'CanvasNoticeBar', category: 'status',
    filePath: 'src/components/common/CanvasNoticeBar/CanvasNoticeBar.tsx',
    description: 'Bottom-docked translucent notice bar overlaid on a preview canvas. Click-through except for the optional action button. tone="wait" is the self-resolving state (GPU still initializing); the default fault tone warns that a shader effect previews in the browser but won\'t run on the service.',
    Preview: PreviewCanvasNoticeBar,
  },

  // ── Panel kit ─────────────────────────────────────────────────────────
  {
    name: 'WidgetHeader', category: 'panel-kit',
    filePath: 'src/components/common/WidgetHeader/WidgetHeader.tsx',
    description: 'Shared panel widget header matching Monitoring cards.',
    Preview: PreviewWidgetHeader,
  },
  {
    name: 'MicroBar', category: 'panel-kit',
    filePath: 'src/panel/widgets/monitoring/MicroBar.tsx',
    description: 'Single horizontal-progress row used by the Micro monitoring layout (count = 3 on 2x2 / 4x2). Label-left, value-right above a thin progress track. Stack 3 of these + a centered category/model label to compose the Micro tile.',
    Preview: PreviewMicroBars,
  },
  {
    name: 'PanelWidgetChrome', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/PanelWidgetChrome.tsx',
    description: 'Standard widget shell: card surface + status dot + setup-state + empty-state slots used by every panel widget. PanelWidgetEmpty composes EmptyState (compact). Reach for this shell before adding new widget chrome.',
    notes: 'No live preview - render context requires the panel surface and widget config.',
  },
  {
    name: 'PanelMixerSlider', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/PanelMixerSlider.tsx',
    description: 'Panel vertical mixer control with an optional uppercase top label and a single draggable pill-shaped track that fills from the bottom. The brightness/volume icon (or icon-button) sits inside the pill at the bottom. An optional `meter` (0-1) paints a live signal level inside the fill and `showValue` renders the value in the badge slot. Used by display brightness, media volume, and the volume mixer widgets.',
    Preview: PanelMixerSliderPreview,
    notes: 'The root is marked data-panel-scrollable so vertical drags yield the panel action tray gesture. `meter` is clamped to the fill height, so it reads as signal rather than as a second value.',
  },
  {
    name: 'WidgetContextMenu', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/WidgetContextMenu.tsx',
    description: 'Long-press / right-click context menu for widgets. Resize, edit, remove. Renders as a positioned popover with theme tokens applied via the panel surface.',
    notes: 'No live preview - needs widget identity + theme context.',
  },
  {
    name: 'PanelCatalogCell', category: 'panel-kit',
    filePath: 'src/panel/dnd/PanelDragCells.tsx',
    description: 'Tile shown in the add-widget catalog. Reuses the live panel cell (card + content scaler + label strip) so the catalog renders a widget identically to the panel grid. Used by the panel add-widget search. `selected` rings the card (single-widget surfaces); `disabled` dims it and drops it from the tab order when the target grid has no room for its size.',
    notes: 'No live preview - the cell instantiates a real panel widget at panel scale.',
  },
  {
    name: 'AppPicker', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/AppPicker.tsx',
    description: 'Searchable list of installed shortcuts. Used by widget settings to pick which app a button or screentime row points at, and by the lighting preset app-binding modal. Composes SearchInput. `selectedIds` makes it multi-select; `showRunning` prepends a "Running now" group from the processes topic so an app missing from the Start menu can still be picked - a running process the installed list also carries is shown once there, under the installed entry\'s id and name. `unavailableIds` dims rows that are spoken for, matched on id or resolved process name so the same app reads as taken from either list.',
    notes: 'No live preview - needs the local service /shortcuts response.',
  },
  {
    name: 'SettingsRow / SettingsToggle / SettingsSelect / SettingsSection', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/SettingsRow/SettingsRow.tsx',
    description: 'Form-row primitives every panel widget settings pane composes. SettingsToggle wraps the canonical Toggle; SettingsSelect wraps Select. Section titles and a base SettingsRow handle layout.',
    notes: 'No live preview - the panel widget settings panes are widget-specific.',
  },
  {
    name: 'SectionHeader', category: 'panel-kit',
    filePath: 'src/components/common/SectionHeader/SectionHeader.tsx',
    description: 'Canonical settings header: a muted body-type label (no underline). Usually rendered by SettingsSection, which sits it above a surface box. Uses var(--text-dim) so it reads correctly inside .panel-root and on the dashboard.',
    Preview: PreviewSectionHeader,
  },
  {
    name: 'CollapsibleSection', category: 'panel-kit',
    filePath: 'src/components/common/CollapsibleSection/CollapsibleSection.tsx',
    description: 'Canonical collapsible group header: chevron + title on the left, optional values/buttons on the right, a hover background bar, no borders. The one treatment for paired smart lights, monitoring detail, and lighting/cooling device groups. compact is the smaller uppercase variant the lighting/cooling groups use. boxed wraps the whole section in the standard surface/border/radius card chrome for a standalone full-width section (monitoring Detailed). titleBefore slots a glyph between the chevron and the title (the hardware group icon on the device rails).',
    Preview: PreviewCollapsibleSection,
  },
  {
    name: 'SortableList', category: 'panel-kit' as StorybookCategory,
    filePath: 'src/components/common/SortableList/SortableList.tsx',
    description: 'Shared vertical drag-to-reorder list built on @dnd-kit. Rows slide apart during drag, a floating clone follows the cursor, and a drop ring pulses at the resting slot. Consumers render each row via renderRow, spreading the supplied args. Mark interactive children with data-no-dnd to prevent drag hijack.',
    Preview: PreviewSortableList,
  },
  {
    name: 'GroupedSortableList', category: 'panel-kit' as StorybookCategory,
    filePath: 'src/components/common/SortableList/GroupedSortableList.tsx',
    description: 'Two-level drag list: top-level rows plus one nested list per group, all under ONE DndContext so a row can be dragged into, out of and between groups. Used by the lighting and cooling rails for user-made device groups. SortableList stays the choice for a flat list - it owns its own context, so two of them can never exchange rows. A group\'s members may name another group, which renders nested; by default a group row never enters another group, and with nestGroups it can enter a top-level group and no deeper (groupBlock / holdsGroup let a block that is itself a group, or holds one, obey the same depth rule).',
    Preview: PreviewGroupedSortableList,
  },
  {
    name: 'SettingsSection', category: 'panel-kit',
    filePath: 'src/components/common/SettingsSection/SettingsSection.tsx',
    description: 'Canonical settings group: a muted body-type header (optional description) sitting outside/above a surface-filled, subtly-bordered box that holds the section rows. The one header-outside-box pattern every settings surface uses (dashboard Settings, panel editor, widget settings, device pages, pairing modal). titleStyle recolours the header (e.g. the danger zone); boxClassName tunes the box (per-surface row gap).',
    Preview: PreviewSettingsSection,
  },
  {
    name: 'PanelThemeSettings', category: 'panel-kit',
    filePath: 'src/panel/editor/PanelThemeSettings.tsx',
    description: 'Per-panel theme editor (Widgets / Theme / Accent / Background) shown stacked in the Y70 touch editor sheet and split by `sections` across the device page\'s Theme and Background tabs. Section headers match the Y70 device Settings (.device-modal-section): uppercase, --type-small / --weight-heading, with a full-width rule underneath.',
    Preview: PreviewPanelThemeSettings,
    notes: 'Preview is in solid background mode; switching to Animations hits the live thumbnail service, so the grid is empty in Storybook.',
  },
  {
    name: 'PanelBackgroundMedia', category: 'panel-kit',
    filePath: 'src/panel/background/PanelBackgroundMedia.tsx',
    description: 'Full-bleed background layer rendered in the panel kiosk when backgroundMode is "media". Renders <img> (static) or <video autoPlay loop muted playsInline> (animated) based on the type prop; URL carries the session token for auth. PanelBackgroundSlideshow stacks two of these to crossfade through the library.',
    notes: 'No live preview - requires a running service with background-media items and a device deviceId.',
  },
  {
    name: 'GaugeTrack', category: 'panel-kit',
    filePath: 'src/panel/widgets/monitoring/gauges/GaugeTrack.tsx',
    description: 'Shared accent fill track composed by MicroBar rows and the BarGauge tile. Clamps to 0-100; sized via --gauge-track-width/height/glow custom props on the caller\'s wrapper.',
    Preview: PreviewGaugeTrack,
  },
  {
    name: 'GaugeValue', category: 'panel-kit',
    filePath: 'src/panel/widgets/monitoring/gauges/GaugeValue.tsx',
    description: 'Sensor value + unit line shared by every gauge design and MicroBar. Fixed-width digit cells keep a ticking reading from reflowing, the unit can never wrap to its own line, and an over-wide reading scales down to fit.',
    Preview: PreviewGaugeValue,
    notes: 'Pass the design\'s own value class - this component IS the value element, so the width clamp lands on the box the design positions. Its container must clamp to the gauge width (max-width: 100%; min-width: 0) or the fit can never see an overflow.',
  },
  {
    name: 'PanelArrowButton', category: 'panel-kit',
    filePath: 'src/panel/chrome/PanelArrowButton.tsx',
    description: 'Naked chevron nav arrow shared by the cooling/lighting widgets and the panel device-page preview. Absolutely positioned by data-side; the caller\'s container must be position: relative.',
    Preview: PreviewPanelArrowButtons,
    notes: 'Pass a caller class for per-surface size/position tweaks - the base look stays in the shared module.',
  },
  {
    name: 'PanelPageIndicator', category: 'panel-kit',
    filePath: 'src/panel/chrome/PanelPageIndicator.tsx',
    description: 'Fading dot page indicator. Un-fades for 1.5s whenever visibilityToken or the active page changes, then fades back out. Renders nothing when total <= 1.',
    Preview: PreviewPanelPageIndicator,
    notes: 'Click "Next page" to bump the token and watch the un-fade cycle.',
  },
  {
    name: 'PanelPager', category: 'panel-kit',
    filePath: 'src/panel/chrome/PanelPager.tsx',
    description: 'Horizontal swipeable pager container: edge-swipe gesture handling, per-page render callback, momentum snapping. Hosts the panel page grid and the immersive overlay pages.',
    notes: 'No live preview - owns pointer-gesture state and needs page content to mean anything.',
  },
  {
    name: 'WidgetCellLabel', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/WidgetCellLabel.tsx',
    description: 'iOS-style centered label rendered below a widget cell or catalog tile. Strip height is owned by the panel root via --panel-widget-label-strip so cells and labels stay aligned on both surfaces.',
    Preview: PreviewWidgetCellLabel,
  },
  {
    name: 'StableDigits', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/StableDigits.tsx',
    description: 'Renders a numeric string with every digit in a fixed-width cell so ticking values (clock, timer, stopwatch) keep a constant width. Lexend has no tabular-figures feature, so font-variant-numeric: tabular-nums silently does nothing - use this for any centered readout whose digits change over time.',
    Preview: PreviewStableDigits,
  },
  {
    name: 'FitLine', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/FitLine.tsx',
    description: 'One line of text that scales down to its container width instead of wrapping or ellipsizing (clock date, calendar month). className goes on the box so font rules inherit; align="start" keeps a shrunk line on the left edge.',
    Preview: PreviewFitLine,
  },
  {
    name: 'WidgetOfflineState', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/WidgetOfflineState.tsx',
    description: 'Shared no-connection face for widgets that need the internet (weather, stocks). Rendered once a fetch settles with no data at all - a stale reading stays on screen instead. compact drops the label for a 1x1 cell.',
    Preview: PreviewWidgetOfflineState,
  },
  {
    name: 'SizeIcons', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/SizeIcons.tsx',
    description: 'SIZE_ICONS record: one glyph per widget size (1x1 ... 4x4) used by the size selector in widget settings and the context menu resize row.',
    Preview: PreviewSizeIcons,
  },
  {
    name: 'IconPicker', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/IconPicker.tsx',
    description: 'Auto / Icons / Emoji / Custom tabbed picker for deck-button glyphs. Searches the lucide deck set, browses the emoji categories, Custom uploads (client-resized to a square target) and stores an image server-side, Auto derives from the action or app. Returns a DeckIcon or undefined (auto).',
    Preview: PreviewIconPicker,
  },
  {
    name: 'EmojiPicker', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/EmojiPicker.tsx',
    description: 'Category-tab-and-grid emoji browser shared by the Emoji widget and the IconPicker emoji tab. searchable renders a search input above the tabs and swaps the grid to keyword-matched results while a query is present; value highlights the matching emoji.',
    Preview: PreviewEmojiPicker,
  },
  {
    name: 'WidgetEditSheet', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/WidgetEditSheet.tsx',
    description: 'Anchored edit sheet for widget settings: positions itself beside the widget cell (flipping to fit the viewport), hosts the widget\'s settings pane + size selector.',
    notes: 'No live preview - anchors to a real widget cell and edits live panel config.',
  },
  {
    name: 'StaticDeviceSelect', category: 'panel-kit',
    filePath: 'src/panel/widgets/lighting/effecteditor/StaticDeviceSelect.tsx',
    description: 'Devices tab of the immersive lighting editor, shown in Static mode only. Static assigns a colour per device, so a pick needs a target; this supplies one. Renders the lighting page\'s own ZoneCards in selectOnly mode (checkbox and card-tap selection, no per-card actions or context menu) over a Select all / Clear selection row. The selection is the page\'s - same localStorage key - so it is shared between the two surfaces.',
    notes: 'No live preview - reads the running install\'s lighting devices, and selecting one repoints the real Static assignment.',
  },
  {
    name: 'ImmersiveLayout / ImmersiveCell', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/ImmersiveLayout.tsx',
    description: 'Layout grid for a widget\'s fullscreen immersive page: cellsPerPage adapts to the panel grid (2 stacked on a 4x6/4x8 phone portrait, 2 side-by-side on landscape, 3 on Y70 portrait). ImmersiveCell wraps each region.',
    notes: 'No live preview - sized by the immersive overlay surface.',
  },
  {
    name: 'WidgetTouchView (makeWidgetTouchView)', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/WidgetTouchView.tsx',
    description: 'Generic immersive wrapper for widgets without a custom fullscreen layout: renders the widget at 4x4 inside a single ImmersiveLayout cell, centered in portrait, column-filling in landscape.',
    notes: 'No live preview - HOC over a live widget component.',
  },
  {
    name: 'WidgetControlGroup', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/WidgetControlGroup.tsx',
    description: 'Bordered group frame for related controls inside a widget (e.g. media transport cluster). Pure layout chrome over panel tokens.',
    notes: 'No live preview - composition shell; see PanelMixerSlider for the framed-control look.',
  },
  {
    name: 'AdvancedModeSettings', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/AdvancedModeSettings.tsx',
    description: 'Per-widget "advanced mode" toggle used by the lighting + cooling widgets. widget.config.advancedMode overrides the global ui.widgetAdvancedMode; resolveAdvancedMode handles the fallback.',
    notes: 'No live preview - reads and writes live widget config.',
  },
  {
    name: 'BenchmarkWidget', category: 'panel-kit',
    filePath: 'src/panel/widgets/benchmark/BenchmarkWidget.tsx',
    description: 'Benchmark tile widget (2x2 / 4x2). 2x2: composite score + relative time or empty prompt. 4x2: adds per-axis chips (CPU / GPU / RAM / Storage). Read-only tile -- click opens the tabbed Benchmark page.',
    notes: 'No live preview -- reads useBenchmarkHistory which requires localStorage data from a completed run.',
  },
  {
    name: 'BenchmarkPage', category: 'panel-kit',
    filePath: 'src/panel/widgets/benchmark/BenchmarkPage.tsx',
    description: 'Tabbed desktop page for the Benchmark app: Run (hardware detection + start/progress/cancel), Results (scorecard + history sparkline), Leaderboards (public board with version filter). Tab state drives the URL subtab via onTabChange.',
    notes: 'No live preview -- requires a running service for the Run tab and cloud API for Leaderboards.',
  },
  {
    name: 'PresetAppsModal', category: 'panel-kit',
    filePath: 'src/panel/widgets/lighting/page/PresetAppsModal.tsx',
    description: 'Picks which apps auto-activate a lighting preset when they take focus. Composes DeviceModal + ChipGroup (wrap variant, one removable chip per bound app, plus Clear all) + AppPicker (multi-select, running-apps group); selection is local until Save. An app triggers exactly one preset: rows another preset already claims are dimmed, and picking one shows an inline alert naming the owner instead of stealing it (the service refuses the save with a 409 as the backstop).',
    notes: 'No live preview -- needs the local service /shortcuts response and a saved layout preset.',
  },
  {
    name: 'PresetToolbar', category: 'inputs',
    filePath: 'src/components/common/PresetToolbar/PresetToolbar.tsx',
    description: 'Generic named-preset manager: dropdown (with Rename/Delete when active and a capped New preset... entry, plus an optional capped Import preset... entry via onImport and an optional Trigger with apps... entry via onManageApps), optionally paired with Undo / Redo icon buttons via showHistory, plus a Reset button when onReset is supplied. A preset with `hasApps` carries an app glyph, marking it as one an app in focus activates. Used by the lighting canvas layout toolbar (full history controls) and the Stream Deck page (dropdown + onImport opening the Elgato import modal).',
    notes: 'No live preview -- bound to live preset state via useLayoutPresets / useDeckPresets and requires a running service.',
  },
  {
    name: 'CorsairDevicePage', category: 'panel-kit',
    filePath: 'src/components/views/DevicePage/CorsairDevicePage.tsx',
    description: 'Device settings page for the Corsair iCUE LINK Hub. Shows auto-detected connected devices (channel position badge, name, LED count, live RPM, live temperature) and navigation hints to the Cooling and Lighting pages.',
    notes: 'No live preview - requires a running service with a connected Corsair iCUE LINK Hub.',
  },
  {
    name: 'HomeAssistantWidget', category: 'panel-kit',
    filePath: 'src/panel/widgets/home-assistant/HomeAssistantWidget.tsx',
    description: 'Home Assistant tile widget (2x2 / 4x2): connection status dot, on/off entity count. Click opens the Home Assistant management page. Shows a "not configured" prompt when HA is not connected.',
    notes: 'No live preview -- requires a running service with Home Assistant configured.',
  },
  {
    name: 'HomeAssistantPage', category: 'panel-kit',
    filePath: 'src/panel/widgets/home-assistant/HomeAssistantPage.tsx',
    description: 'Home Assistant management page: setup form (URL + long-lived access token) or entity list (lights and switches grouped by area, with toggle, brightness slider, and color picker per entity).',
    notes: 'No live preview -- requires a running service with Home Assistant configured.',
  },
  {
    name: 'DeckEditor (physical target)', category: 'panel-kit',
    filePath: 'src/panel/widgets/deck/DeckEditor.tsx',
    description: 'Shared grid + inspector for one Deck target. The touch widget renders its own grid elsewhere (the live tile) so DeckEditor only adds the inspector there; a physical Stream Deck has no other tile, so DeckEditor renders the live key grid (drag-reorder, reserved Back key inside a folder) too. This story drives it against a real physical target (makePhysicalDeckTarget) shaped like a Mini (2x3).',
    Preview: PreviewDeckEditorPhysical,
    notes: 'Pick a key, set an action, then use "Folder" + "Edit folder" to see the reserved Back key.',
  },
  {
    name: 'DeckPageStrip', category: 'panel-kit',
    filePath: 'src/panel/widgets/deck/DeckPageStrip.tsx',
    description: 'Page strip for a deck\'s pagination: a Tabs row switching between pages (or, with the `numbered` prop, plain page-number chips matching the Keeb device page\'s layer chips), an add-page control, and a remove-current-page control guarded against dropping the last page and confirmed when the page has content. Shared by the touch widget settings sheet (DeckEditor, Tabs) and the physical Stream Deck Customize tab (StreamDeckDevicePage, numbered chips).',
    Preview: PreviewDeckPageStrip,
    notes: 'Page 2 (index 1) starts marked as having content, so removing it while selected opens the confirm modal; other pages remove instantly.',
  },
];
