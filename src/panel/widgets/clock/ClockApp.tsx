import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Binary, CircleDot, Clock3, FlipHorizontal, Globe2, Hash, Palette,
  Plus, RotateCw, ScanLine, X,
  type LucideIcon,
} from 'lucide-react';
import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { Toggle } from '../../../components/common/Toggle/Toggle';
import { useTranslation } from '../../../lib/i18n';
import { ClockWidget } from './ClockWidget';
import { CLOCK_DESIGNS } from './designs';
import { CITY_CATALOG, DEFAULT_CITY_IDS, getCity, type City } from './cities';
import { isDaylight } from './solar';
import { WorldClockMap } from './WorldClockMap';
import type { PanelWidget } from '../../types';
import styles from './ClockApp.module.scss';

/**
 * Desktop "app view" for the Clock widget. Two tabs:
 *
 *  • World — day/night map of the planet with the live solar
 *    terminator, the subsolar point, and live local times for cities
 *    the user has favourited. Cities pulled from a static catalog;
 *    a chip-style picker lets the user add / remove without leaving
 *    the page.
 *
 *  • Designs — the clock-as-tile preview plus the customisation
 *    controls (design picker, format, show-seconds / show-date,
 *    accent color, timezone).
 *
 * Settings persist to localStorage under `qos_clock_app`. The app
 * deliberately isn't bound to any single dashboard widget instance:
 * it's a standalone "Clocks" experience, like the system clock app
 * on iOS / macOS.
 */

type AppTab = 'world' | 'designs';

interface ClockAppState {
  design: string;
  format: '24h' | '12h';
  showSeconds: boolean;
  showDate: boolean;
  useAccentColor: boolean;
  timezone: string;
  cityIds: string[];
}

const STORAGE_KEY = 'qos_clock_app';

const DEFAULT_STATE: ClockAppState = {
  design: 'digital',
  format: '24h',
  showSeconds: false,
  showDate: true,
  useAccentColor: false,
  timezone: '',
  cityIds: [...DEFAULT_CITY_IDS],
};

function loadState(): ClockAppState {
  if (typeof window === 'undefined') return DEFAULT_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    // Validate cityIds against the catalog so a hand-edited blob
    // can't crash the world tab. Unknown ids get dropped silently.
    const cleanCityIds = Array.isArray(parsed.cityIds)
      ? parsed.cityIds.filter((id: unknown): id is string =>
          typeof id === 'string' && Boolean(getCity(id)))
      : DEFAULT_STATE.cityIds;
    return { ...DEFAULT_STATE, ...parsed, cityIds: cleanCityIds };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(state: ClockAppState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch { /* quota / private mode — ignore */ }
}

// Maps each design key to its lucide icon. Mirrors the panel ClockSettings
// mapping so the visual vocabulary stays consistent across both surfaces.
const DESIGN_ICONS: Record<string, LucideIcon> = {
  digital: Hash,
  analog: Clock3,
  splitflap: FlipHorizontal,
  rolling: RotateCw,
  led: ScanLine,
  dots: CircleDot,
  matrix: Binary,
};

const DESIGN_KEYS = Object.keys(CLOCK_DESIGNS);

export function ClockApp() {
  const { t } = useTranslation();
  const [state, setState] = useState<ClockAppState>(() => loadState());
  const [tab, setTab] = useState<AppTab>('world');
  const [now, setNow] = useState(() => new Date());

  // Map updates each minute — that's the granularity the terminator
  // visibly moves at, and per-city minute labels need the same beat.
  // The widget tile's own seconds tick is independent (see ClockWidget).
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const ms = 60_000 - (Date.now() % 60_000);
    let interval: number | null = null;
    const align = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 60_000);
    }, ms);
    return () => {
      window.clearTimeout(align);
      if (interval !== null) window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    saveState(state);
  }, [state]);

  const patch = useCallback((next: Partial<ClockAppState>) => {
    setState(prev => ({ ...prev, ...next }));
  }, []);

  const selectedCities = useMemo<City[]>(
    () => state.cityIds.map(id => getCity(id)).filter((c): c is City => Boolean(c)),
    [state.cityIds],
  );

  const addCity = useCallback((id: string) => {
    setState(prev => prev.cityIds.includes(id) ? prev : { ...prev, cityIds: [...prev.cityIds, id] });
  }, []);
  const removeCity = useCallback((id: string) => {
    setState(prev => ({ ...prev, cityIds: prev.cityIds.filter(x => x !== id) }));
  }, []);

  // Synthesise a PanelWidget shape so the existing ClockWidget renderer
  // can be reused verbatim for the preview. Same contract as the widget
  // tile in the panel grid — the design dispatcher reads off config.
  const previewWidget = useMemo<PanelWidget>(() => ({
    id: 'clock-app-preview',
    type: 'clock',
    size: '4x4',
    col: 0,
    row: 0,
    config: {
      design: state.design,
      format: state.format,
      showSeconds: state.showSeconds,
      showDate: state.showDate,
      useAccentColor: state.useAccentColor,
      // Empty string === "auto" (local). PanelConfigValue forbids
      // undefined, accepts null — collapse the empty input to null.
      timezone: state.timezone || null,
    },
  }), [state]);

  const tabs = [
    { key: 'world',   label: t('clock.app.tabWorld'),   icon: <Globe2 size={16} /> },
    { key: 'designs', label: t('clock.app.tabDesigns'), icon: <Palette size={16} /> },
  ];

  return (
    <div className={styles.app}>
      <ViewHeader
        title={t('nav.clock')}
        tabs={tabs}
        activeTab={tab}
        onTabChange={k => setTab(k as AppTab)}
      />
      {tab === 'world' ? (
        <WorldTabBody
          now={now}
          selectedCities={selectedCities}
          formatHour12={state.format === '12h'}
          onRemove={removeCity}
          onAdd={addCity}
        />
      ) : (
        <DesignsTabBody
          state={state}
          previewWidget={previewWidget}
          onPatch={patch}
        />
      )}
    </div>
  );
}

// ── World tab ───────────────────────────────────────────────────────────

interface WorldTabBodyProps {
  now: Date;
  selectedCities: City[];
  formatHour12: boolean;
  onRemove: (id: string) => void;
  onAdd: (id: string) => void;
}

function WorldTabBody({ now, selectedCities, formatHour12, onRemove, onAdd }: WorldTabBodyProps) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedIds = useMemo(() => new Set(selectedCities.map(c => c.id)), [selectedCities]);
  const availableCities = useMemo(
    () => CITY_CATALOG.filter(c => !selectedIds.has(c.id)),
    [selectedIds],
  );

  return (
    <div className={styles.worldBody}>
      <WorldClockMap now={now} cities={selectedCities} formatHour12={formatHour12} />

      <div className={styles.cityListHeader}>
        <span className={styles.sectionLabel}>{t('clock.app.cities')}</span>
        <button
          type="button"
          className={styles.addCityBtn}
          onClick={() => setPickerOpen(p => !p)}
        >
          <Plus size={14} />
          <span>{t('clock.app.addCity')}</span>
        </button>
      </div>

      {pickerOpen && (
        <div className={styles.cityPicker}>
          {availableCities.length === 0
            ? <span className={styles.cityPickerEmpty}>{t('clock.app.allCitiesAdded')}</span>
            : availableCities.map(c => (
              <button
                key={c.id}
                type="button"
                className={styles.cityChip}
                onClick={() => { onAdd(c.id); }}
              >
                <span className={styles.cityChipName}>{c.name}</span>
                <span className={styles.cityChipCountry}>{c.country}</span>
              </button>
            ))}
        </div>
      )}

      <div className={styles.cityList}>
        {selectedCities.map(c => (
          <CityRow
            key={c.id}
            city={c}
            now={now}
            formatHour12={formatHour12}
            onRemove={() => onRemove(c.id)}
          />
        ))}
        {selectedCities.length === 0 && (
          <div className={styles.cityListEmpty}>{t('clock.app.noCities')}</div>
        )}
      </div>
    </div>
  );
}

interface CityRowProps {
  city: City;
  now: Date;
  formatHour12: boolean;
  onRemove: () => void;
}

function CityRow({ city, now, formatHour12, onRemove }: CityRowProps) {
  const time = useMemo(() => formatLocalLong(now, city.tz, formatHour12), [now, city.tz, formatHour12]);
  const offset = useMemo(() => formatUtcOffset(now, city.tz), [now, city.tz]);
  const day = isDaylight(city.lat, city.lon, now);
  return (
    <div className={styles.cityRow} data-day={day ? 'true' : 'false'}>
      <div className={styles.cityRowLeft}>
        <div className={styles.cityRowName}>{city.name}</div>
        <div className={styles.cityRowSub}>{city.country} · {offset}</div>
      </div>
      <div className={styles.cityRowTime}>{time}</div>
      <button
        type="button"
        className={styles.cityRowRemove}
        onClick={onRemove}
        aria-label="Remove"
      >
        <X size={14} />
      </button>
    </div>
  );
}

function formatLocalLong(now: Date, tz: string, hour12: boolean): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12,
    }).format(now);
  } catch {
    return '--';
  }
}

function formatUtcOffset(now: Date, tz: string): string {
  // Re-derive the named timezone's UTC offset via the formatter parts so
  // we don't have to hardcode each tz's offset (and so DST is honored).
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'shortOffset',
    }).formatToParts(now);
    const tzName = parts.find(p => p.type === 'timeZoneName')?.value;
    if (tzName) return tzName.replace('GMT', 'UTC');
  } catch { /* fallthrough */ }
  return '';
}

// ── Designs tab ─────────────────────────────────────────────────────────

interface DesignsTabBodyProps {
  state: ClockAppState;
  previewWidget: PanelWidget;
  onPatch: (next: Partial<ClockAppState>) => void;
}

function DesignsTabBody({ state, previewWidget, onPatch }: DesignsTabBodyProps) {
  const { t } = useTranslation();
  return (
    <div className={styles.designsBody}>
      <div className={styles.designsGrid}>
        <div className={`${styles.cell} ${styles.cellPreview}`}>
          <div className={styles.cellPreviewInner}>
            <ClockWidget widget={previewWidget} surface="desktop" />
          </div>
        </div>

        <div className={`${styles.cell} ${styles.cellDesigns}`}>
          <div className={styles.cellLabel}>{t('clock.app.designs')}</div>
          <div className={styles.designChips}>
            {DESIGN_KEYS.map(key => {
              const Icon = DESIGN_ICONS[key];
              const entry = CLOCK_DESIGNS[key];
              return (
                <button
                  key={key}
                  type="button"
                  className={styles.designBtn}
                  data-active={key === state.design}
                  onClick={() => onPatch({ design: key })}
                >
                  {Icon && <Icon size={18} className={styles.designIcon} aria-hidden />}
                  <span>{entry.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`${styles.cell} ${styles.settingsCell}`}>
          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>{t('clock.app.format')}</span>
            <div className={styles.formatToggle} role="group" aria-label={t('clock.app.format')}>
              <button
                type="button"
                className={styles.formatBtn}
                data-active={state.format === '24h'}
                onClick={() => onPatch({ format: '24h' })}
              >
                {t('clock.app.format24')}
              </button>
              <button
                type="button"
                className={styles.formatBtn}
                data-active={state.format === '12h'}
                onClick={() => onPatch({ format: '12h' })}
              >
                {t('clock.app.format12')}
              </button>
            </div>
          </div>

          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>{t('clock.app.showSeconds')}</span>
            <Toggle checked={state.showSeconds} onChange={v => onPatch({ showSeconds: v })} />
          </div>

          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>{t('clock.app.showDate')}</span>
            <Toggle checked={state.showDate} onChange={v => onPatch({ showDate: v })} />
          </div>

          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>{t('clock.app.useAccentColor')}</span>
            <Toggle checked={state.useAccentColor} onChange={v => onPatch({ useAccentColor: v })} />
          </div>

          <div className={styles.settingsRow}>
            <span className={styles.settingsLabel}>{t('clock.app.timezone')}</span>
            <input
              type="text"
              className={styles.tzInput}
              value={state.timezone}
              onChange={e => onPatch({ timezone: e.target.value })}
              placeholder={t('clock.app.timezoneAuto')}
              spellCheck={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ClockApp;
