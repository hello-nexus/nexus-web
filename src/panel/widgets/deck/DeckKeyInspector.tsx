import { useEffect, useState, type ReactNode } from 'react';
import { AlignVerticalJustifyCenter, AlignVerticalJustifyEnd, AlignVerticalJustifyStart, FolderInput } from 'lucide-react';
import { Button } from '../../../components/common/Button/Button';
import { useTranslation } from '../../../lib/i18n';
import { DECK_SWATCHES } from '../../../lib/settings';
import { fetchService } from '../../../api/service';
import { CollapsibleSection } from '../../../components/common/CollapsibleSection/CollapsibleSection';
import { ChipGroup } from '../../../components/common/ChipGroup/ChipGroup';
import { Select } from '../../../components/common/Select/Select';
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
import type { DeckAction, DeckActionType, DeckSlot, DeckTitleStyle } from './types';
import styles from './DeckKeyInspector.module.scss';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// NOTE: audioOutput / audioInput are intentionally omitted from every
// category - switching the default audio endpoint needs IPolicyConfig in the
// user session and isn't reliably verifiable yet (see deck plan: deferred).
// The action kinds + backend route remain for a future verified re-enable;
// they're just not offered here.
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
type DeckPickerKind = Exclude<DeckActionType, 'page'> | 'folder' | 'pagePrev' | 'pageNext' | 'pageGoto';

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
    kinds: ['nexus'],
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
    case 'text': return { type: 'text', text: '', paste: true };
    case 'power': return { type: 'power', action: 'lock' };
    case 'audioOutput': return { type: 'audioOutput', deviceId: '' };
    case 'audioInput': return { type: 'audioInput', deviceId: '' };
    case 'nexus': return { type: 'nexus', action: { op: 'rgbEffect' } };
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
        <>
          <Field label={t('panel.settings.deck.text')}><textarea className={styles.input} value={action.text} rows={2} onChange={e => onChange({ ...action, text: e.target.value })} /></Field>
          {/* eslint-disable-next-line i18next/no-literal-string -- option enum values */}
          <SelectField label={t('panel.settings.deck.paste')} value={(action.paste ?? true) ? 'yes' : 'no'} options={[{ value: 'yes', label: t('panel.settings.deck.pasteOn') }, { value: 'no', label: t('panel.settings.deck.pasteOff') }]} onChange={v => onChange({ ...action, paste: v === 'yes' })} />
        </>
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
 * Expandable list of action categories, replacing a category+kind Select
 * pair: each category is its own collapsible group, and its body lists that
 * category's kinds as clickable entries. Every category starts expanded so
 * the full action set is visible at a glance; the category holding the slot's
 * current kind is always kept expanded (including when the selected slot
 * changes to a kind in a different category) so the active kind's highlight is
 * never hidden inside a collapsed group.
 */
function ActionCategoryPicker({ categories, activeKind, onPick }: {
  categories: DeckActionCategory[]; activeKind: DeckPickerKind; onPick: (k: DeckPickerKind) => void;
}) {
  const { t } = useTranslation();
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set(categories.map(c => c.key)));
  const activeCategoryKey = categoryForKind(activeKind).key;
  useEffect(() => {
    setOpenKeys(prev => (prev.has(activeCategoryKey) ? prev : new Set(prev).add(activeCategoryKey)));
  }, [activeCategoryKey]);
  const toggleOpen = (key: string) => setOpenKeys(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  return (
    <div className={styles.categoryList}>
      {categories.map(cat => (
        <CollapsibleSection
          key={cat.key}
          title={t(cat.labelKey)}
          open={openKeys.has(cat.key)}
          onToggle={() => toggleOpen(cat.key)}
          compact
        >
          <div className={styles.kindList} role="listbox" aria-label={t(cat.labelKey)}>
            {cat.kinds.map(k => (
              <button
                key={k}
                type="button"
                role="option"
                aria-selected={k === activeKind}
                className={`${styles.kindItem} ${k === activeKind ? styles.kindItemActive : ''}`}
                onClick={() => onPick(k)}
              >
                {t(`panel.settings.deck.action.${k}`)}
              </button>
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
function TitleFields({ label, title, onLabelChange, onTitleChange }: {
  label: string | undefined;
  title: DeckTitleStyle | undefined;
  onLabelChange: (label: string) => void;
  onTitleChange: (patch: DeckTitleStyle) => void;
}) {
  const { t } = useTranslation();
  const resolved = resolveDeckTitleStyle(title);
  const disabled = !resolved.show;

  return (
    <>
      <SettingsToggle
        label={t('panel.settings.deck.titleStyle.show')}
        checked={resolved.show}
        onChange={show => onTitleChange({ show })}
      />

      <input
        className={styles.input}
        type="text"
        value={label ?? ''}
        placeholder={t('panel.settings.deck.labelPlaceholder')}
        aria-label={t('panel.settings.deck.label')}
        onChange={e => onLabelChange(e.target.value)}
      />

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
          activeKeys={new Set([resolved.bold ? 'bold' : '', resolved.italic ? 'italic' : '', resolved.underline ? 'underline' : ''].filter(Boolean))}
          onToggleKey={k => onTitleChange({ [k]: !resolved[k as 'bold' | 'italic' | 'underline'] })}
          options={[
            /* eslint-disable i18next/no-literal-string -- title-style enum keys + single-glyph chip labels */
            { key: 'bold', label: <span className={styles.boldGlyph}>B</span>, ariaLabel: t('panel.settings.deck.titleStyle.bold'), disabled },
            { key: 'italic', label: <span className={styles.italicGlyph}>I</span>, ariaLabel: t('panel.settings.deck.titleStyle.italic'), disabled },
            { key: 'underline', label: <span className={styles.underlineGlyph}>U</span>, ariaLabel: t('panel.settings.deck.titleStyle.underline'), disabled },
            /* eslint-enable i18next/no-literal-string */
          ]}
        />
      </SettingsRow>

      <SettingsRow label={t('panel.settings.deck.titleStyle.color')} disabled={disabled} align="start">
        <div className={styles.swatches}>
          <button
            type="button"
            disabled={disabled}
            className={`${styles.swatch} ${styles.autoSwatch} ${!title?.color ? styles.activeSwatch : ''}`}
            onClick={() => onTitleChange({ color: undefined })}
          >
            {t('panel.settings.deck.colorAuto')}
          </button>
          {DECK_SWATCHES.map(c => (
            <button
              key={c}
              type="button"
              disabled={disabled}
              className={`${styles.swatch} ${title?.color === c ? styles.activeSwatch : ''}`}
              style={{ background: c }}
              onClick={() => onTitleChange({ color: c })}
              aria-label={c}
            />
          ))}
        </div>
      </SettingsRow>
    </>
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
}

/**
 * Action / label / icon / color editor for the slot currently selected in a
 * Deck target's grid. Split out of DeckEditor so a device page can place the
 * grid and this inspector in separate panes while the touch widget keeps
 * composing them together via DeckEditor.
 */
export function DeckKeyInspector({ target, page, folderPath, onFolderPathChange, selectedSlot, onSelectedSlotChange, surface, desktopEditor, part = 'all' }: DeckKeyInspectorProps) {
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

  const onKindChange = (k: DeckPickerKind) => {
    if (k === 'folder') { writeSlot({ ...slot, action: undefined, folder: slot.folder ?? { slots: [] } }); return; }
    writeSlot({ ...slot, folder: undefined, action: defaultActionForPickerKind(k) });
  };

  const showPicker = part !== 'editor';
  const showEditor = part !== 'picker';

  // Param-less actions (pageIndicator, page next/prev) have nothing to
  // configure, so the Action box is suppressed for them; a folder shows its
  // enter-folder button.
  // A slot with no assigned action or folder has nothing to style, so the
  // editor stays empty until one is picked from the action list.
  const hasBinding = !!slot.action || !!slot.folder;
  const hasActionConfig = !!slot.folder || (!!slot.action
    && slot.action.type !== 'pageIndicator'
    && !(slot.action.type === 'page' && slot.action.op !== 'goto'));

  return (
    <div className={styles.root}>
      {showPicker && (
        <SettingsSection title={t('panel.settings.deck.actionType')}>
          <ActionCategoryPicker categories={categories} activeKind={kind} onPick={onKindChange} />
        </SettingsSection>
      )}

      {showEditor && hasBinding && (
        <>
          {hasActionConfig && (
            <SettingsSection title={t(`panel.settings.deck.action.${kind}`)}>
              <div className={styles.fieldStack}>
                {kind === 'folder' ? (
                  <button type="button" className={styles.folderBtn} onClick={() => { onFolderPathChange([...folderPath, selSlot]); onSelectedSlotChange?.(0); }}>
                    <FolderInput size={14} /> {t('panel.settings.deck.enterFolder')}
                  </button>
                ) : slot.action ? (
                  <ActionFields action={slot.action} onChange={a => writeSlot({ ...slot, action: a })} allowed={nestedAllowed} surface={surface} desktopEditor={desktopEditor} pageCount={pageCount} />
                ) : null}
              </div>
            </SettingsSection>
          )}

          <SettingsSection title={t('panel.settings.icon')}>
            <IconPicker value={slot.icon} appId={appIdForIcon} surface={surface} desktopEditor={desktopEditor} onChange={icon => writeSlot({ ...slot, icon })} />
            <SettingsRow label={t('panel.settings.deck.color')} align="start">
              <div className={styles.swatches}>
                <button type="button" className={`${styles.swatch} ${styles.autoSwatch} ${!slot.color ? styles.activeSwatch : ''}`} onClick={() => writeSlot({ ...slot, color: undefined })}>{t('panel.settings.deck.colorAuto')}</button>
                {DECK_SWATCHES.map(c => (
                  <button key={c} type="button" className={`${styles.swatch} ${slot.color === c ? styles.activeSwatch : ''}`} style={{ background: c }} onClick={() => writeSlot({ ...slot, color: c })} aria-label={c} />
                ))}
              </div>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title={t('panel.settings.deck.titleStyle.section')}>
            <TitleFields
              label={slot.label}
              title={slot.title}
              onLabelChange={label => writeSlot({ ...slot, label })}
              onTitleChange={patch => writeSlot({ ...slot, title: { ...slot.title, ...patch } })}
            />
          </SettingsSection>
        </>
      )}
    </div>
  );
}
