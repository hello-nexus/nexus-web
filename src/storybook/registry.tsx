// Bundles the Preview* components alongside the REGISTRY data array; one
// file per preview to satisfy the fast-refresh rule would be dozens of tiny
// files. Storybook entries reload (not HMR) on edit.
import { useRef, useState, type CSSProperties, type FC } from 'react';
import { Monitor, Palette, Sparkles, X, Plus, Settings, Download } from 'lucide-react';
import { ViewHeader } from '../components/common/ViewHeader/ViewHeader';
import { Sparkline } from '../components/common/Sparkline/Sparkline';
import { RankedList } from '../components/common/RankedList/RankedList';
import { SensorCard } from '../components/common/SensorCard/SensorCard';
import { Card } from '../components/common/Card/Card';
import { InfoList, InfoRow } from '../components/common/InfoList/InfoList';
import { BatteryBar } from '../components/peripherals/BatteryBar';
import { Slider } from '../components/common/Slider/Slider';
import { RangeSlider } from '../components/common/Slider/RangeSlider';
import { EditableText } from '../components/common/Editable/EditableText';
import { EditableNumber } from '../components/common/Editable/EditableNumber';
import { HsvPicker } from '../components/common/HsvPicker/HsvPicker';
import { PaletteRing } from '../components/common/PaletteRing/PaletteRing';
import { EffectTemplateSelector } from '../components/common/EffectTemplateSelector/EffectTemplateSelector';
import { DeviceModal } from '../components/common/DeviceModal/DeviceModal';
import { CardDeleteButton } from '../components/common/CardDeleteButton/CardDeleteButton';
import { InfoTooltip } from '../components/common/InfoTooltip/InfoTooltip';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { Popover } from '../components/common/Popover/Popover';
import { DatePicker } from '../components/common/DatePicker/DatePicker';
import { EffectCard } from '../components/common/EffectCard/EffectCard';
import { EffectControls } from '../panel/widgets/lighting/page/EffectControls';
import { Tabs } from '../components/common/Tabs/Tabs';
import { ConfirmModal } from '../components/common/ConfirmModal/ConfirmModal';
import { PromptModal } from '../components/common/PromptModal/PromptModal';
import { UsageBar } from '../components/common/UsageBar/UsageBar';
import { CapacityBar } from '../components/common/CapacityBar/CapacityBar';
import { StackedChart } from '../components/common/StackedChart/StackedChart';
import { SupportedDevicesModal } from '../components/common/SupportedDevicesModal/SupportedDevicesModal';
import { Overlay } from '../components/common/Overlay/Overlay';
import { ColorPickerWithPresets } from '../components/common/ColorPickerWithPresets/ColorPickerWithPresets';
import { SearchInput } from '../components/common/SearchInput/SearchInput';
import { Toggle } from '../components/common/Toggle/Toggle';
import { EmptyState } from '../components/common/EmptyState/EmptyState';
import { Select } from '../components/common/Select/Select';
import { IconLabelButton } from '../components/common/IconLabelButton/IconLabelButton';
import { Button } from '../components/common/Button/Button';
import { ToastProvider, useToast } from '../components/common/Toast/Toast';
import { WidgetHeader } from '../components/common/WidgetHeader/WidgetHeader';
import { DEFAULT_ACCENT, PRESET_ACCENTS } from '../lib/settings';
import { defaultStateFor, type EffectState, type EffectTemplateBundle } from '../types/lighting';
import { buildDefaultTemplates } from '../types/lightingTemplates';
import type { BatteryState } from '../hooks/usePeripherals';
import type { HardwareSensor } from '../hooks/useSensors';
import type { SeriesEntry } from '../hooks/useProcessMonitor';
import { PanelMixerSliderPreview } from './PanelMixerSliderPreview';
import { TextStyles } from './TextStyles';
import { SurfaceStyles } from './SurfaceStyles';
import { MicroBar } from '../panel/widgets/monitoring/MicroBar';
import { GaugeTrack } from '../panel/widgets/monitoring/gauges/GaugeTrack';
import { pairingPreviewQr } from '../panel/widgets/pairing/pairingPreviewData';
import { PanelThemeSettings, type PanelThemeSettingsState } from '../panel/editor/PanelThemeSettings';
import { SectionHeader } from '../components/common/SectionHeader/SectionHeader';
import { CollapsibleSection } from '../components/common/CollapsibleSection/CollapsibleSection';
import { SettingsSection } from '../components/common/SettingsSection/SettingsSection';
import { SettingToggle } from '../components/common/SettingRow/SettingRow';
import { ServiceLaunchButton } from '../components/common/ServiceLaunchButton/ServiceLaunchButton';
import { PairingQrView } from '../components/common/PairingQr/PairingQrView';
import { AboutModal } from '../components/common/AboutModal/AboutModal';
import { NexusMark, NexusWordmark } from '../components/icons/NexusBrand';
import { PanelArrowButton } from '../panel/chrome/PanelArrowButton';
import { PanelPageIndicator } from '../panel/chrome/PanelPageIndicator';
import { WidgetCellLabel } from '../panel/widgets/common/WidgetCellLabel';
import { SIZE_ICONS } from '../panel/widgets/common/SizeIcons';
import { IconPicker } from '../panel/widgets/common/IconPicker';
import type { DeckIcon } from '../panel/widgets/deck/types';
// Side-effect: pulls the global `.panel-root { --panel-*: … }` token rules into
// the Storybook bundle so the panel-scoped preview below resolves its vars.
// Idempotent — PanelDevicePage imports the same sheet.
import '../panel/styles/tokens.scss';
import styles from './StorybookModal.module.scss';

/*
 * Component registry. This is the source of truth for the Storybook viewer.
 * Add an entry here whenever a new shared component lands under
 * src/components/ (or a sub-component used by 2+ views). Removing a component
 * means removing its entry here. See `.agents/rules/storybook.md`.
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
  const [v, setV] = useState(50);
  return <Slider label="Sample" value={v} min={0} max={100} onChange={setV} />;
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
        <InfoTooltip message="Every USB peripheral Nexus can see. Connect new devices through your browser or inspect the raw USB table." side="top" />
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
    </div>
  );
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
  return <Sparkline values={values} width={140} height={32} />;
}

function PreviewRankedList() {
  return <RankedList
    title="Sample"
    subtitle="last minute"
    items={[
      { name: 'one.exe', color: '#22c55e', value: 42 },
      { name: 'two.exe', color: '#3b82f6', value: 28 },
      { name: 'three.exe', color: '#a855f7', value: 12 },
    ]}
    formatValue={v => `${v}%`}
  />;
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
    <Card title="Sample card" subtitle="Compose into bespoke surfaces">
      <p className={styles.previewText}>Card primitive owns background, border, padding, and the title row.</p>
    </Card>
  );
}

function PreviewInfoList() {
  return (
    <InfoList>
      <InfoRow label="Vendor" value="Sample Co." />
      <InfoRow label="Category" value="Mouse" capitalize />
      <InfoRow label="Wireless" value="Yes" tone="accent" />
      <InfoRow label="Source" value="WebHID" tone="dim" />
    </InfoList>
  );
}

function PreviewBatteryBar() {
  const state: BatteryState = { percent: 72, charging: true } as BatteryState;
  return <BatteryBar state={state} />;
}

function PreviewBatteryBarLow() {
  const state: BatteryState = { percent: 14, charging: false } as BatteryState;
  return <BatteryBar state={state} />;
}

function PreviewViewHeader() {
  const [active, setActive] = useState('one');
  return <ViewHeader title="Sample View" tabs={[
    { key: 'one', label: 'Tab One' }, { key: 'two', label: 'Tab Two' },
  ]} activeTab={active} onTabChange={setActive} />;
}

function PreviewTabs() {
  const [active, setActive] = useState('day');
  return <Tabs
    tabs={[
      { key: 'day', label: 'Day' },
      { key: 'week', label: 'Week' },
      { key: 'month', label: 'Month' },
      { key: 'app', label: 'App' },
    ]}
    activeKey={active}
    onChange={setActive}
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

function PreviewStackedChart() {
  // Fabricate a 60-sample window so the chart has something to render without
  // hooking the live monitoring store. Two series (CPU + background) stacked.
  const cpuVals = Array.from({ length: 60 }, (_, i) => 20 + 15 * Math.sin(i / 6) + sampleNoise(i, 3));
  const otherVals = Array.from({ length: 60 }, (_, i) => 10 + 8 * Math.cos(i / 8) + sampleNoise(i, 7) * 0.6);
  const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / Math.max(1, xs.length);
  const series: SeriesEntry[] = [
    { name: 'Chrome', color: '#6366f1', values: cpuVals, current: cpuVals[cpuVals.length - 1], avg: avg(cpuVals) },
    { name: 'Other', color: '#22d3ee', values: otherVals, current: otherVals[otherVals.length - 1], avg: avg(otherVals) },
  ];
  return (
    <StackedChart
      title="CPU %"
      series={series}
      sampleCount={60}
      yMax={80}
      yUnit="%"
      xSeconds={60}
      height={180}
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
        source="peripherals"
      />
    </>
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

function PreviewEffectTemplateSelector() {
  const [activeIndex, setActiveIndex] = useState(0);
  const bundle = buildDefaultTemplates(EFFECT_TEMPLATE_PREVIEW_EFFECT);
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
  const [bundle, setBundle] = useState(() => buildDefaultTemplates(EFFECT_TEMPLATE_PREVIEW_EFFECT));
  const [state, setState] = useState(() => (
    resolvePreviewEffectState(EFFECT_TEMPLATE_PREVIEW_EFFECT, bundle)
  ));

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
    const next = buildDefaultTemplates(EFFECT_TEMPLATE_PREVIEW_EFFECT);
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

function PreviewEffectCard() {
  const [active, setActive] = useState<'overlayA' | 'overlayB' | 'media' | null>('overlayA');
  return (
    <div className={styles.previewStack}>
      {/* Overlay layout: shared by the lighting shader browser and the panel
          Theme animation picker — full-bleed thumbnail, label over the lower
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
  return (
    <ColorPickerWithPresets
      value={color}
      presets={PRESET_ACCENTS}
      onPreview={setColor}
      onCommit={setColor}
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
        <Button disabled>Disabled</Button>
      </div>
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
        { value: 'silent', label: 'Silent' },
        { value: 'balanced', label: 'Balanced' },
        { value: 'turbo', label: 'Turbo' },
      ]}
      ariaLabel="Profile"
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
    </div>
  );
}

function PreviewSettingsSection() {
  return (
    <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <SettingsSection title="General" description="Optional muted description under the title.">
        <div style={{ color: 'var(--text)', fontSize: 14, padding: '0.4rem 0' }}>Language</div>
        <div style={{ color: 'var(--text)', fontSize: 14, padding: '0.4rem 0' }}>Hide conflict warnings</div>
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
    backgroundEffectState: { speed: 0, intensity: 1, hue: 0, colorize: 0, saturation: 1, contrast: 1, params: {} },
    widgetOpacity: 1, widgetLabels: true, widgetBlur: true,
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
        onBackgroundEffectCommit={fx => set({ backgroundEffect: fx })}
        onBackgroundTemplateCommit={n => set({ backgroundTemplate: n })}
        onBackgroundEffectStatePreview={s => set({ backgroundEffectState: s })}
        onBackgroundEffectStateCommit={s => set({ backgroundEffectState: s })}
        onBackgroundOpacityPreview={o => set({ backgroundOpacity: o })}
        onBackgroundOpacityCommit={o => set({ backgroundOpacity: o })}
        onWidgetOpacityPreview={o => set({ widgetOpacity: o })}
        onWidgetOpacityCommit={o => set({ widgetOpacity: o })}
        onWidgetLabelsCommit={v => set({ widgetLabels: v })}
        onWidgetBlurCommit={v => set({ widgetBlur: v })}
      />
    </div>
  );
}

function PreviewSettingRow() {
  const [startup, setStartup] = useState(true);
  const [beta, setBeta] = useState(false);
  return (
    <div className={styles.previewStack}>
      <SettingToggle label="Run at startup" description="Launch Nexus when you sign in"
        checked={startup} onChange={setStartup} />
      <SettingToggle label="Beta updates" checked={beta} onChange={setBeta} disabled />
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
  // Same deterministic QR-look fixture the panel widget catalog uses.
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
      <AboutModal open={open} onClose={() => setOpen(false)} />
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

function PreviewIconPicker() {
  const [icon, setIcon] = useState<DeckIcon | undefined>({ kind: 'lucide', value: 'Rocket' });
  return (
    <div style={{ width: '100%', maxWidth: 320 }}>
      <IconPicker value={icon} onChange={setIcon} />
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
    name: 'Brand (NexusMark / NexusWordmark)', category: 'foundation',
    filePath: 'src/components/icons/NexusBrand.tsx',
    description: 'The interlocking-N mark and NEXUS wordmark as currentColor SVGs traced from the brand art. size / height props govern rendered dimensions directly (viewBoxes are tight to the visible bbox).',
    Preview: PreviewBrand,
  },
  // ── Inputs ────────────────────────────────────────────────────────────
  {
    name: 'Slider (inline)', category: 'inputs',
    filePath: 'src/components/common/Slider/Slider.tsx',
    description: 'Inline label | track | value layout. Default orientation. Every slider now paints the accent fill track + bright (white-on-dark) thumb — there is no un-filled variant.', Preview: PreviewSliderInline,
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
    description: 'Stacked slider with min and max printed under the track. Used by DpiControl and any range-bound control where the user needs to see the bounds.', Preview: PreviewSliderRange,
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
    name: 'Select', category: 'inputs',
    filePath: 'src/components/common/Select/Select.tsx',
    description: 'Custom select: a button trigger plus a listbox portaled to <body> and clamped to the viewport, not the native <select> popup, which renders off-screen on the Y70 kiosk WebView. One control across desktop, phone, and Y70. Pass options for flat lists or <option> children (value + text, optional disabled/className); optgroups are unsupported. Used by SettingsView, CoolingView FanCard + CurveEditor, LightingView ModeControls, and the panel widget settings rows.', Preview: PreviewSelect,
    notes: 'One size across the app. variant="ghost" drops the border/background for selects already inside a bordered card (cooling fan / curve rows).',
  },
  {
    name: 'IconLabelButton', category: 'inputs',
    filePath: 'src/components/common/IconLabelButton/IconLabelButton.tsx',
    description: 'Compact icon-over-label button with an active state and touch-up press handling. Used by panel widget size and monitoring design selectors.', Preview: PreviewIconLabelButton,
  },
  {
    name: 'Button', category: 'inputs',
    filePath: 'src/components/common/Button/Button.tsx',
    description: 'Canonical button. Replaces every ad-hoc button SCSS class across views. Three sizes (sm/md/lg) x four tones (neutral/accent/danger/ghost), optional pill shape, optional leading/trailing icon, optional loading + disabled states. Icon-only buttons render square automatically when no children are passed.',
    Preview: PreviewButtonMatrix,
    fullWidth: true,
    notes: 'Reach for size="md" tone="neutral" for tertiary actions. tone="accent" for primary CTAs. tone="danger" for destructive. tone="ghost" when bordered chrome would compete with adjacent UI.',
  },

  {
    name: 'SettingRow / SettingToggle / SettingSelect', category: 'inputs',
    filePath: 'src/components/common/SettingRow/SettingRow.tsx',
    description: 'Canonical settings row: label (+ optional description / icon) left, control right. The one settings row for the whole app (Settings pages, lighting/keeb pages, panel editor sheet, device Settings tab); the panel SettingsRow re-exports it. SettingToggle and SettingSelect bundle the matching control.',
    Preview: PreviewSettingRow,
    notes: 'Token fallbacks (--panel-* → app globals) keep it correct inside .panel-root and on the dashboard. No per-row divider — rules belong to SectionHeader.',
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
    notes: 'Opens on pointerenter and keyboard focus, closes on leave / blur. Tooltip itself is pointer-events: none so the trigger keeps ownership of the cursor. Pass `title` for the bold first line plus `body` for the description, or just `body` for a single-line variant.',
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
    description: 'Fixed 10-column swatch grid for theming surfaces (app accent, panel accent, panel background). Click commits immediately - the preset list is the entire palette, no free-form input.', Preview: PreviewColorPickerWithPresets,
    notes: 'Pass a 20-entry preset list to render two rows. Row 2 should be a vertically paired darker / more saturated sibling of row 1 by hue family; selected swatch gets an accent ring. Swatches stretch to 1/10 of the container width and cap at ~36px on desktop, so the grid fills phone-sheet widths edge-to-edge.',
  },
  {
    name: 'PaletteRing', category: 'editable',
    filePath: 'src/components/common/PaletteRing/PaletteRing.tsx',
    description: 'Radial hue + palette-width picker. Drag the arc body to rotate (hue), drag a handle to resize (colorize). Min arc span enforces a minimum palette width so mono-ish presets stay draggable. Used as the hero control in the Lighting animate drawer.', Preview: PreviewPaletteRing,
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
    description: 'Canonical card surface (background, border, radius, padding) with optional title / subtitle / actions header. Compose for any panel.', Preview: PreviewCard,
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
    name: 'EffectCard', category: 'cards',
    filePath: 'src/components/common/EffectCard/EffectCard.tsx',
    description: 'The one shared thumbnail card: lighting shader browser, panel Theme animation picker, and media library all use it. overlay=true gives a full-bleed thumbnail with the label stroked over the lower third (both shader pickers); default layout is thumbnail-above-caption with optional meta line + hover-reveal delete X (media library).', Preview: PreviewEffectCard,
    notes: 'Pass overlay for the full-bleed label-on-thumbnail shader-picker layout. Pass asDiv when the card contains a nested button (CardDeleteButton) - nested buttons are invalid HTML. thumbUrl=null renders a shimmer skeleton.',
  },
  {
    name: 'DeviceCanvas', category: 'cards',
    filePath: 'src/components/common/DeviceCanvas/DeviceCanvas.tsx',
    description: 'Free-arrange device canvas for the Lighting view: drag-position device tiles, marquee multi-select, per-device LED preview driven by the live shader effect, right-click DeviceContextMenu.',
    notes: 'No live preview - needs live device geometry, LED maps, and shader state.',
  },

  // ── Modals ────────────────────────────────────────────────────────────
  {
    name: 'Overlay', category: 'modals',
    filePath: 'src/components/common/Overlay/Overlay.tsx',
    description: 'Canonical modal/sheet base. Owns the backdrop, escape-to-close, and click-outside dismiss; the consumer brings the surface chrome via className. Variants: dialog (centred), alert (alertdialog role + Enter-to-confirm), sheet (transparent backdrop for slide drawers).', Preview: PreviewOverlay,
    notes: 'DeviceModal, ConfirmModal, and SupportedDevicesModal compose Overlay - reach for those existing wrappers before using Overlay directly.',
  },
  {
    name: 'DeviceModal', category: 'modals',
    filePath: 'src/components/common/DeviceModal/DeviceModal.tsx',
    description: 'Reusable modal shell built on Overlay. Title + close button + standard escape/click-outside dismiss. wide / fullscreen variants.', Preview: PreviewDeviceModal,
  },
  {
    name: 'ConfirmModal', category: 'modals',
    filePath: 'src/components/common/ConfirmModal/ConfirmModal.tsx',
    description: 'Native-in-app confirmation modal with title + body + optional note + confirm/cancel actions. Esc cancels, Enter confirms, click-outside cancels. Cancel autofocused so destructive intent must be explicit. Used instead of window.confirm so the dialog matches app chrome.', Preview: PreviewConfirmModal,
    notes: 'destructive defaults to true (red confirm button). Pass destructive={false} for non-destructive confirmations like "save changes?".',
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
    description: 'Fullscreen device catalogue browser with search + pagination + highlight of currently-detected VID/PIDs. Used by Devices and Lighting views to surface the supported hardware list.', Preview: PreviewSupportedDevicesModal,
    notes: 'source="peripherals" | "lighting" selects which catalogue to load. Pass detectedVidPids to mark already-connected devices.',
  },
  {
    name: 'AboutModal', category: 'modals',
    filePath: 'src/components/common/AboutModal/AboutModal.tsx',
    description: 'Lightweight "About Nexus" dialog opened from the top-bar "..." menu. Brand mark + wordmark, build version, link to hellonexus.com. Composes Overlay (alert variant, Enter/Esc close).',
    Preview: PreviewAboutModal,
  },

  // ── Charts ────────────────────────────────────────────────────────────
  {
    name: 'Sparkline', category: 'charts',
    filePath: 'src/components/common/Sparkline/Sparkline.tsx',
    description: 'Tiny SVG sparkline. Auto-scales or accepts a fixed domain. Flat alpha fill (color, fillOpacity) plus optional separate strokeColor / strokeWidth. Pass sampleCount to lock a window length and left-pad shorter buffers. Used by Monitoring CPU/GPU/Network and panel widgets (SparklineGauge, LineGauge, CoolingWidget).', Preview: PreviewSparkline,
  },
  {
    name: 'RankedList', category: 'charts',
    filePath: 'src/components/common/RankedList/RankedList.tsx',
    description: 'Ranked items with colored bars. Used in Monitoring for process and per-app network ranking.', Preview: PreviewRankedList,
  },
  {
    name: 'StackedChart', category: 'charts',
    filePath: 'src/components/common/StackedChart/StackedChart.tsx',
    description: 'Reusable stacked-area time chart. Tracks container width via ResizeObserver; fixed pixel height. Used for CPU% + Memory MB panels in Monitoring. Accepts any number of SeriesEntry[] (name + colour + values).', Preview: PreviewStackedChart,
    notes: 'yMax=0 auto-scales. xSeconds sets the visible window (default 60s). Hover shows a crosshair + per-series values.',
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

  // ── Navigation ────────────────────────────────────────────────────────
  {
    name: 'ViewHeader', category: 'navigation',
    filePath: 'src/components/common/ViewHeader/ViewHeader.tsx',
    description: 'Page heading + integrated tab bar. Canonical header for every primary view.', Preview: PreviewViewHeader,
  },
  {
    name: 'Tabs', category: 'navigation',
    filePath: 'src/components/common/Tabs/Tabs.tsx',
    description: 'Bordered segmented tab group - one shared border around the whole bar, solid accent fill on the active tab. Supports optional leading icons through TabDef.icon and per-tab disable via TabDef.disabled. Used inside ViewHeader for page-level tabs and standalone for in-page toggles (panel theme settings, icon picker).', Preview: PreviewTabs,
    notes: 'Pairs with ViewHeader - do not roll your own tab bars. Disabled tabs get opacity 0.4 + not-allowed cursor.',
  },
  {
    name: 'Sidebar', category: 'navigation',
    filePath: 'src/components/common/Sidebar/Sidebar.tsx',
    description: 'Main app navigation column: drag-to-reorder nav rows, compact (icon-only) mode, service status shield, bottom-pinned Settings. SidebarNavButton reuses the exact row chrome for one-off entries.',
    notes: 'No live preview - needs DnD context, service state, and profile store.',
  },
  {
    name: 'ProfileDropdown', category: 'navigation',
    filePath: 'src/components/common/ProfileDropdown/ProfileDropdown.tsx',
    description: 'Profile picker with create / import / export actions. sidebar and avatar variants; compact mode collapses to the avatar disc.',
    notes: 'No live preview - bound to the profiles store and save API.',
  },

  // ── Status ────────────────────────────────────────────────────────────
  {
    name: 'EmptyState', category: 'status',
    filePath: 'src/components/common/EmptyState/EmptyState.tsx',
    description: 'Centered icon + title + optional hint + optional action. Used by panel widgets when their data source has no entries (no displays, no media playing) and by app views to convey "nothing here yet". Pass `compact` for tight panel widget contexts.', Preview: PreviewEmptyState,
  },
  {
    name: 'Toast', category: 'status',
    filePath: 'src/components/common/Toast/Toast.tsx',
    description: 'Transient notifications stacked bottom-right (ToastProvider + useToast().push). Auto-dismiss after 6s, click dismisses, optional accent action button. Used for incoming phone→PC transfer notices at the dashboard root.', Preview: PreviewToast,
    notes: 'The pushed toast portals to the viewport corner, not inside this card.',
  },
  {
    name: 'BatteryBar', category: 'status',
    filePath: 'src/components/peripherals/BatteryBar.tsx',
    description: 'Battery percent bar with good / warn / bad tone and a charging indicator.', Preview: PreviewBatteryBar,
  },
  {
    name: 'BatteryBar (low)', category: 'status',
    filePath: 'src/components/peripherals/BatteryBar.tsx',
    description: 'Low-battery (<20%) tone variant.', Preview: PreviewBatteryBarLow,
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
    description: 'Shared pairing-QR pane: white QR square with a fade-from-white reveal on each re-mint, plus a countdown that flashes in the final 5s. Pure presentation - the caller owns minting via usePairingQrFeed. Used by the Pair-remote modal QR tab and the 2x2 pairing widget so both render identically. PairingOffState is the companion "pairing disabled" pane.',
    Preview: PreviewPairingQr,
    notes: 'Preview is frozen (static now prop), so the countdown does not tick. variant="card" renders the smaller in-widget layout.',
  },
  {
    name: 'OpenInAppBanner', category: 'status',
    filePath: 'src/components/common/OpenInAppBanner/OpenInAppBanner.tsx',
    description: 'Mobile-only banner offering to open the current page in the native app via the hellonexus:// scheme. Detects platform, remembers dismissal per version suffix.',
    notes: 'No live preview - renders null outside a mobile browser context.',
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
    description: 'Panel vertical mixer control with an optional uppercase top label and a single draggable pill-shaped track that fills from the bottom. The brightness/volume icon (or icon-button) sits inside the pill at the bottom. Used by display brightness and media volume widgets.',
    Preview: PanelMixerSliderPreview,
    notes: 'The root is marked data-panel-scrollable so vertical drags yield the panel action tray gesture.',
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
    description: 'Tile shown in the add-widget catalog. Reuses the live panel cell (card + content scaler + label strip) so the catalog renders a widget identically to the panel grid. Used by the panel add-widget search.',
    notes: 'No live preview - the cell instantiates a real panel widget at panel scale.',
  },
  {
    name: 'AppPicker', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/AppPicker.tsx',
    description: 'Searchable list of installed shortcuts. Used by widget settings to pick which app a button or screentime row points at. Composes SearchInput.',
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
    description: 'Canonical collapsible group header: chevron + title on the left, optional values/buttons on the right, a hover background bar, no borders. The one treatment for paired smart lights, monitoring detail, and lighting/cooling device groups. compact is the smaller uppercase variant the lighting/cooling groups use.',
    Preview: PreviewCollapsibleSection,
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
    description: 'Per-panel theme editor (Widgets / Theme / Accent / Background) shown in the Y70 touch editor sheet and the dashboard device Settings tab. Section headers match the Y70 device Settings (.device-modal-section): uppercase, --type-small / --weight-heading, with a full-width rule underneath.',
    Preview: PreviewPanelThemeSettings,
    notes: 'Preview is in solid background mode; switching to Animations hits the live thumbnail service, so the grid is empty in Storybook.',
  },
  {
    name: 'GaugeTrack', category: 'panel-kit',
    filePath: 'src/panel/widgets/monitoring/gauges/GaugeTrack.tsx',
    description: 'Shared accent fill track composed by MicroBar rows and the BarGauge tile. Clamps to 0-100; sized via --gauge-track-width/height/glow custom props on the caller\'s wrapper.',
    Preview: PreviewGaugeTrack,
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
    name: 'SizeIcons', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/SizeIcons.tsx',
    description: 'SIZE_ICONS record: one glyph per widget size (1x1 ... 4x4) used by the size selector in widget settings and the context menu resize row.',
    Preview: PreviewSizeIcons,
  },
  {
    name: 'IconPicker', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/IconPicker.tsx',
    description: 'Auto / Icons / Emoji tabbed picker for deck-button glyphs. Searches the lucide deck set, browses the emoji categories, Auto derives from the action or app. Returns a DeckIcon or undefined (auto).',
    Preview: PreviewIconPicker,
  },
  {
    name: 'WidgetEditSheet', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/WidgetEditSheet.tsx',
    description: 'Anchored edit sheet for widget settings: positions itself beside the widget cell (flipping to fit the viewport), hosts the widget\'s settings pane + size selector.',
    notes: 'No live preview - anchors to a real widget cell and edits live panel config.',
  },
  {
    name: 'ImmersiveLayout / ImmersiveCell', category: 'panel-kit',
    filePath: 'src/panel/widgets/common/ImmersiveLayout.tsx',
    description: 'Layout grid for a widget\'s fullscreen immersive page: cellsPerPage adapts to the panel orientation (2 stacked on portrait, 2 side-by-side on landscape, 3 on Y70 portrait). ImmersiveCell wraps each region.',
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
];
