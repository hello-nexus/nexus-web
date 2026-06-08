import { useEffect, useState } from 'react';
import { ChevronLeft, FolderInput } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { fetchService } from '../../../api/service';
import { AppPicker } from '../common/AppPicker';
import { IconPicker } from '../common/IconPicker';
import { SettingsRow, SettingsSelect, SettingsToggle } from '../common/SettingsRow/SettingsRow';
import type { WidgetSettingsProps, DeckEditView } from '../types';
import { HotkeyInput } from './HotkeyInput';
import { DeckGrid } from './DeckGrid';
import { innerGridForSize, readDeckConfig, resolveViewSlots, updateSlotAt, deckConfigPatch, padSlots } from './deckLayout';
import type { DeckAction, DeckActionType, DeckSlot } from './types';
import styles from './DeckSettings.module.scss';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const TOP_KINDS: (DeckActionType | 'folder')[] = [
  'launchApp', 'openUrl', 'openFile', 'openFolder', 'system', 'hotkey', 'text',
  'power', 'audioOutput', 'audioInput', 'nexus', 'sequence', 'toggle',
  'pageNext', 'pagePrev', 'pageGoto', 'folder',
];
const NESTED_KINDS: DeckActionType[] = [
  'launchApp', 'openUrl', 'openFile', 'openFolder', 'system', 'hotkey', 'text',
  'power', 'audioOutput', 'audioInput', 'nexus',
];

const SWATCHES = ['#ef4444', '#f97316', '#f59e0b', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6', '#a855f7', '#ec4899', '#64748b', '#ffffff'];

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
    case 'pageNext': return { type: 'pageNext' };
    case 'pagePrev': return { type: 'pagePrev' };
    case 'pageGoto': return { type: 'pageGoto', page: 0 };
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

// ── per-action field editors ──
function ActionEditor({ action, onChange, showTypeSelect, allowed }: {
  action: DeckAction;
  onChange: (a: DeckAction) => void;
  showTypeSelect: boolean;
  allowed: DeckActionType[];
}) {
  const { t } = useTranslation();
  return (
    <>
      {showTypeSelect && (
        <SettingsSelect
          label={t('panel.settings.deck.actionType')}
          value={action.type}
          options={allowed.map(k => ({ value: k, label: t(`panel.settings.deck.action.${k}`) }))}
          onChange={k => onChange(defaultActionFor(k as DeckActionType))}
        />
      )}
      <ActionFields action={action} onChange={onChange} />
    </>
  );
}

function ActionFields({ action, onChange }: { action: DeckAction; onChange: (a: DeckAction) => void }) {
  const { t } = useTranslation();
  const audioOut = useServiceOptions('/system/audio/devices', d => ((d as { outputs?: { id: string; name: string }[] })?.outputs ?? []).map(x => ({ value: x.id, label: x.name })));
  const audioIn = useServiceOptions('/system/audio/devices', d => ((d as { inputs?: { id: string; name: string }[] })?.inputs ?? []).map(x => ({ value: x.id, label: x.name })));
  const displays = useServiceOptions('/displays', d => ((d as { displays?: { id: string; name?: string; label?: string }[] })?.displays ?? []).map(x => ({ value: x.id, label: x.name ?? x.label ?? x.id })));

  switch (action.type) {
    case 'launchApp':
      return <AppPicker selectedId={action.appId} onSelect={app => onChange({ type: 'launchApp', appId: app.id })} />;
    case 'openUrl':
      return <SettingsRow label={t('panel.settings.url')}><input type="text" value={action.url} placeholder="https://example.com" onChange={e => onChange({ ...action, url: e.target.value })} /></SettingsRow>;
    case 'openFile':
      return <SettingsRow label={t('panel.settings.deck.path')}><input type="text" value={action.path} onChange={e => onChange({ ...action, path: e.target.value })} /></SettingsRow>;
    case 'openFolder':
      return <SettingsRow label={t('panel.settings.deck.path')}><input type="text" value={action.path} onChange={e => onChange({ ...action, path: e.target.value })} /></SettingsRow>;
    case 'system': {
      const a = action.action;
      const ops = ['volumeUp', 'volumeDown', 'volumeSet', 'muteToggle', 'mediaPlayPause', 'mediaNext', 'mediaPrev', 'brightnessUp', 'brightnessDown', 'brightnessSet'];
      return (
        <>
          <SettingsSelect label={t('panel.settings.deck.systemOp')} value={a.op} options={ops.map(o => ({ value: o, label: t(`panel.settings.deck.system.${o}`) }))} onChange={op => onChange({ type: 'system', action: { ...a, op: op as typeof a.op } })} />
          {a.op === 'volumeSet' && <SettingsRow label={t('panel.settings.deck.value')}><input type="number" min={0} max={100} value={Math.round((a.value ?? 0) * 100)} onChange={e => onChange({ type: 'system', action: { ...a, value: clamp(Number(e.target.value) / 100, 0, 1) } })} /></SettingsRow>}
          {a.op === 'brightnessSet' && <SettingsRow label={t('panel.settings.deck.value')}><input type="number" min={0} max={100} value={a.value ?? 0} onChange={e => onChange({ type: 'system', action: { ...a, value: clamp(Number(e.target.value), 0, 100) } })} /></SettingsRow>}
          {(a.op === 'brightnessUp' || a.op === 'brightnessDown' || a.op === 'brightnessSet') && (
            <SettingsSelect label={t('panel.settings.deck.display')} value={a.displayId ?? ''} options={displays} onChange={id => onChange({ type: 'system', action: { ...a, displayId: id } })} />
          )}
        </>
      );
    }
    case 'hotkey':
      return <SettingsRow label={t('panel.settings.deck.hotkey')}><HotkeyInput value={action.keys} onChange={keys => onChange({ ...action, keys })} /></SettingsRow>;
    case 'text':
      return (
        <>
          <SettingsRow label={t('panel.settings.deck.text')}><textarea value={action.text} rows={2} onChange={e => onChange({ ...action, text: e.target.value })} /></SettingsRow>
          <SettingsToggle label={t('panel.settings.deck.paste')} checked={action.paste ?? true} onChange={paste => onChange({ ...action, paste })} />
        </>
      );
    case 'power': {
      const ops = ['lock', 'sleep', 'shutdown', 'restart', 'logout'];
      return <SettingsSelect label={t('panel.settings.deck.powerOp')} value={action.action} options={ops.map(o => ({ value: o, label: t(`panel.settings.deck.power.${o}`) }))} onChange={op => onChange({ type: 'power', action: op as 'lock' })} />;
    }
    case 'audioOutput':
      return <SettingsSelect label={t('panel.settings.deck.audioOutput')} value={action.deviceId} options={audioOut} onChange={id => onChange({ type: 'audioOutput', deviceId: id })} />;
    case 'audioInput':
      return <SettingsSelect label={t('panel.settings.deck.audioInput')} value={action.deviceId} options={audioIn} onChange={id => onChange({ type: 'audioInput', deviceId: id })} />;
    case 'nexus':
      return <NexusFields action={action} onChange={onChange} />;
    case 'sequence':
      return <SequenceEditor action={action} onChange={onChange} />;
    case 'toggle':
      return <ToggleEditor action={action} onChange={onChange} />;
    case 'pageGoto':
      return <SettingsRow label={t('panel.settings.deck.page')}><input type="number" min={1} value={(action.page ?? 0) + 1} onChange={e => onChange({ type: 'pageGoto', page: Math.max(0, Number(e.target.value) - 1) })} /></SettingsRow>;
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
      <SettingsSelect label={t('panel.settings.deck.nexusOp')} value={a.op} options={ops.map(o => ({ value: o, label: t(`panel.settings.deck.nexus.${o}`) }))} onChange={op => set({ op: op as typeof a.op })} />
      {a.op === 'rgbEffect' && <SettingsRow label={t('panel.settings.deck.effect')}><input type="text" value={a.effect ?? ''} onChange={e => set({ effect: e.target.value })} /></SettingsRow>}
      {a.op === 'rgbScene' && <SettingsRow label={t('panel.settings.deck.scene')}><input type="text" value={a.profileId ?? ''} onChange={e => set({ profileId: e.target.value })} /></SettingsRow>}
      {a.op === 'lightingBrightness' && <SettingsRow label={t('panel.settings.deck.value')}><input type="number" min={0} max={100} value={Math.round((a.value ?? 1) * 100)} onChange={e => set({ value: clamp(Number(e.target.value) / 100, 0, 1) })} /></SettingsRow>}
      {a.op === 'lightingPower' && <><SettingsRow label={t('panel.settings.deck.device')}><input type="text" value={a.deviceId ?? ''} onChange={e => set({ deviceId: e.target.value })} /></SettingsRow><SettingsToggle label={t('panel.settings.deck.on')} checked={a.on ?? true} onChange={on => set({ on })} /></>}
      {a.op === 'fanProfile' && <SettingsSelect label={t('panel.settings.deck.fanProfile')} value={a.profile ?? 'Balanced'} options={['Silent', 'Balanced', 'Performance', 'auto'].map(p => ({ value: p, label: p }))} onChange={profile => set({ profile })} />}
      {a.op === 'fanSpeed' && <><SettingsRow label={t('panel.settings.deck.fan')}><input type="text" value={a.fanId ?? ''} onChange={e => set({ fanId: e.target.value })} /></SettingsRow><SettingsRow label={t('panel.settings.deck.value')}><input type="number" min={0} max={100} value={a.value ?? 0} onChange={e => set({ value: clamp(Number(e.target.value), 0, 100) })} /></SettingsRow></>}
      {a.op === 'y70Power' && <SettingsToggle label={t('panel.settings.deck.on')} checked={a.on ?? true} onChange={on => set({ on })} />}
      {a.op === 'y70Brightness' && <SettingsRow label={t('panel.settings.deck.value')}><input type="number" min={0} max={100} value={a.value ?? 0} onChange={e => set({ value: clamp(Number(e.target.value), 0, 100) })} /></SettingsRow>}
      {a.op === 'y70Rotation' && <SettingsSelect label={t('panel.settings.deck.orientation')} value={a.orientation ?? 'landscape'} options={['landscape', 'portrait'].map(o => ({ value: o, label: t(`panel.settings.deck.${o}`) }))} onChange={orientation => set({ orientation })} />}
    </>
  );
}

function SequenceEditor({ action, onChange }: { action: Extract<DeckAction, { type: 'sequence' }>; onChange: (a: DeckAction) => void }) {
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
          <ActionEditor action={step.action} onChange={a => setSteps(steps.map((s, j) => (j === i ? { ...s, action: a } : s)))} showTypeSelect allowed={NESTED_KINDS} />
          <SettingsRow label={t('panel.settings.deck.sequence.gapMs')}><input type="number" min={0} value={step.gapAfterMs ?? 60} onChange={e => setSteps(steps.map((s, j) => (j === i ? { ...s, gapAfterMs: Math.max(0, Number(e.target.value)) } : s)))} /></SettingsRow>
        </div>
      ))}
      <button type="button" onClick={() => setSteps([...steps, { action: defaultActionFor('system'), gapAfterMs: 60 }])}>
        {t('panel.settings.deck.sequence.addStep')}
      </button>
    </div>
  );
}

function ToggleEditor({ action, onChange }: { action: Extract<DeckAction, { type: 'toggle' }>; onChange: (a: DeckAction) => void }) {
  const { t } = useTranslation();
  const stateKinds = ['mute', 'lightingPower', 'internal'];
  return (
    <>
      <SettingsSelect label={t('panel.settings.deck.toggle.stateSource')} value={action.state?.kind ?? 'internal'} options={stateKinds.map(k => ({ value: k, label: t(`panel.settings.deck.toggle.state.${k}`) }))} onChange={kind => onChange({ ...action, state: { kind: kind as 'mute' } })} />
      <div className={styles.section}>
        <strong>{t('panel.settings.deck.toggle.onPress')}</strong>
        <ActionEditor action={action.on} onChange={on => onChange({ ...action, on })} showTypeSelect allowed={NESTED_KINDS} />
      </div>
      <div className={styles.section}>
        <strong>{t('panel.settings.deck.toggle.alternatePress')}</strong>
        <ActionEditor action={action.off} onChange={off => onChange({ ...action, off })} showTypeSelect allowed={NESTED_KINDS} />
      </div>
    </>
  );
}

export function DeckSettings({ widget, onUpdate, onResize, selectedSlot, onSelectedSlotChange, editView, onEditViewChange }: WidgetSettingsProps) {
  const { t } = useTranslation();
  void onResize;
  const deck = readDeckConfig(widget);
  const { count, cols, rows } = innerGridForSize(widget.size);

  const [internalSlot, setInternalSlot] = useState(0);
  const [internalView, setInternalView] = useState<DeckEditView>({ pageIndex: 0, folderPath: [] });
  const rawView = editView ?? internalView;
  const setView = onEditViewChange ?? setInternalView;
  const pageIndex = clamp(rawView.pageIndex, 0, deck.pages.length - 1);
  const view: DeckEditView = { pageIndex, folderPath: rawView.folderPath };

  const selSlot = clamp(selectedSlot ?? internalSlot, 0, count - 1);
  const setSelSlot = onSelectedSlotChange ?? setInternalSlot;

  const viewSlots = resolveViewSlots(deck, pageIndex, view.folderPath, count) ?? padSlots([], count);
  const slot = viewSlots[selSlot] ?? {};

  const writeSlot = (next: DeckSlot) => onUpdate(deckConfigPatch(updateSlotAt(deck, pageIndex, view.folderPath, selSlot, next, count)));
  const kind: DeckActionType | 'folder' = slot.folder ? 'folder' : (slot.action?.type ?? 'launchApp');
  const appIdForIcon = slot.action?.type === 'launchApp' ? slot.action.appId : undefined;

  const onKindChange = (k: DeckActionType | 'folder') => {
    if (k === 'folder') writeSlot({ ...slot, action: undefined, folder: slot.folder ?? { slots: [] } });
    else writeSlot({ ...slot, folder: undefined, action: defaultActionFor(k) });
  };

  const addPage = () => {
    onUpdate(deckConfigPatch({ ...deck, pages: [...deck.pages, { slots: [] }] }));
    setView({ pageIndex: deck.pages.length, folderPath: [] });
    setSelSlot(0);
  };
  const removePage = () => {
    if (deck.pages.length <= 1) return;
    const pages = deck.pages.filter((_, i) => i !== pageIndex);
    onUpdate(deckConfigPatch({ ...deck, pages }));
    setView({ pageIndex: clamp(pageIndex, 0, pages.length - 1), folderPath: [] });
    setSelSlot(0);
  };

  return (
    <>
      <SettingsToggle label={t('panel.settings.deck.showLabels')} checked={deck.showLabels === true} onChange={v => onUpdate(deckConfigPatch({ ...deck, showLabels: v }))} />

      <div className={styles.tabs}>
        {deck.pages.map((_, p) => (
          <button key={p} className={p === pageIndex ? styles.active : ''} onClick={() => { setView({ pageIndex: p, folderPath: [] }); setSelSlot(0); }}>
            {t('panel.settings.deck.pageN', { n: p + 1 })}
          </button>
        ))}
        <button className={styles.add} onClick={addPage}>{t('panel.settings.deck.addPage')}</button>
        {deck.pages.length > 1 && <button className={styles.remove} onClick={removePage}>{t('panel.settings.deck.removePage')}</button>}
      </div>

      {view.folderPath.length > 0 && (
        <div className={styles.breadcrumb}>
          <button onClick={() => { setView({ pageIndex, folderPath: view.folderPath.slice(0, -1) }); setSelSlot(0); }}>
            <ChevronLeft size={14} /> {t('panel.settings.deck.back')}
          </button>
        </div>
      )}

      <div className={styles.miniGrid} style={{ ['--mini-aspect' as string]: `${cols} / ${rows}` }}>
        <DeckGrid slots={viewSlots} cols={cols} rows={rows} showLabels={false} selectable selectedIndex={selSlot} onCell={setSelSlot} />
      </div>

      <div className={styles.section}>
        <SettingsRow label={t('panel.settings.icon')}>
          <IconPicker value={slot.icon} appId={appIdForIcon} onChange={icon => writeSlot({ ...slot, icon })} />
        </SettingsRow>

        <SettingsRow label={t('panel.settings.deck.color')}>
          <div className={styles.swatches}>
            <button type="button" className={`${styles.swatch} ${styles.autoSwatch} ${!slot.color ? styles.activeSwatch : ''}`} onClick={() => writeSlot({ ...slot, color: undefined })}>{t('panel.settings.deck.colorAuto')}</button>
            {SWATCHES.map(c => (
              <button key={c} type="button" className={`${styles.swatch} ${slot.color === c ? styles.activeSwatch : ''}`} style={{ background: c }} onClick={() => writeSlot({ ...slot, color: c })} aria-label={c} />
            ))}
          </div>
        </SettingsRow>

        <SettingsRow label={t('panel.settings.deck.label')}>
          <input type="text" value={slot.label ?? ''} onChange={e => writeSlot({ ...slot, label: e.target.value })} />
        </SettingsRow>

        <SettingsSelect
          label={t('panel.settings.deck.actionType')}
          value={kind}
          options={TOP_KINDS.map(k => ({ value: k, label: t(`panel.settings.deck.action.${k}`) }))}
          onChange={k => onKindChange(k as DeckActionType | 'folder')}
        />

        {kind === 'folder' ? (
          <button type="button" onClick={() => { setView({ pageIndex, folderPath: [...view.folderPath, selSlot] }); setSelSlot(0); }}>
            <FolderInput size={14} /> {t('panel.settings.deck.enterFolder')}
          </button>
        ) : slot.action ? (
          <ActionEditor action={slot.action} onChange={a => writeSlot({ ...slot, action: a })} showTypeSelect={false} allowed={NESTED_KINDS} />
        ) : null}
      </div>
    </>
  );
}
