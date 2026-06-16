import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '../../../components/common/Button/Button';
import { ChevronLeft, FolderInput } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { DECK_SWATCHES } from '../../../lib/settings';
import { fetchService } from '../../../api/service';
import { Select } from '../../../components/common/Select/Select';
import { SectionHeader } from '../../../components/common/SectionHeader/SectionHeader';
import { SettingsSection } from '../common/SettingsRow/SettingsRow';
import { AppPicker } from '../common/AppPicker';
import { IconPicker } from '../common/IconPicker';
import { DesktopOnlyBadge } from '../../../components/common/DesktopOnlyBadge/DesktopOnlyBadge';
import { canEditFreeText } from '../../types';
import type { WidgetSettingsProps, DeckEditView } from '../types';
import type { PanelSurface } from '../../types';
import { HotkeyInput } from './HotkeyInput';
import { innerGridForSize, readDeckConfig, resolveViewSlots, updateSlotAt, deckConfigPatch, padSlots } from './deckLayout';
import type { DeckAction, DeckActionType, DeckSlot } from './types';
import styles from './DeckSettings.module.scss';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

// NOTE: audioOutput / audioInput are intentionally omitted — switching the
// default audio endpoint needs IPolicyConfig in the user session and isn't
// reliably verifiable yet (see deck plan: deferred). The action kinds + backend
// route remain for a future verified re-enable; they're just not offered here.
const TOP_KINDS: (DeckActionType | 'folder')[] = [
  'launchApp', 'openUrl', 'openFile', 'openFolder', 'system', 'hotkey', 'text',
  'power', 'nexus', 'sequence', 'toggle', 'folder',
];
const NESTED_KINDS: DeckActionType[] = [
  'launchApp', 'openUrl', 'openFile', 'openFolder', 'system', 'hotkey', 'text',
  'power', 'nexus',
];


function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className={styles.field}><SectionHeader>{label}</SectionHeader>{children}</div>;
}

function defaultActionFor(kind: DeckActionType): DeckAction {
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

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <Select className={styles.selectWide} value={value} options={options} onChange={onChange} ariaLabel={label} />
    </Field>
  );
}

function ActionEditor({ action, onChange, showType, allowed, surface, desktopEditor }: {
  action: DeckAction; onChange: (a: DeckAction) => void; showType: boolean; allowed: DeckActionType[]; surface?: PanelSurface; desktopEditor?: boolean;
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
      <ActionFields action={action} onChange={onChange} surface={surface} desktopEditor={desktopEditor} />
    </>
  );
}

function ActionFields({ action, onChange, surface, desktopEditor }: { action: DeckAction; onChange: (a: DeckAction) => void; surface?: PanelSurface; desktopEditor?: boolean }) {
  const { t } = useTranslation();
  const audioOut = useServiceOptions('/system/audio/devices', d => ((d as { outputs?: { id: string; name: string }[] })?.outputs ?? []).map(x => ({ value: x.id, label: x.name })));
  const audioIn = useServiceOptions('/system/audio/devices', d => ((d as { inputs?: { id: string; name: string }[] })?.inputs ?? []).map(x => ({ value: x.id, label: x.name })));
  const displays = useServiceOptions('/displays', d => ((d as { displays?: { id: string; name?: string; label?: string }[] })?.displays ?? []).map(x => ({ value: x.id, label: x.name ?? x.label ?? x.id })));

  switch (action.type) {
    case 'launchApp':
      return <Field label={t('panel.settings.deck.action.launchApp')}><AppPicker selectedId={action.appId} onSelect={app => onChange({ type: 'launchApp', appId: app.id })} /></Field>;
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
    case 'nexus':
      return <NexusFields action={action} onChange={onChange} />;
    case 'sequence':
      return <SequenceEditor action={action} onChange={onChange} surface={surface} desktopEditor={desktopEditor} />;
    case 'toggle':
      return <ToggleEditor action={action} onChange={onChange} surface={surface} desktopEditor={desktopEditor} />;
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

function SequenceEditor({ action, onChange, surface, desktopEditor }: { action: Extract<DeckAction, { type: 'sequence' }>; onChange: (a: DeckAction) => void; surface?: PanelSurface; desktopEditor?: boolean }) {
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
          <ActionEditor action={step.action} onChange={a => setSteps(steps.map((s, j) => (j === i ? { ...s, action: a } : s)))} showType allowed={NESTED_KINDS} surface={surface} desktopEditor={desktopEditor} />
          <Field label={t('panel.settings.deck.sequence.gapMs')}><input className={styles.input} type="number" min={0} value={step.gapAfterMs ?? 60} onChange={e => setSteps(steps.map((s, j) => (j === i ? { ...s, gapAfterMs: Math.max(0, Number(e.target.value)) } : s)))} /></Field>
        </div>
      ))}
      <Button type="button" size="sm" tone="neutral" onClick={() => setSteps([...steps, { action: defaultActionFor('system'), gapAfterMs: 60 }])}>
        {t('panel.settings.deck.sequence.addStep')}
      </Button>
    </div>
  );
}

function ToggleEditor({ action, onChange, surface, desktopEditor }: { action: Extract<DeckAction, { type: 'toggle' }>; onChange: (a: DeckAction) => void; surface?: PanelSurface; desktopEditor?: boolean }) {
  const { t } = useTranslation();
  const stateKinds = ['mute', 'lightingPower', 'internal'];
  return (
    <>
      <SelectField label={t('panel.settings.deck.toggle.stateSource')} value={action.state?.kind ?? 'internal'} options={stateKinds.map(k => ({ value: k, label: t(`panel.settings.deck.toggle.state.${k}`) }))} onChange={kind => onChange({ ...action, state: { kind: kind as 'mute' } })} />
      <div className={styles.branch}>
        <div className={styles.branchLabel}>{t('panel.settings.deck.toggle.onPress')}</div>
        <ActionEditor action={action.on} onChange={on => onChange({ ...action, on })} showType allowed={NESTED_KINDS} surface={surface} desktopEditor={desktopEditor} />
      </div>
      <div className={styles.branch}>
        <div className={styles.branchLabel}>{t('panel.settings.deck.toggle.alternatePress')}</div>
        <ActionEditor action={action.off} onChange={off => onChange({ ...action, off })} showType allowed={NESTED_KINDS} surface={surface} desktopEditor={desktopEditor} />
      </div>
    </>
  );
}

export function DeckSettings({ widget, surface, desktopEditor, onUpdate, selectedSlot, onSelectedSlotChange, editView, onEditViewChange }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const deck = readDeckConfig(widget);
  const { count } = innerGridForSize(widget.size);

  const folderPath = editView?.folderPath ?? [];
  const setView = (v: DeckEditView) => onEditViewChange?.(v);
  const selSlot = clamp(selectedSlot ?? 0, 0, count - 1);

  const viewSlots = resolveViewSlots(deck, folderPath, count) ?? padSlots([], count);
  const slot = viewSlots[selSlot] ?? {};
  const writeSlot = (next: DeckSlot) => onUpdate(deckConfigPatch(updateSlotAt(deck, folderPath, selSlot, next, count)));

  const kind: DeckActionType | 'folder' = slot.folder ? 'folder' : (slot.action?.type ?? 'launchApp');
  const appIdForIcon = slot.action?.type === 'launchApp' ? slot.action.appId : undefined;

  const onKindChange = (k: DeckActionType | 'folder') => {
    if (k === 'folder') writeSlot({ ...slot, action: undefined, folder: slot.folder ?? { slots: [] } });
    else writeSlot({ ...slot, folder: undefined, action: defaultActionFor(k) });
  };

  return (
    <div className={styles.settingsRoot}>
      {folderPath.length > 0 && (
        <div className={styles.breadcrumb}>
          <button onClick={() => { setView({ folderPath: folderPath.slice(0, -1) }); onSelectedSlotChange?.(0); }}>
            <ChevronLeft size={14} /> {t('panel.settings.deck.back')}
          </button>
        </div>
      )}

      <SettingsSection title={t('panel.settings.icon')}>
        <IconPicker value={slot.icon} appId={appIdForIcon} surface={surface} desktopEditor={desktopEditor} onChange={icon => writeSlot({ ...slot, icon })} />
      </SettingsSection>

      <SettingsSection title={t('panel.settings.deck.color')}>
        <div className={styles.swatches}>
          <button type="button" className={`${styles.swatch} ${styles.autoSwatch} ${!slot.color ? styles.activeSwatch : ''}`} onClick={() => writeSlot({ ...slot, color: undefined })}>{t('panel.settings.deck.colorAuto')}</button>
          {DECK_SWATCHES.map(c => (
            <button key={c} type="button" className={`${styles.swatch} ${slot.color === c ? styles.activeSwatch : ''}`} style={{ background: c }} onClick={() => writeSlot({ ...slot, color: c })} aria-label={c} />
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title={t('panel.settings.deck.label')}>
        <input className={styles.input} type="text" value={slot.label ?? ''} onChange={e => writeSlot({ ...slot, label: e.target.value })} />
      </SettingsSection>

      <SettingsSection title={t('panel.settings.deck.actionType')}>
        <div className={styles.fieldStack}>
          <Select
            className={styles.selectWide}
            value={kind}
            options={TOP_KINDS.map(k => ({ value: k, label: t(`panel.settings.deck.action.${k}`) }))}
            onChange={k => onKindChange(k as DeckActionType | 'folder')}
            ariaLabel={t('panel.settings.deck.actionType')}
          />
          {kind === 'folder' ? (
            <button type="button" className={styles.folderBtn} onClick={() => { setView({ folderPath: [...folderPath, selSlot] }); onSelectedSlotChange?.(0); }}>
              <FolderInput size={14} /> {t('panel.settings.deck.enterFolder')}
            </button>
          ) : slot.action ? (
            <ActionEditor action={slot.action} onChange={a => writeSlot({ ...slot, action: a })} showType={false} allowed={NESTED_KINDS} surface={surface} desktopEditor={desktopEditor} />
          ) : null}
        </div>
      </SettingsSection>
    </div>
  );
}
