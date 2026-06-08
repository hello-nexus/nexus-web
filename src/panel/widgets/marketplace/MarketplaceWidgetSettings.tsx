import { useEffect, useMemo, useRef, useState } from 'react';
import type { WidgetSettingsProps } from '../types';
import {
  SettingsRow,
  SettingsSection,
  SettingsSelect,
  SettingsToggle,
} from '../common/SettingsRow/SettingsRow';
import { WidgetSettingsBridge } from '../../../widgets/settingsBridge';
import {
  getMarketplaceListing,
  loadMarketplaceWidgets,
  marketplaceIdFromType,
  subscribeMarketplaceRegistry,
} from '../../../widgets/marketplaceRegistry';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import {
  Hash, Clock3, ScanLine, RotateCw, CircleDot, FlipHorizontal, Binary,
  LayoutGrid, Sun, Palette, type LucideIcon,
} from 'lucide-react';
import styles from './MarketplaceWidgetSettings.module.scss';

// Icon names an `icon-select` option may reference (manifest optionIcons).
// Mirrors the native clock design switcher; extend as widgets need glyphs.
const SETTINGS_ICONS: Record<string, LucideIcon> = {
  hash: Hash, 'clock-3': Clock3, 'scan-line': ScanLine, 'rotate-cw': RotateCw,
  'circle-dot': CircleDot, 'flip-horizontal': FlipHorizontal, binary: Binary,
  grid: LayoutGrid, sun: Sun, palette: Palette,
};

type ManifestSettingType =
  | 'sensor'
  | 'rgb-profile'
  | 'color'
  | 'number'
  | 'boolean'
  | 'string'
  | 'select'
  | 'icon-select'
  | 'text';

interface ManifestSetting {
  key: string;
  type: ManifestSettingType;
  label?: string;
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  filter?: string;
  options?: string[];
  optionLabels?: string[];
  optionIcons?: string[];
}

const DEBOUNCE_MS = 200;

/**
 * Settings drawer for marketplace widgets. Read-only schema → fixed-shape
 * controls. The widget never draws its own settings UI; the panel host owns
 * the chrome so configuring a marketplace widget is visually identical to
 * configuring any first-party widget (iOS-style locked layout).
 *
 * Storage is via `WidgetSettingsBridge` (nexus-service settings doc), NOT
 * `widget.config` - the Tier 2 worker reads values via `nexus.settings.get()`,
 * and the bridge's `nexus.settings.changed` notification re-runs the widget.
 */
export function MarketplaceWidgetSettings({ widget }: WidgetSettingsProps) {
  const id = marketplaceIdFromType(widget.type) ?? '';

  const [listing, setListing] = useState(() => (id ? getMarketplaceListing(id) : undefined));
  const [values, setValues] = useState<Record<string, unknown>>({});
  // Bridge is keyed by placement id (per-instance) so two placements of the
  // same marketplace widget keep separate settings.
  const bridge = useMemo(() => (widget.id ? new WidgetSettingsBridge(widget.id) : null), [widget.id]);

  // Sync the listing with the dynamic registry (covers the case where the
  // settings drawer opens before the catalog refresh has landed).
  useEffect(() => {
    if (!id) return;
    if (!getMarketplaceListing(id)) void loadMarketplaceWidgets();
    const unsub = subscribeMarketplaceRegistry(() => setListing(getMarketplaceListing(id)));
    return unsub;
  }, [id]);

  // Load persisted values + subscribe to changes from anywhere else the
  // settings might be edited.
  useEffect(() => {
    if (!bridge) return;
    void bridge.load().then((v) => setValues(v));
    const unsub = bridge.onChange((v) => setValues({ ...v }));
    return unsub;
  }, [bridge]);

  const schema: ManifestSetting[] = useMemo(() => {
    const raw = (listing as unknown as { settings?: ManifestSetting[] })?.settings;
    return Array.isArray(raw) ? raw : [];
  }, [listing]);

  // Per-key debounce so a color drag emits one PATCH, not 60.
  const pending = useRef<Record<string, unknown>>({});
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    pending.current[key] = value;
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      const buffered = pending.current;
      pending.current = {};
      if (bridge && Object.keys(buffered).length > 0) {
        void bridge.patch({ set: buffered });
      }
    }, DEBOUNCE_MS);
  };
  useEffect(() => () => {
    if (flushTimer.current) {
      clearTimeout(flushTimer.current);
      const buffered = pending.current;
      pending.current = {};
      if (bridge && Object.keys(buffered).length > 0) {
        void bridge.patch({ set: buffered });
      }
    }
  }, [bridge]);

  if (!id) return <div className={styles.empty}>missing widget id</div>;
  if (!listing) return <div className={styles.empty}>loading…</div>;
  if (schema.length === 0) return <div className={styles.empty}>this widget has no settings.</div>;

  return (
    <SettingsSection title={listing.name}>
      {schema.map((entry) => (
        <SettingControl
          key={entry.key}
          entry={entry}
          value={values[entry.key] ?? entry.default}
          onChange={(v) => queue(entry.key, v)}
        />
      ))}
    </SettingsSection>
  );
}

interface ControlProps {
  entry: ManifestSetting;
  value: unknown;
  onChange: (next: unknown) => void;
}

function SettingControl({ entry, value, onChange }: ControlProps) {
  const label = entry.label ?? entry.key;
  switch (entry.type) {
    case 'boolean':
      return (
        <SettingsToggle
          label={label}
          checked={asBoolean(value)}
          onChange={(b) => onChange(b)}
        />
      );
    case 'select':
      return (
        <SettingsSelect
          label={label}
          value={asString(value)}
          options={(entry.options ?? []).map((o) => ({ value: o, label: o }))}
          onChange={(s) => onChange(s)}
        />
      );
    case 'icon-select': {
      // Native-style visual switcher: one IconLabelButton per option, full-width
      // (label on top, buttons below). icon + label come from the manifest's
      // parallel optionIcons / optionLabels.
      const current = asString(value);
      const opts = entry.options ?? [];
      return (
        <div className={styles.iconSelect}>
          <span className={styles.iconSelectLabel}>{label}</span>
          <div className={styles.iconSelectGrid}>
            {opts.map((opt, i) => {
              const Icon = SETTINGS_ICONS[entry.optionIcons?.[i] ?? ''];
              return (
                <IconLabelButton
                  key={opt}
                  active={opt === current}
                  icon={Icon ? <Icon aria-hidden="true" /> : undefined}
                  label={entry.optionLabels?.[i] ?? opt}
                  onPress={() => onChange(opt)}
                />
              );
            })}
          </div>
        </div>
      );
    }
    case 'color':
      return (
        <SettingsRow label={label}>
          <input
            type="color"
            value={normaliseHex(asString(value)) ?? '#ff8800'}
            onChange={(e) => onChange(e.target.value)}
            className={styles.colorInput}
            aria-label={label}
          />
        </SettingsRow>
      );
    case 'number':
      return (
        <SettingsRow label={label}>
          <input
            type="number"
            className={styles.numberInput}
            value={asNumber(value, entry)}
            min={entry.min}
            max={entry.max}
            step={entry.step ?? 1}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onChange(n);
            }}
            aria-label={label}
          />
        </SettingsRow>
      );
    case 'text':
      return (
        <SettingsRow label={label}>
          <textarea
            className={styles.textArea}
            value={asString(value)}
            rows={3}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
          />
        </SettingsRow>
      );
    case 'sensor':
    case 'rgb-profile':
    case 'string':
    default:
      // sensor / rgb-profile have no dedicated picker yet: render the
      // string input so the author types the id directly. Manifest
      // defaults work without input.
      return (
        <SettingsRow label={label}>
          <input
            type="text"
            className={styles.stringInput}
            value={asString(value)}
            placeholder={entry.filter}
            onChange={(e) => onChange(e.target.value)}
            aria-label={label}
          />
        </SettingsRow>
      );
  }
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  return String(value);
}

function asNumber(value: unknown, entry: ManifestSetting): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(n)) return n;
  return typeof entry.default === 'number' ? entry.default : 0;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function normaliseHex(raw: string): string | null {
  if (!raw) return null;
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw : null;
}
