import { useEffect, useState, type ReactNode } from 'react';
import { AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, FolderInput, Plus } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { Button } from '../../../components/common/Button/Button';
import { useTranslation } from '../../../lib/i18n';
import { DECK_SWATCHES } from '../../../lib/settings';
import { fetchService } from '../../../api/service';
import { useSensors } from '../../../hooks/useSensors';
import { EMPTY_SENSOR_EXTRAS } from '../../../hooks/useSensorExtras';
import { CollapsibleSection } from '../../../components/common/CollapsibleSection/CollapsibleSection';
import { ChipGroup } from '../../../components/common/ChipGroup/ChipGroup';
import { Select } from '../../../components/common/Select/Select';
import { SearchInput } from '../../../components/common/SearchInput/SearchInput';
import { Slider } from '../../../components/common/Slider/Slider';
import { SectionHeader } from '../../../components/common/SectionHeader/SectionHeader';
import { SettingsSection, SettingsRow, SettingsToggle, SettingsSelect } from '../common/SettingsRow/SettingsRow';
import { AppPicker } from '../common/AppPicker';
import { IconPicker } from '../common/IconPicker';
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
import { DECK_MONITORING_CATEGORIES } from './deckMonitoring';
import { CATEGORY_LABEL_KEYS, selectedSensorValue, sensorsForDevice, visibleDeviceKeys } from '../monitoring/sensorPicker';
import type {
  DeckAction, DeckActionType, DeckMonitoringCategory, DeckMonitoringPress, DeckMonitoringStyle, DeckSlot, DeckTitleStyle,
} from './types';
import styles from './DeckKeyInspector.module.scss';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// NOTE: audioOutput / audioInput are intentionally omitted from every
// category - switching the default audio endpoint needs IPolicyConfig in the
// user session and isn't reliably verifiable yet (see deck plan: deferred).
// The action kinds + backend route remain for a future verified re-enable;
// they're just not offered here.
// 'monitoring' is a standalone live-display key type (like 'sequence' or
// 'toggle'), not a nestable sub-action, so it's excluded from NESTED_KINDS the
// same way those are - a sequence step or toggle branch fires once on press,
// which doesn't fit a continuously-rendered sensor tile.
const NESTED_KINDS: DeckActionType[] = [
  'launchApp', 'openUrl', 'openFile', 'openFolder', 'system', 'hotkey', 'hotkeySwitch',
  'text', 'power', 'nexus', 'deckBrightness', 'deckSleep',
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
export type DeckPickerKind = Exclude<DeckActionType, 'page'> | 'folder' | 'pagePrev' | 'pageNext' | 'pageGoto';

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
    kinds: ['launchApp', 'openUrl', 'openFile', 'openFolder', 'system', 'hotkey', 'hotkeySwitch', 'text', 'power'],
  },
  {
    key: 'nexus',
    labelKey: 'panel.settings.deck.category.nexus',
    kinds: ['nexus', 'monitoring'],
  },
  {
    key: 'multi',
    labelKey: 'panel.settings.deck.category.multiAction',
    kinds: ['sequence', 'toggle'],
  },
];

function actionToPickerKind(slot: DeckSlot): DeckPickerKind {
  if (slot.folder) return 'folder';
  const a = slot.action;
  if (!a) return 'launchApp';
  if (a.type === 'page') return a.op === 'goto' ? 'pageGoto' : a.op === 'prev' ? 'pagePrev' : 'pageNext';
  return a.type;
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
    case 'nexus': return { type: 'nexus', action: { op: 'rgbEffect' } };
    case 'monitoring': return {
      type: 'monitoring', category: 'cpu', sensor: '', style: 'line', showName: true, press: 'none',
    };
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

function SelectField({ label, value, options, onChange, disabled }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <Field label={label}>
      <Select className={styles.selectWide} value={value} options={options} onChange={onChange} ariaLabel={label} disabled={disabled} />
    </Field>
  );
}

function ActionEditor({ action, onChange, showType, allowed, surface, desktopEditor, pageCount }: {
  action: DeckAction; onChange: (a: DeckAction) => void; showType: boolean; allowed: DeckActionType[]; surface?: PanelSurface; desktopEditor?: boolean; pageCount?: number;
}) {
  const { t } = useTranslation();
  return (
    <>
      {showType && (
        <SelectField
          label={t('panel.settings.deck.actionType')}
          value={action.type}
          options={allowed.map(k => ({ value: k, label: t(`panel.settings.deck.action.${k}`) }))}
          onChange={k => onChange(defaultActionFor(k as DeckActionType))}
        />
      )}
      <ActionFields action={action} onChange={onChange} allowed={allowed} surface={surface} desktopEditor={desktopEditor} pageCount={pageCount} />
    </>
  );
}

function ActionFields({ action, onChange, allowed, surface, desktopEditor, pageCount }: {
  action: DeckAction; onChange: (a: DeckAction) => void; allowed: DeckActionType[]; surface?: PanelSurface; desktopEditor?: boolean; pageCount?: number;
}) {
  const { t } = useTranslation();
  const audioOut = useServiceOptions('/system/audio/devices', d => ((d as { outputs?: { id: string; name: string }[] })?.outputs ?? []).map(x => ({ value: x.id, label: x.name })));
  const audioIn = useServiceOptions('/system/audio/devices', d => ((d as { inputs?: { id: string; name: string }[] })?.inputs ?? []).map(x => ({ value: x.id, label: x.name })));
  const displays = useServiceOptions('/displays', d => ((d as { displays?: { id: string; name?: string; label?: string }[] })?.displays ?? []).map(x => ({ value: x.id, label: x.name ?? x.label ?? x.id })));

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
    case 'openFolder':
      return <Field label={t('panel.settings.deck.path')}><input className={styles.input} type="text" value={action.path} onChange={e => onChange({ ...action, path: e.target.value })} /></Field>;
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
      return <Field label={t('panel.settings.deck.hotkey')}><HotkeyInput value={action.keys} onChange={keys => onChange({ ...action, keys })} /></Field>;
    case 'hotkeySwitch':
      return (
        <>
          <Field label={t('panel.settings.deck.hotkeySwitch.firstPress')}><HotkeyInput value={action.keysA} onChange={keysA => onChange({ ...action, keysA })} /></Field>
          <Field label={t('panel.settings.deck.hotkeySwitch.secondPress')}><HotkeyInput value={action.keysB} onChange={keysB => onChange({ ...action, keysB })} /></Field>
        </>
      );
    case 'text':
      return (
        <Field label={t('panel.settings.deck.text')}><textarea className={styles.input} value={action.text} rows={2} onChange={e => onChange({ ...action, text: e.target.value })} /></Field>
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
      return <MonitoringFields action={action} onChange={onChange} />;
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

function NexusFields({ action, onChange }: { action: Extract<DeckAction, { type: 'nexus' }>; onChange: (a: DeckAction) => void }) {
  const { t } = useTranslation();
  const a = action.action;
  const set = (patch: Partial<typeof a>) => onChange({ type: 'nexus', action: { ...a, ...patch } });
  const ops = ['rgbEffect', 'rgbScene', 'lightingBrightness', 'lightingPower', 'fanProfile', 'fanSpeed', 'y70Power', 'y70Brightness', 'y70Rotation'];
  return (
    <>
      <SelectField label={t('panel.settings.deck.nexusOp')} value={a.op} options={ops.map(o => ({ value: o, label: t(`panel.settings.deck.nexus.${o}`) }))} onChange={op => set({ op: op as typeof a.op })} />
      {a.op === 'rgbEffect' && <Field label={t('panel.settings.deck.effect')}><input className={styles.input} type="text" value={a.effect ?? ''} onChange={e => set({ effect: e.target.value })} /></Field>}
      {a.op === 'rgbScene' && <Field label={t('panel.settings.deck.scene')}><input className={styles.input} type="text" value={a.profileId ?? ''} onChange={e => set({ profileId: e.target.value })} /></Field>}
      {a.op === 'lightingBrightness' && <Field label={t('panel.settings.deck.value')}><input className={styles.input} type="number" min={0} max={100} value={Math.round((a.value ?? 1) * 100)} onChange={e => set({ value: clamp(Number(e.target.value) / 100, 0, 1) })} /></Field>}
      {/* eslint-disable-next-line i18next/no-literal-string -- option enum values */}
      {a.op === 'lightingPower' && <><Field label={t('panel.settings.deck.device')}><input className={styles.input} type="text" value={a.deviceId ?? ''} onChange={e => set({ deviceId: e.target.value })} /></Field><SelectField label={t('panel.settings.deck.on')} value={(a.on ?? true) ? 'yes' : 'no'} options={[{ value: 'yes', label: t('panel.settings.deck.stateOn') }, { value: 'no', label: t('panel.settings.deck.stateOff') }]} onChange={v => set({ on: v === 'yes' })} /></>}
      {a.op === 'fanProfile' && <SelectField label={t('panel.settings.deck.fanProfile')} value={a.profile ?? 'Balanced'} options={['Silent', 'Balanced', 'Performance', 'auto'].map(p => ({ value: p, label: p }))} onChange={profile => set({ profile })} />}
      {a.op === 'fanSpeed' && <><Field label={t('panel.settings.deck.fan')}><input className={styles.input} type="text" value={a.fanId ?? ''} onChange={e => set({ fanId: e.target.value })} /></Field><Field label={t('panel.settings.deck.value')}><input className={styles.input} type="number" min={0} max={100} value={a.value ?? 0} onChange={e => set({ value: clamp(Number(e.target.value), 0, 100) })} /></Field></>}
      {/* eslint-disable-next-line i18next/no-literal-string -- option enum values */}
      {a.op === 'y70Power' && <SelectField label={t('panel.settings.deck.on')} value={(a.on ?? true) ? 'yes' : 'no'} options={[{ value: 'yes', label: t('panel.settings.deck.stateOn') }, { value: 'no', label: t('panel.settings.deck.stateOff') }]} onChange={v => set({ on: v === 'yes' })} />}
      {a.op === 'y70Brightness' && <Field label={t('panel.settings.deck.value')}><input className={styles.input} type="number" min={0} max={100} value={a.value ?? 0} onChange={e => set({ value: clamp(Number(e.target.value), 0, 100) })} /></Field>}
      {a.op === 'y70Rotation' && <SelectField label={t('panel.settings.deck.orientation')} value={a.orientation ?? 'landscape'} options={['landscape', 'portrait'].map(o => ({ value: o, label: t(`panel.settings.deck.${o}`) }))} onChange={orientation => set({ orientation })} />}
    </>
  );
}

const MONITORING_STYLES: DeckMonitoringStyle[] = ['line', 'radial', 'number'];
const MONITORING_PRESSES: DeckMonitoringPress[] = ['none', 'taskManager', 'monitoringPage'];

function MonitoringFields({ action, onChange }: { action: Extract<DeckAction, { type: 'monitoring' }>; onChange: (a: DeckAction) => void }) {
  const { t } = useTranslation();
  const sensors = useSensors(true);
  const categoryOptions = visibleDeviceKeys(DECK_MONITORING_CATEGORIES, action.category, sensors, [], EMPTY_SENSOR_EXTRAS)
    .map(category => ({ value: category, label: t(CATEGORY_LABEL_KEYS[category]) }));
  const sensorOptions = sensorsForDevice(sensors, [], EMPTY_SENSOR_EXTRAS, action.category);
  const sensorValue = selectedSensorValue(sensorOptions, action.sensor);

  // action.sensor starts '' (defaultActionFor has no live sensor data to pick
  // from) and must self-heal off a stale id after a category swap too - seed
  // the first resolvable concrete id once sensorValue differs from storage.
  useEffect(() => {
    if (sensorValue && sensorValue !== action.sensor) onChange({ ...action, sensor: sensorValue });
  }, [sensorValue, action, onChange]);

  return (
    <>
      <SelectField
        label={t('monitoring.settings.device')}
        value={action.category}
        options={categoryOptions}
        onChange={category => onChange({ ...action, category: category as DeckMonitoringCategory, sensor: '' })}
      />
      <SelectField
        label={t('monitoring.settings.sensor')}
        value={sensorValue}
        options={sensorOptions}
        onChange={sensor => onChange({ ...action, sensor })}
      />
      <SelectField
        label={t('panel.settings.deck.monitoringStyleOp')}
        value={action.style}
        options={MONITORING_STYLES.map(style => ({ value: style, label: t(`panel.settings.deck.monitoringStyle.${style}`) }))}
        onChange={style => onChange({ ...action, style: style as DeckMonitoringStyle })}
      />
      <SwatchRow
        label={t('panel.settings.deck.monitoringColor')}
        value={action.color}
        onChange={color => onChange({ ...action, color })}
      />
      <SettingsToggle
        label={t('panel.settings.deck.monitoringShowName')}
        checked={action.showName ?? true}
        onChange={showName => onChange({ ...action, showName })}
      />
      <SelectField
        label={t('panel.settings.deck.monitoringPressOp')}
        value={action.press ?? 'none'}
        options={MONITORING_PRESSES.map(press => ({ value: press, label: t(`panel.settings.deck.monitoringPress.${press}`) }))}
        onChange={press => onChange({ ...action, press: press as DeckMonitoringPress })}
      />
    </>
  );
}

function SequenceEditor({ action, onChange, allowed, surface, desktopEditor }: { action: Extract<DeckAction, { type: 'sequence' }>; onChange: (a: DeckAction) => void; allowed: DeckActionType[]; surface?: PanelSurface; desktopEditor?: boolean }) {
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

function ToggleEditor({ action, onChange, allowed, surface, desktopEditor }: { action: Extract<DeckAction, { type: 'toggle' }>; onChange: (a: DeckAction) => void; allowed: DeckActionType[]; surface?: PanelSurface; desktopEditor?: boolean }) {
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
function PickerKindItem({ kind, active, onPick }: { kind: DeckPickerKind; active: boolean; onPick: (k: DeckPickerKind) => void }) {
  const { t } = useTranslation();
  const drag = useDraggable({ id: `pick:${kind}` });
  const Icon = pickerKindIcon(kind);
  return (
    <button
      ref={drag.setNodeRef}
      {...drag.attributes}
      {...drag.listeners}
      type="button"
      role="option"
      aria-selected={active}
      className={`${styles.kindItem} ${active ? styles.kindItemActive : ''}`}
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
              <PickerKindItem key={k} kind={k} active={k === activeKind} onPick={onPick} />
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
 * size, and text colour. All styling controls disable while the title is
 * hidden; the text itself stays editable.
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
  const disabled = hideShow ? !!disabledProp : !resolved.show;

  return (
    <>
      {!hideShow && (
        <SettingsToggle
          label={t('panel.settings.deck.titleStyle.show')}
          checked={resolved.show}
          onChange={show => onTitleChange({ show })}
        />
      )}

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
  );
}

/** Shared color-swatch row: an "Auto" chip (unsets the field) plus DECK_SWATCHES. */
function SwatchRow({ label, value, onChange, disabled = false }: {
  // Omit when the row is the sole control in an already-titled section (e.g.
  // the monitoring background swatch) so the label isn't repeated verbatim.
  label?: string; value: string | undefined; onChange: (color: string | undefined) => void; disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <SettingsRow label={label} disabled={disabled} align="start">
      <div className={styles.swatches}>
        <button
          type="button"
          disabled={disabled}
          className={`${styles.swatch} ${styles.autoSwatch} ${!value ? styles.activeSwatch : ''}`}
          onClick={() => onChange(undefined)}
        >
          {t('panel.settings.deck.colorAuto')}
        </button>
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
}

/**
 * Action / label / icon / color editor for the slot currently selected in a
 * Deck target's grid. Split out of DeckEditor so a device page can place the
 * grid and this inspector in separate panes while the touch widget keeps
 * composing them together via DeckEditor.
 */
export function DeckKeyInspector({ target, page, folderPath, onFolderPathChange, selectedSlot, onSelectedSlotChange, surface, desktopEditor, part = 'all', gridEntersFolders = false }: DeckKeyInspectorProps) {
  const { t } = useTranslation();
  const viewCount = slotCountAtDepth(target, folderPath.length);
  const viewSlots = resolveTargetView(target, page, folderPath) ?? padSlots([], viewCount);
  const selSlot = clamp(selectedSlot ?? 0, 0, Math.max(0, viewCount - 1));
  const slot = viewSlots[selSlot] ?? {};
  const pageCount = target.config.pages.length;

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

  return (
    <div className={styles.root}>
      {showPicker && (
        <SettingsSection title={t('panel.settings.deck.actionType')}>
          <ActionCategoryPicker categories={categories} activeKind={kind} onPick={onKindChange} surface={surface} desktopEditor={desktopEditor} />
        </SettingsSection>
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

          {isMonitoring ? (
            <SettingsSection title={t('panel.settings.deck.monitoringBackground')}>
              <SwatchRow
                value={slot.color}
                onChange={color => writeSlot({ ...slot, color })}
              />
            </SettingsSection>
          ) : (
            <SettingsSection title={t('panel.settings.icon')}>
              <IconPicker value={slot.icon} appId={appIdForIcon} surface={surface} desktopEditor={desktopEditor} onChange={icon => writeSlot({ ...slot, icon })} />
              <SwatchRow label={t('panel.settings.deck.color')} value={slot.color} onChange={color => writeSlot({ ...slot, color })} />
            </SettingsSection>
          )}

          <SettingsSection title={t('panel.settings.deck.titleStyle.section')}>
            <TitleFields
              label={slot.label}
              title={slot.title}
              hideShow={isMonitoring}
              hideAlign={isMonitoring}
              hideUnderline={isMonitoring}
              disabled={isMonitoring ? !monitoringShowName : undefined}
              onLabelChange={label => writeSlot({ ...slot, label })}
              onTitleChange={patch => writeSlot({ ...slot, title: { ...slot.title, ...patch } })}
            />
          </SettingsSection>
        </>
      )}
    </div>
  );
}
