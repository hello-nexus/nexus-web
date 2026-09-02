import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, FolderInput, FolderOpen, Plus, Trash2 } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { Button } from '../../../components/common/Button/Button';
import { useTranslation } from '../../../lib/i18n';
import { DECK_SWATCHES } from '../../../lib/settings';
import { fetchService, isDirectActive, isRelayActive, pickSystemPath } from '../../../api/service';
import { isMacAppShell, isWindowsAppShell } from '../../../app/windowActions';
import { useSensors } from '../../../hooks/useSensors';
import { EMPTY_SENSOR_EXTRAS } from '../../../hooks/useSensorExtras';
import { CollapsibleSection } from '../../../components/common/CollapsibleSection/CollapsibleSection';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { ChipGroup } from '../../../components/common/ChipGroup/ChipGroup';
import { Select } from '../../../components/common/Select/Select';
import { SearchInput } from '../../../components/common/SearchInput/SearchInput';
import { Slider } from '../../../components/common/Slider/Slider';
import { SectionHeader } from '../../../components/common/SectionHeader/SectionHeader';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import { TextInput } from '../../../components/common/TextInput/TextInput';
import { SettingsSection, SettingsRow, SettingsToggle, SettingsSelect } from '../common/SettingsRow/SettingsRow';
import { AppPicker } from '../common/AppPicker';
import { IconPicker, type Tab as IconPickerTab } from '../common/IconPicker';
import { DesktopOnlyBadge } from '../../../components/common/DesktopOnlyBadge/DesktopOnlyBadge';
import { canEditFreeText } from '../../types';
import type { PanelSurface } from '../../types';
import { HotkeyInput } from './HotkeyInput';
import { padSlots } from './deckLayout';
import { resolveTargetView, slotCountAtDepth, type DeckTarget } from './deckTarget';
import {
  DECK_TITLE_FONTS, DECK_TITLE_SIZE_OPTIONS, resolveDeckTitleStyle, type DeckTitleAlign,
} from './deckTitleStyle';
import { DECK_ICONS, autoIconName } from './deckIcons';
import { DECK_MONITORING_CATEGORIES, resolveMonitoringSensor } from './deckMonitoring';
import { CATEGORY_LABEL_KEYS, selectedSensorValue, sensorsForDevice, visibleDeviceKeys } from '../monitoring/sensorPicker';
import { labelForDevice } from '../monitoring/MonitoringWidget';
import { LabelControls, SCALE_OPTIONS, parseFixedRangeInput } from '../monitoring/MonitoringSettings';
import { DESIGN_ICONS } from '../monitoring/gauges/DesignIcons';
import { defaultFixedMax } from '../monitoring/perfDomain';
import { WeatherLocationSearch } from '../weather/WeatherLocationSearch';
import type { WeatherGeocodeResult } from '../../../api/weather';
import { ANIMATE_EFFECTS } from '../../../types/lighting';
import { PRIVILEGED_DECK_ACTION_TYPES } from './deckExecutor';
import type {
  DeckAction, DeckActionType, DeckLightingMode, DeckMonitoringCategory, DeckMonitoringPress,
  DeckMonitoringStyle, DeckNexusAction, DeckNexusOp, DeckSlot, DeckTitleStyle,
} from './types';
import styles from './DeckKeyInspector.module.scss';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// A phone-companion session gets 403 from the service when it saves a layout
// introducing one of these action types (PanelRoutes' DeckLayoutPolicy) -
// authoring them is desktop-app-only. `desktopEditor` overrides this: the
// desktop app's own device page can edit another panel's (including a
// phone's) deck layout, and that save still carries the desktop token.
function isPrivilegedPickerKind(kind: DeckPickerKind): boolean {
  return (PRIVILEGED_DECK_ACTION_TYPES as ReadonlySet<string>).has(kind);
}

function deckAuthoringLocked(surface?: PanelSurface, desktopEditor?: boolean): boolean {
  return surface === 'phone' && !desktopEditor;
}

// NOTE: audioOutput / audioInput are intentionally omitted from every
// category - switching the default audio endpoint needs IPolicyConfig in the
// user session and isn't reliably verifiable yet (see deck plan: deferred).
// The action kinds + backend route remain for a future verified re-enable;
// they're just not offered here.
// 'monitoring' is a standalone live-display key type (like 'sequence' or
// 'toggle'), not a nestable sub-action, so it's excluded from NESTED_KINDS the
// same way those are - a sequence step or toggle branch fires once on press,
// which doesn't fit a continuously-rendered sensor tile.
const NESTED_KINDS: DeckPickerKind[] = [
  'launchApp', 'openUrl', 'openFile', 'openFolder', 'system', 'hotkey', 'hotkeySwitch',
  'text', 'power', 'lighting', 'cooling', 'y70', 'deckBrightness', 'deckSleep', 'playAudio',
];

// deckBrightness/deckSleep control a physical Stream Deck's own screen (see
// deckExecutor's no-op comment); on a widget target they'd be a silent dead
// button, so they're filtered out of every picker (top-level and nested
// sequence/toggle steps) unless the target is a physical deck.
const PHYSICAL_ONLY_KINDS = new Set(['deckBrightness', 'deckSleep']);

function kindsForTarget<K extends string>(kinds: K[], targetKind: DeckTarget['kind']): K[] {
  return targetKind === 'physical' ? kinds : kinds.filter(k => !PHYSICAL_ONLY_KINDS.has(k));
}

// A slot's action-type picker is two-tier (category, then a kind within it),
// mirroring Elgato's own action browser. Most kinds map 1:1 onto DeckAction's
// `type` discriminant; 'folder' has no action (it's slot.folder), and the
// page-navigate action's three ops (prev/next/goto) are split into distinct
// picker entries so each shows as its own Navigation item instead of one
// "Page" entry plus a nested op selector.
// 'nexus' is not a picker kind: the one "Nexus device" entry is split into
// Lighting / Cooling / Y70, each seeding the same `nexus` DeckAction with an op
// from its own group, so the picker lists them beside Monitoring and Weather
// instead of hiding all eight ops behind one entry.
export type DeckPickerKind =
  | Exclude<DeckActionType, 'page' | 'nexus'>
  | 'folder' | 'pagePrev' | 'pageNext' | 'pageGoto'
  | 'lighting' | 'cooling' | 'y70';

/** Which picker entry (and op dropdown) a nexus op belongs to. */
export const NEXUS_OP_GROUPS = {
  lighting: ['rgbEffect', 'lightingBrightness', 'lightingPreset'],
  cooling: ['fanProfile', 'coolingPreset'],
  y70: ['y70Power', 'y70Brightness', 'y70Rotation'],
} as const satisfies Record<'lighting' | 'cooling' | 'y70', readonly DeckNexusOp[]>;

export type DeckNexusGroup = keyof typeof NEXUS_OP_GROUPS;

export function nexusGroupForOp(op: DeckNexusOp): DeckNexusGroup {
  if ((NEXUS_OP_GROUPS.cooling as readonly string[]).includes(op)) return 'cooling';
  if ((NEXUS_OP_GROUPS.y70 as readonly string[]).includes(op)) return 'y70';
  return 'lighting';
}

interface DeckActionCategory {
  key: 'navigation' | 'streamdeck' | 'system' | 'nexus' | 'multi';
  labelKey: string;
  kinds: DeckPickerKind[];
}

const DECK_ACTION_CATEGORIES: DeckActionCategory[] = [
  {
    key: 'navigation',
    labelKey: 'panel.settings.deck.category.navigation',
    kinds: ['folder', 'pagePrev', 'pageNext', 'pageGoto', 'pageIndicator'],
  },
  {
    key: 'streamdeck',
    labelKey: 'panel.settings.deck.category.streamdeck',
    kinds: ['deckBrightness', 'deckSleep'],
  },
  {
    key: 'system',
    labelKey: 'panel.settings.deck.category.system',
    kinds: ['launchApp', 'openUrl', 'openFile', 'openFolder', 'system', 'hotkey', 'hotkeySwitch', 'text', 'power', 'playAudio'],
  },
  {
    key: 'nexus',
    labelKey: 'panel.settings.deck.category.nexus',
    kinds: ['lighting', 'cooling', 'y70', 'monitoring', 'weather'],
  },
  {
    key: 'multi',
    labelKey: 'panel.settings.deck.category.multiAction',
    kinds: ['sequence', 'toggle'],
  },
];

/** The picker entry an action maps back to, so the list highlights it and a
 *  nested step's type select shows what it currently holds. */
function actionPickerKind(a: DeckAction | undefined): DeckPickerKind {
  if (!a) return 'launchApp';
  if (a.type === 'page') return a.op === 'goto' ? 'pageGoto' : a.op === 'prev' ? 'pagePrev' : 'pageNext';
  if (a.type === 'nexus') return nexusGroupForOp(a.action.op);
  return a.type;
}

function actionToPickerKind(slot: DeckSlot): DeckPickerKind {
  return slot.folder ? 'folder' : actionPickerKind(slot.action);
}

function categoryForKind(kind: DeckPickerKind): DeckActionCategory {
  return DECK_ACTION_CATEGORIES.find(c => c.kinds.includes(kind)) ?? DECK_ACTION_CATEGORIES[1];
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.field}><SectionHeader>{label}</SectionHeader>{children}</div>;
}

export function defaultActionFor(kind: DeckActionType): DeckAction {
  switch (kind) {
    case 'launchApp': return { type: 'launchApp', appId: '' };
    case 'openUrl': return { type: 'openUrl', url: '' };
    case 'openFile': return { type: 'openFile', path: '' };
    case 'openFolder': return { type: 'openFolder', path: '' };
    case 'system': return { type: 'system', action: { op: 'volumeUp' } };
    case 'hotkey': return { type: 'hotkey', keys: '' };
    case 'text': return { type: 'text', text: '' };
    case 'power': return { type: 'power', action: 'lock' };
    case 'audioOutput': return { type: 'audioOutput', deviceId: '' };
    case 'audioInput': return { type: 'audioInput', deviceId: '' };
    case 'nexus': return { type: 'nexus', action: defaultNexusAction('rgbEffect') };
    case 'monitoring': return {
      type: 'monitoring', category: 'quick', sensor: 'summary/cpu-usage', style: 'line', showName: true, press: 'none',
    };
    case 'weather': return { type: 'weather', units: 'auto' };
    case 'playAudio': return { type: 'playAudio', path: '', volume: 100 };
    case 'sequence': return { type: 'sequence', steps: [] };
    case 'toggle': return { type: 'toggle', on: { type: 'system', action: { op: 'muteToggle' } }, off: { type: 'system', action: { op: 'muteToggle' } }, state: { kind: 'mute' } };
    case 'page': return { type: 'page', op: 'next' };
    case 'pageIndicator': return { type: 'pageIndicator' };
    case 'deckBrightness': return { type: 'deckBrightness', op: 'set', value: 50 };
    case 'deckSleep': return { type: 'deckSleep' };
    case 'hotkeySwitch': return { type: 'hotkeySwitch', keysA: '', keysB: '' };
  }
}

function defaultActionForPickerKind(kind: Exclude<DeckPickerKind, 'folder'>): DeckAction {
  switch (kind) {
    case 'pagePrev': return { type: 'page', op: 'prev' };
    case 'pageNext': return { type: 'page', op: 'next' };
    case 'pageGoto': return { type: 'page', op: 'goto', target: 0 };
    case 'lighting':
    case 'cooling':
    case 'y70': return { type: 'nexus', action: defaultNexusAction(NEXUS_OP_GROUPS[kind][0]) };
    default: return defaultActionFor(kind);
  }
}

/**
 * The slot a picker kind produces, keeping the target slot's icon/label/color.
 * A freshly bound slot (no title yet) inherits the deck's default title style.
 * Shared by click-to-pick and drag-drop-onto-a-slot so both assign identically.
 */
export function slotForPickerKind(kind: DeckPickerKind, base: DeckSlot = {}, titleDefault?: DeckTitleStyle): DeckSlot {
  const title = base.title ?? (titleDefault ? { ...titleDefault } : undefined);
  if (kind === 'folder') return { ...base, title, action: undefined, folder: base.folder ?? { slots: [] } };
  return { ...base, title, folder: undefined, action: defaultActionForPickerKind(kind) };
}

/**
 * Lucide icon for a picker kind, matching a bound slot's auto-icon. 'power'
 * is special-cased to the generic Power glyph rather than defaultActionForPickerKind's
 * sub-op (lock) - an on-key auto icon stays sub-op aware via autoIconName.
 */
export function pickerKindIcon(kind: DeckPickerKind) {
  const name = kind === 'folder' ? 'Folder' : kind === 'power' ? 'Power' : autoIconName(defaultActionForPickerKind(kind));
  return DECK_ICONS[name] ?? Plus;
}

function useServiceOptions(path: string, map: (data: unknown) => { value: string; label: string }[]): { value: string; label: string }[] {
  const [opts, setOpts] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchService(path).then(d => { if (!cancelled) setOpts(map(d) ?? []); }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return opts;
}

function SelectField({ label, value, options, onChange, disabled }: { label: string; value: string; options: { value: string; label: string; disabled?: boolean }[]; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <Field label={label}>
      <Select className={styles.selectWide} value={value} options={options} onChange={onChange} ariaLabel={label} disabled={disabled} />
    </Field>
  );
}

function ActionEditor({ action, onChange, showType, allowed, surface, desktopEditor, pageCount }: {
  action: DeckAction; onChange: (a: DeckAction) => void; showType: boolean; allowed: DeckPickerKind[]; surface?: PanelSurface; desktopEditor?: boolean; pageCount?: number;
}) {
  const { t } = useTranslation();
  const locked = deckAuthoringLocked(surface, desktopEditor);
  return (
    <>
      {showType && (
        <SelectField
          label={t('panel.settings.deck.actionType')}
          value={actionPickerKind(action)}
          options={allowed.map(k => ({ value: k, label: t(`panel.settings.deck.action.${k}`), disabled: locked && isPrivilegedPickerKind(k) }))}
          onChange={k => onChange(defaultActionForPickerKind(k as Exclude<DeckPickerKind, 'folder'>))}
        />
      )}
      <ActionFields action={action} onChange={onChange} allowed={allowed} surface={surface} desktopEditor={desktopEditor} pageCount={pageCount} />
    </>
  );
}

function ActionFields({ action, onChange, allowed, surface, desktopEditor, pageCount }: {
  action: DeckAction; onChange: (a: DeckAction) => void; allowed: DeckPickerKind[]; surface?: PanelSurface; desktopEditor?: boolean; pageCount?: number;
}) {
  const { t } = useTranslation();
  const audioOut = useServiceOptions('/system/audio/devices', d => ((d as { outputs?: { id: string; name: string }[] })?.outputs ?? []).map(x => ({ value: x.id, label: x.name })));
  const audioIn = useServiceOptions('/system/audio/devices', d => ((d as { inputs?: { id: string; name: string }[] })?.inputs ?? []).map(x => ({ value: x.id, label: x.name })));
  const displays = useServiceOptions('/displays', d => ((d as { displays?: { id: string; name?: string; label?: string }[] })?.displays ?? []).map(x => ({ value: x.id, label: x.name ?? x.label ?? x.id })));
  // The native picker dialog runs on the host PC and can stay open for as
  // long as the user takes to answer it - this only guards against a
  // double-click re-opening a second dialog, not a brief request gap.
  const [browsing, setBrowsing] = useState(false);
  const locked = deckAuthoringLocked(surface, desktopEditor);

  switch (action.type) {
    case 'launchApp':
      // No wrapping Field label: the Action box header already reads "Launch app".
      return <AppPicker selectedId={action.appId} onSelect={app => onChange({ type: 'launchApp', appId: app.id })} />;
    case 'openUrl': {
      const canType = canEditFreeText(surface, desktopEditor);
      return (
        <Field label={t('panel.settings.url')}>
          {/* eslint-disable-next-line i18next/no-literal-string -- example URL placeholder */}
          <input className={styles.input} type="text" value={action.url} placeholder="https://example.com" readOnly={!canType} disabled={!canType} onChange={e => onChange({ ...action, url: e.target.value })} />
          {!canType && <DesktopOnlyBadge />}
        </Field>
      );
    }
    case 'openFile':
    case 'openFolder': {
      const folder = action.type === 'openFolder';
      // The native dialog only exists on the desktop app shells talking
      // directly to the local service - a relay/direct remote session has no
      // host PC screen to show it on, same reasoning as canEditFreeText's own
      // desktopEditor-forced-true case not implying a real shell is present.
      const canBrowse = canEditFreeText(surface, desktopEditor)
        && (isWindowsAppShell() || isMacAppShell())
        && !isRelayActive() && !isDirectActive();
      const handleBrowse = async () => {
        setBrowsing(true);
        try {
          const path = await pickSystemPath(folder);
          if (path) onChange({ ...action, path });
        } finally {
          setBrowsing(false);
        }
      };
      return (
        <Field label={t('panel.settings.deck.path')}>
          <div className={styles.pathRow}>
            <input className={styles.input} type="text" value={action.path} readOnly={locked} disabled={locked} onChange={e => onChange({ ...action, path: e.target.value })} />
            {canBrowse && (
              <Button type="button" size="sm" tone="neutral" icon={<FolderOpen size={14} aria-hidden />} disabled={browsing} onClick={handleBrowse}>
                {t('panel.settings.deck.browse')}
              </Button>
            )}
          </div>
          {locked && <DesktopOnlyBadge />}
        </Field>
      );
    }
    case 'system': {
      const a = action.action;
      const ops = ['volumeUp', 'volumeDown', 'volumeSet', 'muteToggle', 'mediaPlayPause', 'mediaNext', 'mediaPrev', 'brightnessUp', 'brightnessDown', 'brightnessSet', 'openSettings'];
      return (
        <>
          <SelectField label={t('panel.settings.deck.systemOp')} value={a.op} options={ops.map(o => ({ value: o, label: t(`panel.settings.deck.system.${o}`) }))} onChange={op => onChange({ type: 'system', action: { ...a, op: op as typeof a.op } })} />
          {a.op === 'volumeSet' && <Field label={t('panel.settings.deck.value')}><input className={styles.input} type="number" min={0} max={100} value={Math.round((a.value ?? 0) * 100)} onChange={e => onChange({ type: 'system', action: { ...a, value: clamp(Number(e.target.value) / 100, 0, 1) } })} /></Field>}
          {a.op === 'brightnessSet' && <Field label={t('panel.settings.deck.value')}><input className={styles.input} type="number" min={0} max={100} value={a.value ?? 0} onChange={e => onChange({ type: 'system', action: { ...a, value: clamp(Number(e.target.value), 0, 100) } })} /></Field>}
          {(a.op === 'brightnessUp' || a.op === 'brightnessDown' || a.op === 'brightnessSet') && (
            <SelectField label={t('panel.settings.deck.display')} value={a.displayId ?? ''} options={displays} onChange={id => onChange({ type: 'system', action: { ...a, displayId: id } })} />
          )}
        </>
      );
    }
    case 'hotkey':
      return (
        <Field label={t('panel.settings.deck.hotkey')}>
          <HotkeyInput value={action.keys} onChange={keys => onChange({ ...action, keys })} disabled={locked} />
          {locked && <DesktopOnlyBadge />}
        </Field>
      );
    case 'hotkeySwitch':
      return (
        <>
          <Field label={t('panel.settings.deck.hotkeySwitch.firstPress')}>
            <HotkeyInput value={action.keysA} onChange={keysA => onChange({ ...action, keysA })} disabled={locked} />
            {locked && <DesktopOnlyBadge />}
          </Field>
          <Field label={t('panel.settings.deck.hotkeySwitch.secondPress')}>
            <HotkeyInput value={action.keysB} onChange={keysB => onChange({ ...action, keysB })} disabled={locked} />
          </Field>
        </>
      );
    case 'text':
      return (
        <Field label={t('panel.settings.deck.text')}>
          <textarea className={styles.input} value={action.text} rows={2} readOnly={locked} disabled={locked} onChange={e => onChange({ ...action, text: e.target.value })} />
          {locked && <DesktopOnlyBadge />}
        </Field>
      );
    case 'power': {
      const ops = ['lock', 'sleep', 'shutdown', 'restart', 'logout'];
      return <SelectField label={t('panel.settings.deck.powerOp')} value={action.action} options={ops.map(o => ({ value: o, label: t(`panel.settings.deck.power.${o}`) }))} onChange={op => onChange({ type: 'power', action: op as 'lock' })} />;
    }
    case 'audioOutput':
      return <SelectField label={t('panel.settings.deck.audioOutput')} value={action.deviceId} options={audioOut} onChange={id => onChange({ type: 'audioOutput', deviceId: id })} />;
    case 'audioInput':
      return <SelectField label={t('panel.settings.deck.audioInput')} value={action.deviceId} options={audioIn} onChange={id => onChange({ type: 'audioInput', deviceId: id })} />;
    case 'deckBrightness': {
      const ops = ['set', 'up', 'down'];
      return (
        <>
          <SelectField
            label={t('panel.settings.deck.deckBrightnessOp')}
            value={action.op}
            options={ops.map(o => ({ value: o, label: t(`panel.settings.deck.deckBrightness.${o}`) }))}
            onChange={op => onChange({ ...action, op: op as typeof action.op })}
          />
          {action.op === 'set' && (
            <Slider
              // eslint-disable-next-line i18next/no-literal-string -- Slider orientation enum value
              orientation="stacked"
              editable
              trackFill
              label={t('panel.settings.deck.value')}
              ariaLabel={t('panel.settings.deck.value')}
              value={action.value ?? 50}
              min={0}
              max={100}
              onChange={v => onChange({ ...action, value: clamp(Math.round(v), 0, 100) })}
            />
          )}
          {action.op !== 'set' && (
            <Field label={t('panel.settings.deck.step')}>
              <input className={styles.input} type="number" min={1} max={100} value={action.step ?? 10} onChange={e => onChange({ ...action, step: clamp(Number(e.target.value), 1, 100) })} />
            </Field>
          )}
        </>
      );
    }
    case 'deckSleep':
      return <p className={styles.description}>{t('panel.settings.deck.deckSleepDescription')}</p>;
    case 'nexus':
      return <NexusFields action={action} onChange={onChange} />;
    case 'monitoring':
      return <MonitoringFields action={action} onChange={onChange} surface={surface} desktopEditor={desktopEditor} />;
    case 'weather':
      return <WeatherFields action={action} onChange={onChange} surface={surface} desktopEditor={desktopEditor} />;
    case 'playAudio':
      return <PlayAudioFields action={action} onChange={onChange} surface={surface} desktopEditor={desktopEditor} />;
    case 'sequence':
      return <SequenceEditor action={action} onChange={onChange} allowed={allowed} surface={surface} desktopEditor={desktopEditor} />;
    case 'toggle':
      return <ToggleEditor action={action} onChange={onChange} allowed={allowed} surface={surface} desktopEditor={desktopEditor} />;
    case 'page':
      return action.op === 'goto' ? (
        <SelectField
          label={t('panel.settings.deck.targetPage')}
          value={String(action.target ?? 0)}
          options={Array.from({ length: Math.max(1, pageCount ?? 1) }, (_, i) => ({ value: String(i), label: t('panel.settings.deck.page.tab', { n: i + 1 }) }))}
          onChange={v => onChange({ ...action, target: Number(v) })}
        />
      ) : null;
    case 'pageIndicator':
      return null;
    default:
      return null;
  }
}

// Stable identity so the seeding effect below does not re-run for the ops
// that have no preset list at all.
const EMPTY_OPTIONS: { value: string; label: string }[] = [];

// The three live lighting modes a key can start. Static and Game Sync are
// deliberately absent: neither is a one-press mode (Static needs a per-device
// colour assignment, Game Sync needs a running detected game).
const NEXUS_LIGHTING_MODES: DeckLightingMode[] = ['animate', 'gif', 'screen'];

// Same keys FanProfiles.GetBuiltInProfiles() canonicalizes to; "off" (BIOS
// control) and the legacy "auto" synonym are not offered as a key action.
const NEXUS_COOLING_MODES = ['silent', 'balanced', 'turbo', 'custom'];

/**
 * A freshly picked op carries every field its executor branch reads, so a key
 * fires correctly the moment it is bound - the old shape left `profile` /
 * `effect` undefined until the second dropdown was touched, and the executor
 * silently no-opped on those keys.
 */
export function defaultNexusAction(op: DeckNexusOp): DeckNexusAction {
  switch (op) {
    case 'rgbEffect': return { op, mode: 'animate', effect: ANIMATE_EFFECTS[0].key };
    case 'lightingBrightness': return { op, value: 1 };
    case 'fanProfile': return { op, profile: 'balanced' };
    case 'y70Power': return { op, on: true };
    case 'y70Brightness': return { op, value: 50 };
    case 'y70Rotation': return { op, orientation: 'landscape' };
    // The preset ops seed from live service data instead - see the effect below.
    default: return { op };
  }
}

function NexusFields({ action, onChange }: { action: Extract<DeckAction, { type: 'nexus' }>; onChange: (a: DeckAction) => void }) {
  const { t } = useTranslation();
  const a = action.action;
  const set = (patch: Partial<DeckNexusAction>) => onChange({ type: 'nexus', action: { ...a, ...patch } });
  // Only this entry's own ops. Switching group is done by picking a different
  // action in the picker, so the dropdown stays 2-3 entries instead of eight.
  const groupOps: readonly DeckNexusOp[] = NEXUS_OP_GROUPS[nexusGroupForOp(a.op)];

  const lightingPresets = useServiceOptions('/devices/lighting-devices/layout-presets', d => {
    const list = (d as { presets?: { id: string; name: string }[] } | null)?.presets ?? [];
    return list.map(p => ({ value: p.id, label: p.name }));
  });
  const coolingPresets = useServiceOptions('/cooling/presets', d => {
    const list = (d as { presets?: { id: string; name: string }[] } | null)?.presets ?? [];
    return list.map(p => ({ value: p.id, label: p.name }));
  });
  const isPreset = a.op === 'lightingPreset' || a.op === 'coolingPreset';
  const presets = useMemo(
    () => (a.op === 'lightingPreset' ? lightingPresets : a.op === 'coolingPreset' ? coolingPresets : EMPTY_OPTIONS),
    [a.op, lightingPresets, coolingPresets],
  );
  const presetValue = presets.some(p => p.value === a.presetId) ? a.presetId ?? '' : '';

  // A preset list can only be seeded once it has loaded, and has to re-seed
  // when the stored id names a preset that has since been deleted - otherwise
  // the select renders blank and the key fires nothing.
  useEffect(() => {
    if (isPreset && presets.length > 0 && !presetValue) {
      onChange({ type: 'nexus', action: { ...a, presetId: presets[0].value } });
    }
  }, [isPreset, presets, presetValue, a, onChange]);

  return (
    <>
      <SelectField
        label={t('panel.settings.deck.nexusOp')}
        value={a.op}
        options={groupOps.map(o => ({ value: o, label: t(`panel.settings.deck.nexus.${o}`) }))}
        onChange={op => onChange({ type: 'nexus', action: defaultNexusAction(op as DeckNexusOp) })}
      />
      {a.op === 'rgbEffect' && (
        <SelectField
          label={t('panel.settings.deck.lightingMode')}
          value={a.mode ?? 'animate'}
          options={NEXUS_LIGHTING_MODES.map(m => ({ value: m, label: t(`lighting.mode.${m}`) }))}
          // The effect is kept across a mode change rather than cleared: the
          // executor reads it only in Animation, and dropping it would lose the
          // user's pick on a round trip through Media or Mirror.
          onChange={m => set({ mode: m as DeckLightingMode, effect: a.effect ?? ANIMATE_EFFECTS[0].key })}
        />
      )}
      {a.op === 'rgbEffect' && (a.mode ?? 'animate') === 'animate' && (
        <SelectField
          label={t('panel.settings.deck.effect')}
          value={a.effect ?? ANIMATE_EFFECTS[0].key}
          options={ANIMATE_EFFECTS.map(e => ({ value: e.key, label: t(e.labelKey) }))}
          onChange={effect => set({ effect })}
        />
      )}
      {a.op === 'lightingBrightness' && (
        <Slider
          // eslint-disable-next-line i18next/no-literal-string -- Slider orientation enum value
          orientation="stacked"
          editable
          trackFill
          label={t('panel.settings.deck.value')}
          ariaLabel={t('panel.settings.deck.value')}
          value={Math.round((a.value ?? 1) * 100)}
          min={0}
          max={100}
          onChange={v => set({ value: clamp(Math.round(v) / 100, 0, 1) })}
        />
      )}
      {isPreset && (presets.length > 0 ? (
        <SelectField
          label={t('panel.settings.deck.preset')}
          value={presetValue}
          options={presets}
          onChange={presetId => set({ presetId })}
        />
      ) : (
        <Field label={t('panel.settings.deck.preset')}>
          <p className={styles.description}>{t('panel.settings.deck.noPresets')}</p>
        </Field>
      ))}
      {a.op === 'fanProfile' && (
        <SelectField
          label={t('panel.settings.deck.coolingMode')}
          value={a.profile ?? 'balanced'}
          options={NEXUS_COOLING_MODES.map(p => ({ value: p, label: t(`cooling.mode.${p}`) }))}
          onChange={profile => set({ profile })}
        />
      )}
      {/* eslint-disable-next-line i18next/no-literal-string -- option enum values */}
      {a.op === 'y70Power' && <SelectField label={t('panel.settings.deck.on')} value={(a.on ?? true) ? 'yes' : 'no'} options={[{ value: 'yes', label: t('panel.settings.deck.stateOn') }, { value: 'no', label: t('panel.settings.deck.stateOff') }]} onChange={v => set({ on: v === 'yes' })} />}
      {a.op === 'y70Brightness' && <Field label={t('panel.settings.deck.value')}><input className={styles.input} type="number" min={0} max={100} value={a.value ?? 0} onChange={e => set({ value: clamp(Number(e.target.value), 0, 100) })} /></Field>}
      {a.op === 'y70Rotation' && <SelectField label={t('panel.settings.deck.orientation')} value={a.orientation ?? 'landscape'} options={['landscape', 'portrait'].map(o => ({ value: o, label: t(`panel.settings.deck.${o}`) }))} onChange={orientation => set({ orientation })} />}
    </>
  );
}

const MONITORING_STYLES: DeckMonitoringStyle[] = ['line', 'segments', 'backdrop', 'number'];
const MONITORING_PRESSES: DeckMonitoringPress[] = ['none', 'taskManager', 'monitoringPage'];

// Icon reused from the monitoring widget's DESIGN_ICONS per style: 'line' is
// the wire contract's filled sparkline (the widget's 'sparkline' key, not its
// unfilled 'line'); 'number' reuses the widget's plain large-value icon
// ('text'), not 'numberfill' (a proportional fill-of-the-glyph effect the
// deck tile's number style doesn't have).
const MONITORING_STYLE_ICON_KEY: Record<DeckMonitoringStyle, string> = {
  line: 'sparkline',
  segments: 'segments',
  backdrop: 'backdrop',
  number: 'text',
};

type MonitoringAction = Extract<DeckAction, { type: 'monitoring' }>;

function clearMonitoringLabelText(action: MonitoringAction): MonitoringAction {
  const next = { ...action };
  delete next.labelText;
  return next;
}

function clearMonitoringFixedRange(action: MonitoringAction): MonitoringAction {
  const next = { ...action };
  delete next.min;
  delete next.max;
  return next;
}

function MonitoringFields({ action, onChange, surface, desktopEditor }: {
  action: MonitoringAction; onChange: (a: DeckAction) => void; surface?: PanelSurface; desktopEditor?: boolean;
}) {
  const { t } = useTranslation();
  const sensors = useSensors(true);
  const categoryOptions = visibleDeviceKeys(DECK_MONITORING_CATEGORIES, action.category, sensors, [], EMPTY_SENSOR_EXTRAS)
    .map(category => ({ value: category, label: t(CATEGORY_LABEL_KEYS[category]) }));
  const sensorOptions = sensorsForDevice(sensors, [], EMPTY_SENSOR_EXTRAS, action.category);
  const sensorValue = selectedSensorValue(sensorOptions, action.sensor);
  const activeSensor = resolveMonitoringSensor(sensors, action.category, sensorValue);

  // action.sensor starts '' (defaultActionFor has no live sensor data to pick
  // from) and must self-heal off a stale id after a category swap too - seed
  // the first resolvable concrete id once sensorValue differs from storage.
  useEffect(() => {
    if (sensorValue && sensorValue !== action.sensor) onChange({ ...action, sensor: sensorValue });
  }, [sensorValue, action, onChange]);

  const canType = canEditFreeText(surface, desktopEditor);
  const autoLabel = labelForDevice(action.category, activeSensor?.name ?? '');
  const labelOverride = action.labelText ?? '';
  // Derived, not stored: Hide wins regardless of labelText (kept intact so a
  // later Custom pick restores it); otherwise labelText's presence alone
  // means Custom (see the wire contract's discriminant, types.ts).
  const labelMode = action.showName === false ? 'hide' : (action.labelText !== undefined ? 'custom' : 'auto');

  const scale = action.scale ?? 'adaptive';
  const fixedDefaultMax = defaultFixedMax(action.category, activeSensor, action.sensor);
  const rangeMin = action.min ?? 0;
  const rangeMax = action.max ?? fixedDefaultMax;
  const rangeInvalid = rangeMin >= rangeMax;
  const commitRangeMin = (raw: string) => {
    const parsed = parseFixedRangeInput(raw, 0);
    if (parsed !== rangeMin) onChange({ ...action, min: parsed });
  };
  const commitRangeMax = (raw: string) => {
    const parsed = parseFixedRangeInput(raw, fixedDefaultMax);
    if (parsed !== rangeMax) onChange({ ...action, max: parsed });
  };

  return (
    <>
      <SettingsSection title={t('monitoring.settings.sensor')}>
        <div className={styles.sensorRow}>
          <Select
            className={styles.selectSmall}
            value={action.category}
            options={categoryOptions}
            onChange={category => onChange({
              ...clearMonitoringFixedRange(action), category: category as DeckMonitoringCategory, sensor: '',
            })}
            ariaLabel={t('monitoring.settings.device')}
          />
          <Select
            className={styles.selectWide}
            value={sensorValue}
            options={sensorOptions}
            onChange={sensor => onChange({ ...clearMonitoringFixedRange(action), sensor })}
            ariaLabel={t('monitoring.settings.sensor')}
          />
        </div>
        <LabelControls
          mode={labelMode}
          override={labelOverride}
          autoLabel={autoLabel}
          canType={canType}
          onSelectMode={next => {
            if (next === 'hide') { onChange({ ...action, showName: false }); return; }
            if (next === 'custom') {
              onChange(labelOverride.trim()
                ? { ...action, showName: true }
                : { ...action, showName: true, labelText: autoLabel });
              return;
            }
            onChange({ ...clearMonitoringLabelText(action), showName: true });
          }}
          onChangeText={value => onChange({ ...action, labelText: value })}
          onReset={() => onChange({ ...action, labelText: autoLabel })}
        />
      </SettingsSection>

      <SettingsSection title={t('monitoring.settings.design')}>
        <div className={styles.designRow}>
          {MONITORING_STYLES.map(style => {
            const Icon = DESIGN_ICONS[MONITORING_STYLE_ICON_KEY[style]];
            const label = t(`panel.settings.deck.monitoringStyle.${style}`);
            return (
              <IconLabelButton
                key={style}
                className={styles.designBtn}
                active={style === action.style}
                icon={Icon ? <Icon aria-hidden="true" /> : undefined}
                title={label}
                ariaLabel={label}
                onPress={() => onChange({ ...action, style })}
              />
            );
          })}
        </div>
        <SwatchRow
          label={t('panel.settings.deck.monitoringColor')}
          value={action.color}
          onChange={color => onChange({ ...action, color })}
        />
      </SettingsSection>

      {action.style !== 'number' && (
        <SettingsSection title={t('monitoring.settings.range')}>
          <div className={styles.scaleRow}>
            {SCALE_OPTIONS.map(opt => (
              <IconLabelButton
                key={opt.value}
                className={styles.scaleBtn}
                active={opt.value === scale}
                label={t(opt.labelKey)}
                onPress={() => onChange({ ...action, scale: opt.value })}
              />
            ))}
          </div>
          {scale === 'fixed' && canType && (
            <div className={styles.rangeRow}>
              <div className={styles.rangeField}>
                <span className={styles.rangeFieldLabel}>{t('monitoring.settings.rangeMin')}</span>
                <TextInput
                  type="number"
                  size="sm"
                  value={String(rangeMin)}
                  ariaLabel={t('monitoring.settings.rangeMin')}
                  invalid={rangeInvalid}
                  onBlur={commitRangeMin}
                />
              </div>
              <div className={styles.rangeField}>
                <span className={styles.rangeFieldLabel}>{t('monitoring.settings.rangeMax')}</span>
                <TextInput
                  type="number"
                  size="sm"
                  value={String(rangeMax)}
                  ariaLabel={t('monitoring.settings.rangeMax')}
                  invalid={rangeInvalid}
                  onBlur={commitRangeMax}
                />
              </div>
            </div>
          )}
        </SettingsSection>
      )}

      <SelectField
        label={t('panel.settings.deck.monitoringPressOp')}
        value={action.press ?? 'none'}
        options={MONITORING_PRESSES.map(press => ({ value: press, label: t(`panel.settings.deck.monitoringPress.${press}`) }))}
        onChange={press => onChange({ ...action, press: press as DeckMonitoringPress })}
      />
    </>
  );
}

type WeatherAction = Extract<DeckAction, { type: 'weather' }>;

function WeatherFields({ action, onChange, surface, desktopEditor }: {
  action: WeatherAction; onChange: (a: DeckAction) => void; surface?: PanelSurface; desktopEditor?: boolean;
}) {
  const { t } = useTranslation();
  const hasKeyboard = canEditFreeText(surface, desktopEditor);
  const hasLocation = action.lat !== undefined && action.lon !== undefined;

  function selectLocation(result: WeatherGeocodeResult) {
    onChange({
      ...action, lat: result.latitude, lon: result.longitude, city: result.name, cc: result.countryCode,
    });
  }

  function clearLocation() {
    const next = { ...action };
    delete next.lat;
    delete next.lon;
    delete next.city;
    delete next.cc;
    onChange(next);
  }

  return (
    <>
      <Field label={t('panel.widget.weather.settings.location')}>
        {hasLocation && (
          <div className={styles.pathRow}>
            <span className={styles.weatherLocationLabel}>
              {t('panel.widget.weather.settings.currentLocation', { location: [action.city, action.cc].filter(Boolean).join(', ') })}
            </span>
            <Button type="button" size="sm" tone="neutral" onClick={clearLocation}>
              {t('panel.widget.weather.settings.clearLocation')}
            </Button>
          </div>
        )}
        {hasKeyboard ? (
          <WeatherLocationSearch hasKeyboard={hasKeyboard} onSelect={selectLocation} />
        ) : (
          !hasLocation && <DesktopOnlyBadge />
        )}
      </Field>
      <SelectField
        label={t('panel.widget.weather.settings.temperature')}
        value={action.units ?? 'auto'}
        options={[
          // eslint-disable-next-line i18next/no-literal-string -- enum value
          { value: 'auto', label: t('panel.widget.weather.settings.auto') },
          { value: 'C', label: t('panel.widget.weather.settings.celsius') },
          { value: 'F', label: t('panel.widget.weather.settings.fahrenheit') },
        ]}
        onChange={units => onChange({ ...action, units: units as WeatherAction['units'] })}
      />
    </>
  );
}

type PlayAudioAction = Extract<DeckAction, { type: 'playAudio' }>;

function PlayAudioFields({ action, onChange, surface, desktopEditor }: {
  action: PlayAudioAction; onChange: (a: DeckAction) => void; surface?: PanelSurface; desktopEditor?: boolean;
}) {
  const { t } = useTranslation();
  const locked = deckAuthoringLocked(surface, desktopEditor);
  const canBrowse = canEditFreeText(surface, desktopEditor)
    && (isWindowsAppShell() || isMacAppShell())
    && !isRelayActive() && !isDirectActive();
  const [browsing, setBrowsing] = useState(false);

  const handleBrowse = async () => {
    setBrowsing(true);
    try {
      const path = await pickSystemPath(false);
      if (path) onChange({ ...action, path });
    } finally {
      setBrowsing(false);
    }
  };

  return (
    <>
      <Field label={t('panel.settings.deck.path')}>
        <div className={styles.pathRow}>
          <input className={styles.input} type="text" value={action.path} readOnly={locked} disabled={locked} onChange={e => onChange({ ...action, path: e.target.value })} />
          {canBrowse && (
            <Button type="button" size="sm" tone="neutral" icon={<FolderOpen size={14} aria-hidden />} disabled={browsing} onClick={handleBrowse}>
              {t('panel.settings.deck.browse')}
            </Button>
          )}
        </div>
        {locked && <DesktopOnlyBadge />}
      </Field>
      <Slider
        // eslint-disable-next-line i18next/no-literal-string -- Slider orientation enum value
        orientation="inline"
        editable
        trackFill
        disabled={locked}
        label={t('panel.settings.deck.volume')}
        ariaLabel={t('panel.settings.deck.volume')}
        value={action.volume ?? 100}
        min={0}
        max={100}
        onChange={v => onChange({ ...action, volume: clamp(Math.round(v), 0, 100) })}
      />
    </>
  );
}

function SequenceEditor({ action, onChange, allowed, surface, desktopEditor }: { action: Extract<DeckAction, { type: 'sequence' }>; onChange: (a: DeckAction) => void; allowed: DeckPickerKind[]; surface?: PanelSurface; desktopEditor?: boolean }) {
  const { t } = useTranslation();
  const steps = action.steps;
  const setSteps = (next: typeof steps) => onChange({ type: 'sequence', steps: next });
  return (
    <div className={styles.steps}>
      {steps.map((step, i) => (
        <div className={styles.step} key={i}>
          <div className={styles.stepHead}>
            <span>{t('panel.settings.deck.sequence.step', { n: i + 1 })}</span>
            <span>
              <button type="button" disabled={i === 0} onClick={() => { const n = steps.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; setSteps(n); }}>↑</button>
              <button type="button" disabled={i === steps.length - 1} onClick={() => { const n = steps.slice(); [n[i + 1], n[i]] = [n[i], n[i + 1]]; setSteps(n); }}>↓</button>
              <button type="button" onClick={() => setSteps(steps.filter((_, j) => j !== i))}>✕</button>
            </span>
          </div>
          <ActionEditor action={step.action} onChange={a => setSteps(steps.map((s, j) => (j === i ? { ...s, action: a } : s)))} showType allowed={allowed} surface={surface} desktopEditor={desktopEditor} />
          <Field label={t('panel.settings.deck.sequence.gapMs')}><input className={styles.input} type="number" min={0} value={step.gapAfterMs ?? 60} onChange={e => setSteps(steps.map((s, j) => (j === i ? { ...s, gapAfterMs: Math.max(0, Number(e.target.value)) } : s)))} /></Field>
        </div>
      ))}
      <Button type="button" size="sm" tone="neutral" onClick={() => setSteps([...steps, { action: defaultActionFor('system'), gapAfterMs: 60 }])}>
        {t('panel.settings.deck.sequence.addStep')}
      </Button>
    </div>
  );
}

function ToggleEditor({ action, onChange, allowed, surface, desktopEditor }: { action: Extract<DeckAction, { type: 'toggle' }>; onChange: (a: DeckAction) => void; allowed: DeckPickerKind[]; surface?: PanelSurface; desktopEditor?: boolean }) {
  const { t } = useTranslation();
  const stateKinds = ['mute', 'lightingPower', 'internal'];
  return (
    <>
      <SelectField label={t('panel.settings.deck.toggle.stateSource')} value={action.state?.kind ?? 'internal'} options={stateKinds.map(k => ({ value: k, label: t(`panel.settings.deck.toggle.state.${k}`) }))} onChange={kind => onChange({ ...action, state: { kind: kind as 'mute' } })} />
      <div className={styles.branch}>
        <div className={styles.branchLabel}>{t('panel.settings.deck.toggle.onPress')}</div>
        <ActionEditor action={action.on} onChange={on => onChange({ ...action, on })} showType allowed={allowed} surface={surface} desktopEditor={desktopEditor} />
      </div>
      <div className={styles.branch}>
        <div className={styles.branchLabel}>{t('panel.settings.deck.toggle.alternatePress')}</div>
        <ActionEditor action={action.off} onChange={off => onChange({ ...action, off })} showType allowed={allowed} surface={surface} desktopEditor={desktopEditor} />
      </div>
    </>
  );
}

/**
 * One action-kind entry in the picker: an icon + label. Clicking assigns it to
 * the selected slot; dragging it onto a slot in the grid assigns it there (the
 * grid's DndContext, in StreamDeckDevicePage, resolves the `pick:<kind>` id).
 */
function PickerKindItem({ kind, active, onPick, locked = false }: { kind: DeckPickerKind; active: boolean; onPick: (k: DeckPickerKind) => void; locked?: boolean }) {
  const { t } = useTranslation();
  const drag = useDraggable({ id: `pick:${kind}`, disabled: locked });
  const Icon = pickerKindIcon(kind);
  return (
    <button
      ref={drag.setNodeRef}
      {...drag.attributes}
      {...drag.listeners}
      type="button"
      role="option"
      aria-selected={active}
      aria-disabled={locked || undefined}
      disabled={locked}
      className={`${styles.kindItem} ${active ? styles.kindItemActive : ''} ${locked ? styles.kindItemLocked : ''}`}
      // No transform here: the drag visual is a portal-rendered DragOverlay
      // (StreamDeckDevicePage), so it isn't clipped by the picker's overflow.
      // The original just dims in place while dragging.
      style={{ opacity: drag.isDragging ? 0.4 : undefined }}
      onClick={() => onPick(kind)}
    >
      <Icon size={14} aria-hidden className={styles.kindIcon} />
      {t(`panel.settings.deck.action.${kind}`)}
    </button>
  );
}

/** Floating chip shown in the DragOverlay while an action is dragged from the picker. */
export function DeckActionDragPreview({ kind }: { kind: DeckPickerKind }) {
  const { t } = useTranslation();
  const Icon = pickerKindIcon(kind);
  return (
    <div className={`${styles.kindItem} ${styles.kindItemActive} ${styles.kindDragPreview}`}>
      <Icon size={14} aria-hidden className={styles.kindIcon} />
      {t(`panel.settings.deck.action.${kind}`)}
    </div>
  );
}

/**
 * Expandable list of action categories, replacing a category+kind Select
 * pair: each category is its own collapsible group, and its body lists that
 * category's kinds as clickable entries. Every category starts expanded so
 * the full action set is visible at a glance; the category holding the slot's
 * current kind is always kept expanded (including when the selected slot
 * changes to a kind in a different category) so the active kind's highlight is
 * never hidden inside a collapsed group.
 */
function ActionCategoryPicker({ categories, activeKind, onPick, surface, desktopEditor }: {
  categories: DeckActionCategory[]; activeKind: DeckPickerKind; onPick: (k: DeckPickerKind) => void;
  surface?: PanelSurface; desktopEditor?: boolean;
}) {
  const { t } = useTranslation();
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set(categories.map(c => c.key)));
  const [query, setQuery] = useState('');
  const activeCategoryKey = categoryForKind(activeKind).key;
  const locked = deckAuthoringLocked(surface, desktopEditor);
  useEffect(() => {
    setOpenKeys(prev => (prev.has(activeCategoryKey) ? prev : new Set(prev).add(activeCategoryKey)));
  }, [activeCategoryKey]);
  const toggleOpen = (key: string) => setOpenKeys(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  // Y70-class surfaces have no keyboard - canEditFreeText hides the search
  // bar there, same gating as IconPicker/WeatherSettings.
  const showSearch = canEditFreeText(surface, desktopEditor);
  const trimmedQuery = query.trim().toLowerCase();
  const filteredCategories = trimmedQuery
    ? categories
        .map(cat => ({ ...cat, kinds: cat.kinds.filter(k => t(`panel.settings.deck.action.${k}`).toLowerCase().includes(trimmedQuery)) }))
        .filter(cat => cat.kinds.length > 0)
    : categories;

  return (
    <div className={styles.categoryList}>
      {locked && <p className={styles.description}>{t('panel.settings.deck.desktopOnlyAction')}</p>}
      {showSearch && (
        <SearchInput
          value={query}
          onChange={setQuery}
          placeholder={t('panel.settings.deck.actionSearch')}
          ariaLabel={t('panel.settings.deck.actionSearch')}
        />
      )}
      {filteredCategories.map(cat => (
        <CollapsibleSection
          key={cat.key}
          title={t(cat.labelKey)}
          // A search in progress auto-expands every category with a match,
          // so results are never hidden behind a manually-collapsed group.
          open={trimmedQuery.length > 0 ? true : openKeys.has(cat.key)}
          onToggle={() => toggleOpen(cat.key)}
          compact
        >
          <div className={styles.kindList} role="listbox" aria-label={t(cat.labelKey)}>
            {cat.kinds.map(k => (
              <PickerKindItem key={k} kind={k} active={k === activeKind} onPick={onPick} locked={locked && isPrivilegedPickerKind(k)} />
            ))}
          </div>
        </CollapsibleSection>
      ))}
    </div>
  );
}

const TITLE_ALIGN_ICONS: Record<DeckTitleAlign, typeof AlignVerticalJustifyStart> = {
  top: AlignVerticalJustifyStart,
  middle: AlignVerticalJustifyCenter,
  bottom: AlignVerticalJustifyEnd,
};

const TITLE_ALIGN_LABEL_KEY: Record<DeckTitleAlign, string> = {
  top: 'panel.settings.deck.titleStyle.alignTop',
  middle: 'panel.settings.deck.titleStyle.alignMiddle',
  bottom: 'panel.settings.deck.titleStyle.alignBottom',
};

/**
 * Elgato-style title panel for the slot, as standard label-left / control-right
 * settings rows: a Show-title toggle (off by default), the title text field
 * folded in right under it, then alignment/style as chip groups plus font,
 * size, and text colour. Show-title off leaves only the toggle; the text field
 * and every styling control are hidden, and their values are kept for when it
 * goes back on.
 */
function TitleFields({
  label, title, hideText, hideShow, hideAlign, hideUnderline, disabled: disabledProp, onLabelChange, onTitleChange,
}: {
  label?: string;
  title: DeckTitleStyle | undefined;
  // When true (the deck-wide default editor) the per-key title text is omitted.
  hideText?: boolean;
  // Omits the Show-title toggle; the caller (a fixed-visibility renderer like
  // the monitoring tile's own showName field) supplies `disabled` instead.
  hideShow?: boolean;
  // Omits the alignment row for a renderer with a fixed text position.
  hideAlign?: boolean;
  // Drops Underline from the Style chip group for a renderer that doesn't draw it.
  hideUnderline?: boolean;
  // Only read when hideShow is true.
  disabled?: boolean;
  onLabelChange?: (label: string) => void;
  onTitleChange: (patch: DeckTitleStyle) => void;
}) {
  const { t } = useTranslation();
  const resolved = resolveDeckTitleStyle(title);
  // Off hides the fields rather than greying them: the toggle sits directly
  // above, so it reads as the cause. The hideShow path greys instead (below) -
  // its gate is the action's own label-mode field, a section away, so rows
  // vanishing there would have no visible cause.
  const showFields = !!hideShow || resolved.show;
  const disabled = !!hideShow && !!disabledProp;

  return (
    <>
      {!hideShow && (
        <SettingsToggle
          label={t('panel.settings.deck.titleStyle.show')}
          checked={resolved.show}
          onChange={show => onTitleChange({ show })}
        />
      )}

      {showFields && (
        <>
          {!hideText && (
            <input
              className={styles.input}
              type="text"
              value={label ?? ''}
              placeholder={t('panel.settings.deck.labelPlaceholder')}
              aria-label={t('panel.settings.deck.label')}
              onChange={e => onLabelChange?.(e.target.value)}
            />
          )}

          {!hideAlign && (
            <SettingsRow label={t('panel.settings.deck.titleStyle.align')} disabled={disabled}>
              <ChipGroup
                ariaLabel={t('panel.settings.deck.titleStyle.align')}
                activeKey={resolved.align}
                onChange={align => onTitleChange({ align: align as DeckTitleAlign })}
                options={(['top', 'middle', 'bottom'] as const).map(align => {
                  const Icon = TITLE_ALIGN_ICONS[align];
                  return { key: align, label: <Icon size={16} aria-hidden="true" />, ariaLabel: t(TITLE_ALIGN_LABEL_KEY[align]), disabled };
                })}
              />
            </SettingsRow>
          )}

          <SettingsSelect
            label={t('panel.settings.deck.titleStyle.font')}
            value={title?.font ?? 'default'}
            disabled={disabled}
            options={DECK_TITLE_FONTS.map(f => ({
              value: f.id,
              label: f.label ?? t('panel.settings.deck.titleStyle.fontDefault'),
            }))}
            onChange={font => onTitleChange({ font })}
          />

          <SettingsRow label={t('panel.settings.deck.titleStyle.size')} disabled={disabled}>
            <ChipGroup
              ariaLabel={t('panel.settings.deck.titleStyle.size')}
              activeKey={String(resolved.size)}
              onChange={s => onTitleChange({ size: Number(s) })}
              options={DECK_TITLE_SIZE_OPTIONS.map(s => ({ key: String(s), label: String(s), disabled }))}
            />
          </SettingsRow>

          <SettingsRow label={t('panel.settings.deck.titleStyle.style')} disabled={disabled}>
            <ChipGroup
              multiSelect
              ariaLabel={t('panel.settings.deck.titleStyle.style')}
              activeKeys={new Set([
                resolved.bold ? 'bold' : '',
                resolved.italic ? 'italic' : '',
                !hideUnderline && resolved.underline ? 'underline' : '',
              ].filter(Boolean))}
              onToggleKey={k => onTitleChange({ [k]: !resolved[k as 'bold' | 'italic' | 'underline'] })}
              options={[
                /* eslint-disable i18next/no-literal-string -- title-style enum keys + single-glyph chip labels */
                { key: 'bold', label: <span className={styles.boldGlyph}>B</span>, ariaLabel: t('panel.settings.deck.titleStyle.bold'), disabled },
                { key: 'italic', label: <span className={styles.italicGlyph}>I</span>, ariaLabel: t('panel.settings.deck.titleStyle.italic'), disabled },
                ...(hideUnderline ? [] : [
                  { key: 'underline', label: <span className={styles.underlineGlyph}>U</span>, ariaLabel: t('panel.settings.deck.titleStyle.underline'), disabled },
                ]),
                /* eslint-enable i18next/no-literal-string */
              ]}
            />
          </SettingsRow>

          <SwatchRow
            label={t('panel.settings.deck.titleStyle.color')}
            value={title?.color}
            disabled={disabled}
            onChange={color => onTitleChange({ color })}
          />
        </>
      )}
    </>
  );
}

/** Shared color-swatch row: an "Auto" chip (unsets the field) plus DECK_SWATCHES. */
function SwatchRow({ label, value, onChange, disabled = false, allowTransparent = false }: {
  // Omit when the row is the sole control in an already-titled section (e.g.
  // the monitoring background swatch) so the label isn't repeated verbatim.
  label?: string; value: string | undefined; onChange: (color: string | undefined) => void; disabled?: boolean;
  // Background rows only: adds a checkerboard chip storing 'transparent'. The
  // on-screen cell then shows the surface behind it; a physical key renders
  // the deck's native off-black (JPEG/BMP encode drops the alpha).
  allowTransparent?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <SettingsRow label={label} disabled={disabled} wrapControl>
      <div className={styles.swatches}>
        <button
          type="button"
          disabled={disabled}
          className={`${styles.swatch} ${styles.autoSwatch} ${!value ? styles.activeSwatch : ''}`}
          onClick={() => onChange(undefined)}
        >
          {t('panel.settings.deck.colorAuto')}
        </button>
        {allowTransparent && (
          <button
            type="button"
            disabled={disabled}
            className={`${styles.swatch} ${styles.transparentSwatch} ${value === 'transparent' ? styles.activeSwatch : ''}`}
            onClick={() => onChange('transparent')}
            aria-label={t('panel.settings.deck.colorTransparent')}
          />
        )}
        {DECK_SWATCHES.map(c => (
          <button
            key={c}
            type="button"
            disabled={disabled}
            className={`${styles.swatch} ${value === c ? styles.activeSwatch : ''}`}
            style={{ background: c }}
            onClick={() => onChange(c)}
            aria-label={c}
          />
        ))}
      </div>
    </SettingsRow>
  );
}

/**
 * Deck-wide "Default Title Style" editor for the Settings tab: the same title
 * panel as a key (minus the per-key text), bound to config.defaultTitleStyle.
 * New keys inherit it (see slotForPickerKind).
 */
export function DeckDefaultTitleSettings({ target }: { target: DeckTarget }) {
  const { t } = useTranslation();
  return (
    <SettingsSection title={t('devices.streamdeck.defaultTitle')}>
      <TitleFields
        hideText
        title={target.config.defaultTitleStyle}
        onTitleChange={patch => target.setTitleDefault({ ...target.config.defaultTitleStyle, ...patch })}
      />
    </SettingsSection>
  );
}

export interface DeckKeyInspectorProps {
  target: DeckTarget;
  page: number;
  folderPath: readonly number[];
  onFolderPathChange: (folderPath: number[]) => void;
  selectedSlot?: number;
  onSelectedSlotChange?: (slot: number) => void;
  surface?: PanelSurface;
  desktopEditor?: boolean;
  /**
   * Which sections to render. 'all' (default, touch widget) stacks the action
   * picker + the key's action/icon/title editor in one column. The routed
   * Stream Deck device page splits them across two columns: 'picker' (the full
   * action list) on the right, 'editor' (the selected key's fields) on the
   * left, both driven by the same target + selectedSlot.
   */
  part?: 'all' | 'picker' | 'editor';
  /**
   * True when the host surface's grid enters a folder on click (the routed
   * device page's double-click-to-enter), so this inspector drops the "enter
   * folder" button. Default false: DeckEditor's grid only selects a cell, so
   * a folder key there still needs the button to descend into it.
   */
  gridEntersFolders?: boolean;
  /**
   * Renders a destructive Delete action at the bottom of the editor fields,
   * clearing the slot currently open here. Omitted -> no delete control (the
   * caller decides what clearing means - a direct clear vs. a confirm for a
   * folder with bound content - matching the grid's own onDeleteSlot).
   */
  onDeleteSlot?: () => void;
}

/**
 * Action / label / icon / color editor for the slot currently selected in a
 * Deck target's grid. Split out of DeckEditor so a device page can place the
 * grid and this inspector in separate panes while the touch widget keeps
 * composing them together via DeckEditor.
 */
export function DeckKeyInspector({ target, page, folderPath, onFolderPathChange, selectedSlot, onSelectedSlotChange, surface, desktopEditor, part = 'all', gridEntersFolders = false, onDeleteSlot }: DeckKeyInspectorProps) {
  const { t } = useTranslation();
  const viewCount = slotCountAtDepth(target, folderPath.length);
  const viewSlots = resolveTargetView(target, page, folderPath) ?? padSlots([], viewCount);
  const selSlot = clamp(selectedSlot ?? 0, 0, Math.max(0, viewCount - 1));
  const slot = viewSlots[selSlot] ?? {};
  const pageCount = target.config.pages.length;
  // Identifies the selected slot's position so IconPicker (keyed on this
  // below) remounts on every slot change instead of carrying its tab state
  // over from whatever slot was selected before.
  const slotKey = `${page}:${folderPath.join('.')}:${selSlot}`;
  const [iconTab, setIconTab] = useState<IconPickerTab>('auto');

  const writeSlot = (next: DeckSlot) => target.updateSlot(page, folderPath, selSlot, next);

  const kind = actionToPickerKind(slot);
  const appIdForIcon = slot.action?.type === 'launchApp' ? slot.action.appId : undefined;

  // A widget target has no physical Stream Deck to act on, so deckBrightness/
  // deckSleep are hidden here (and from every nested sequence/toggle step
  // below) rather than offered as a silent no-op button.
  const nestedAllowed = kindsForTarget(NESTED_KINDS, target.kind);
  const categories = target.kind === 'physical'
    ? DECK_ACTION_CATEGORIES
    : DECK_ACTION_CATEGORIES
        .map(c => ({ ...c, kinds: kindsForTarget(c.kinds, target.kind) }))
        .filter(c => c.kinds.length > 0);

  const onKindChange = (k: DeckPickerKind) => writeSlot(slotForPickerKind(k, slot, target.config.defaultTitleStyle));

  const showPicker = part !== 'editor';
  const showEditor = part !== 'picker';

  // A slot with no assigned action or folder has nothing to style, so the
  // editor stays empty until one is picked from the action list.
  const hasBinding = !!slot.action || !!slot.folder;
  // A surface whose grid enters folders on click (the device page) drops the
  // enter-folder button; DeckEditor's grid only selects, so a folder key there
  // keeps it. Param-less actions (pageIndicator, page next/prev) also have
  // nothing to configure.
  const showFolderEdit = kind === 'folder' && !gridEntersFolders;
  const hasActionConfig = showFolderEdit || (!!slot.action
    && slot.action.type !== 'pageIndicator'
    && !(slot.action.type === 'page' && slot.action.op !== 'goto'));

  // A monitoring tile never shows slot.icon (see the tile layout contract) -
  // its background is slot.color and its name comes from slot.label/title,
  // styled minus the fields the tile ignores (show/align/underline; the
  // action's own showName + a fixed position replace those). Both are edited
  // inline here (not inside MonitoringFields/ActionFields, which only ever
  // see the bare action - no DeckSlot) instead of the generic Icon/Title
  // sections every other kind gets.
  const isMonitoring = slot.action?.type === 'monitoring';
  const monitoringShowName = slot.action?.type === 'monitoring' ? (slot.action.showName ?? true) : true;
  // A weather tile draws its own icon/temperature/city content (never
  // slot.icon), the same reasoning as the monitoring tile above - it shares
  // that tile's Background-only color section and title-style subset (no
  // Show/Align/Underline controls, since the city text is always shown at a
  // fixed position).
  const isWeather = slot.action?.type === 'weather';

  return (
    <div className={styles.root}>
      {showPicker && (
        <SettingsSection title={t('panel.settings.deck.actionType')}>
          <ActionCategoryPicker categories={categories} activeKind={kind} onPick={onKindChange} surface={surface} desktopEditor={desktopEditor} />
        </SettingsSection>
      )}

      {/* The split device-page layout (part='editor') puts this pane in its
          own column with no picker beside it, so an unbound key would
          otherwise render nothing here while still visibly selected. The
          stacked touch-widget layout (part='all') keeps the picker directly
          above this spot, so it's left unchanged. */}
      {showEditor && !hasBinding && part === 'editor' && (
        <EmptyState compact title={t('panel.settings.deck.emptyKeyHint')} />
      )}

      {showEditor && hasBinding && (
        <>
          {hasActionConfig && (
            <SettingsSection title={t(`panel.settings.deck.action.${kind}`)}>
              <div className={styles.fieldStack}>
                {showFolderEdit ? (
                  <button type="button" className={styles.folderBtn} onClick={() => { onFolderPathChange([...folderPath, selSlot]); onSelectedSlotChange?.(0); }}>
                    <FolderInput size={14} /> {t('panel.settings.deck.enterFolder')}
                  </button>
                ) : slot.action ? (
                  <ActionFields action={slot.action} onChange={a => writeSlot({ ...slot, action: a })} allowed={nestedAllowed} surface={surface} desktopEditor={desktopEditor} pageCount={pageCount} />
                ) : null}
              </div>
            </SettingsSection>
          )}

          {isMonitoring || isWeather ? (
            <SettingsSection title={t('panel.settings.deck.monitoringBackground')}>
              <SwatchRow
                value={slot.color}
                allowTransparent
                onChange={color => writeSlot({ ...slot, color })}
              />
            </SettingsSection>
          ) : (
            <SettingsSection title={t('panel.settings.icon')}>
              <IconPicker
                key={slotKey}
                value={slot.icon}
                appId={appIdForIcon}
                surface={surface}
                desktopEditor={desktopEditor}
                onChange={icon => writeSlot({ ...slot, icon })}
                onTabChange={setIconTab}
              />
              {/* A full-bleed Custom image ignores the tile color, so the swatch
                  dims while that tab is active - it would otherwise look live
                  while having no visible effect. */}
              <SwatchRow label={t('panel.settings.deck.color')} value={slot.color} allowTransparent disabled={iconTab === 'custom'} onChange={color => writeSlot({ ...slot, color })} />
            </SettingsSection>
          )}

          <SettingsSection title={t('panel.settings.deck.titleStyle.section')}>
            <TitleFields
              label={slot.label}
              title={slot.title}
              hideText={isMonitoring || isWeather}
              hideShow={isMonitoring || isWeather}
              hideAlign={isMonitoring || isWeather}
              hideUnderline={isMonitoring || isWeather}
              disabled={isMonitoring ? !monitoringShowName : isWeather ? false : undefined}
              onLabelChange={label => writeSlot({ ...slot, label })}
              onTitleChange={patch => writeSlot({ ...slot, title: { ...slot.title, ...patch } })}
            />
          </SettingsSection>

          {onDeleteSlot && (
            <Button type="button" tone="danger" className={styles.deleteBtn} icon={<Trash2 size={14} aria-hidden />} onClick={onDeleteSlot}>
              {t('panel.settings.deck.deleteKey')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
