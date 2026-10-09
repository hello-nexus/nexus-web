import { useEffect, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react';
import { useDraggable } from '@dnd-kit/core';
import { Button } from '../../../components/common/Button/Button';
import { CollapsibleSection } from '../../../components/common/CollapsibleSection/CollapsibleSection';
import { EmptyState } from '../../../components/common/EmptyState/EmptyState';
import { Select } from '../../../components/common/Select/Select';
import { Slider } from '../../../components/common/Slider/Slider';
import { useTranslation } from '../../../lib/i18n';
import { fetchAudioMixer } from '../../../api/mixer';
import { SettingsRow, SettingsSection } from '../common/SettingsRow/SettingsRow';
import { IconPicker } from '../common/IconPicker';
import { canEditFreeText } from '../../types';
import type { PanelSurface } from '../../types';
import {
  ActionEditor, Field, NESTED_KINDS, SelectField, SwatchRow, kindsForTarget, useMonitoringPicker, useServiceOptions,
  defaultActionFor,
} from './DeckKeyInspector';
import { DECK_ICONS } from './deckIcons';
import {
  DIAL_PICKER_CATEGORIES, MAX_DIAL_STACK, assignDialAction, dialAutoIconName, dialEntryAt, isDialStack, stackAddEntry,
  stackMoveEntry, stackRemoveEntry, writeDialEntry,
} from './deckDials';
import { resolveTargetDials, type DeckTarget } from './deckTarget';
import type { DeckAction, DeckDial, DeckDialAction, DeckDialActionType, DeckMonitoringCategory, DeckMonitoringPress } from './types';
import keyStyles from './DeckKeyInspector.module.scss';
import styles from './DeckDialInspector.module.scss';

const MONITORING_PRESSES: DeckMonitoringPress[] = ['none', 'taskManager', 'monitoringPage'];
const DEFAULT_STEP = 2;
const MAX_STEP = 10;
const CUSTOM_SLOTS = ['turnRight', 'turnLeft', 'push', 'touch'] as const;

function DialPickerItem({ type, active, onPick }: { type: DeckDialActionType; active: boolean; onPick: (type: DeckDialActionType) => void }) {
  const { t } = useTranslation();
  const drag = useDraggable({ id: `pickdial:${type}` });
  const Icon = DECK_ICONS[dialAutoIconName({ type } as DeckDialAction)] ?? Plus;
  return (
    <button
      ref={drag.setNodeRef}
      {...drag.attributes}
      {...drag.listeners}
      type="button"
      role="option"
      aria-selected={active}
      className={`${keyStyles.kindItem} ${active ? keyStyles.kindItemActive : ''}`}
      style={{ opacity: drag.isDragging ? 0.4 : undefined }}
      onClick={() => onPick(type)}
    >
      <Icon size={14} aria-hidden className={keyStyles.kindIcon} />
      {t(`panel.settings.deck.dial.action.${type}`)}
    </button>
  );
}

/** Floating chip shown in the DragOverlay while a dial action is dragged from the picker. */
export function DeckDialDragPreview({ type }: { type: DeckDialActionType }) {
  const { t } = useTranslation();
  const Icon = DECK_ICONS[dialAutoIconName({ type } as DeckDialAction)] ?? Plus;
  return (
    <div className={`${keyStyles.kindItem} ${keyStyles.kindItemActive} ${keyStyles.kindDragPreview}`}>
      <Icon size={14} aria-hidden className={keyStyles.kindIcon} />
      {t(`panel.settings.deck.dial.action.${type}`)}
    </div>
  );
}

type SteppedAction = Exclude<DeckDialAction, { type: 'page' | 'monitoring' | 'custom' }>;

function StepField({ action, onChange }: { action: SteppedAction; onChange: (a: DeckDialAction) => void }) {
  const { t } = useTranslation();
  return (
    <Slider
      // eslint-disable-next-line i18next/no-literal-string -- Slider orientation enum value
      orientation="stacked"
      editable
      trackFill
      label={t('panel.settings.deck.dial.step')}
      ariaLabel={t('panel.settings.deck.dial.step')}
      value={action.step ?? DEFAULT_STEP}
      min={1}
      max={MAX_STEP}
      onChange={v => onChange({ ...action, step: Math.round(v) })}
    />
  );
}

type AudioKind = 'outputs' | 'inputs';

function DeviceField({ action, kind, onChange }: {
  action: Extract<DeckDialAction, { type: 'volume' | 'micVolume' }>; kind: AudioKind; onChange: (a: DeckDialAction) => void;
}) {
  const { t } = useTranslation();
  const options = useServiceOptions('/system/audio/devices', d => ((d as Record<AudioKind, { id: string; name: string }[]> | null)?.[kind] ?? []).map(x => ({ value: x.id, label: x.name })));
  const defaultLabel = t(kind === 'outputs' ? 'panel.settings.deck.dial.defaultOutput' : 'panel.settings.deck.dial.defaultInput');
  return (
    <SelectField
      label={t(kind === 'outputs' ? 'panel.settings.deck.audioOutput' : 'panel.settings.deck.audioInput')}
      value={action.deviceId ?? ''}
      options={[{ value: '', label: defaultLabel }, ...options]}
      onChange={deviceId => {
        const next = { ...action };
        if (deviceId) next.deviceId = deviceId; else delete next.deviceId;
        onChange(next);
      }}
    />
  );
}

function AppField({ action, onChange }: { action: Extract<DeckDialAction, { type: 'appVolume' }>; onChange: (a: DeckDialAction) => void }) {
  const { t } = useTranslation();
  const [apps, setApps] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    void fetchAudioMixer().then(state => {
      if (!cancelled) setApps((state?.sessions ?? []).map(s => ({ value: s.id, label: s.name })));
    });
    return () => { cancelled = true; };
  }, []);
  const known = apps.some(a => a.value === action.appId);
  const options = known || !action.appId ? apps : [{ value: action.appId, label: action.appName || action.appId }, ...apps];
  return (
    <SelectField
      label={t('panel.settings.deck.dial.app')}
      value={action.appId}
      options={options}
      onChange={appId => onChange({ ...action, appId, appName: apps.find(a => a.value === appId)?.label })}
    />
  );
}

function DisplayField({ action, onChange }: { action: Extract<DeckDialAction, { type: 'displayBrightness' }>; onChange: (a: DeckDialAction) => void }) {
  const { t } = useTranslation();
  const displays = useServiceOptions('/displays', d => ((d as { displays?: { id: string; name?: string; label?: string }[] })?.displays ?? []).map(x => ({ value: x.id, label: x.name ?? x.label ?? x.id })));
  useEffect(() => {
    if (!action.displayId && displays.length > 0) onChange({ ...action, displayId: displays[0].value });
  }, [action, displays, onChange]);
  return <SelectField label={t('panel.settings.deck.display')} value={action.displayId} options={displays} onChange={displayId => onChange({ ...action, displayId })} />;
}

function MonitoringDialFields({ action, onChange, surface, desktopEditor }: {
  action: Extract<DeckDialAction, { type: 'monitoring' }>; onChange: (a: DeckDialAction) => void; surface?: PanelSurface; desktopEditor?: boolean;
}) {
  const { t } = useTranslation();
  const { categoryOptions, sensorOptions, sensorValue } = useMonitoringPicker(action.category, action.sensor);
  useEffect(() => {
    if (sensorValue && sensorValue !== action.sensor) onChange({ ...action, sensor: sensorValue });
  }, [sensorValue, action, onChange]);
  const canType = canEditFreeText(surface, desktopEditor);
  return (
    <>
      <div className={keyStyles.sensorRow}>
        <Select
          className={keyStyles.selectSmall}
          value={action.category}
          options={categoryOptions}
          onChange={category => onChange({ ...action, category: category as DeckMonitoringCategory, sensor: '' })}
          ariaLabel={t('monitoring.settings.device')}
        />
        <Select
          className={keyStyles.selectWide}
          value={sensorValue}
          options={sensorOptions}
          onChange={sensor => onChange({ ...action, sensor })}
          ariaLabel={t('monitoring.settings.sensor')}
        />
      </div>
      {canType && (
        <Field label={t('panel.settings.deck.dial.labelText')}>
          <input
            className={keyStyles.input}
            type="text"
            value={action.labelText ?? ''}
            aria-label={t('panel.settings.deck.dial.labelText')}
            onChange={e => {
              const next = { ...action };
              if (e.target.value) next.labelText = e.target.value; else delete next.labelText;
              onChange(next);
            }}
          />
        </Field>
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

function CustomDialFields({ action, onChange, target, surface, desktopEditor }: {
  action: Extract<DeckDialAction, { type: 'custom' }>; onChange: (a: DeckDialAction) => void; target: DeckTarget; surface?: PanelSurface; desktopEditor?: boolean;
}) {
  const { t } = useTranslation();
  const allowed = kindsForTarget(NESTED_KINDS, target.kind);
  const set = (slot: typeof CUSTOM_SLOTS[number], next: DeckAction | undefined) => {
    const copy = { ...action };
    if (next) copy[slot] = next; else delete copy[slot];
    onChange(copy);
  };
  return (
    <>
      {CUSTOM_SLOTS.map(slot => {
        const bound = action[slot];
        return (
          <div className={keyStyles.branch} key={slot}>
            <div className={keyStyles.branchLabel}>{t(`panel.settings.deck.dial.custom.${slot}`)}</div>
            {bound ? (
              <>
                <ActionEditor action={bound} onChange={a => set(slot, a)} showType allowed={allowed} surface={surface} desktopEditor={desktopEditor} />
                <Button type="button" size="sm" tone="neutral" icon={<X size={14} aria-hidden />} onClick={() => set(slot, undefined)}>
                  {t('panel.settings.deck.dial.custom.clear')}
                </Button>
              </>
            ) : (
              <Button type="button" size="sm" tone="neutral" icon={<Plus size={14} aria-hidden />} onClick={() => set(slot, defaultActionFor('hotkey'))}>
                {t('panel.settings.deck.dial.custom.add')}
              </Button>
            )}
          </div>
        );
      })}
    </>
  );
}

function DialActionFields({ action, onChange, target, surface, desktopEditor }: {
  action: DeckDialAction; onChange: (a: DeckDialAction) => void; target: DeckTarget; surface?: PanelSurface; desktopEditor?: boolean;
}) {
  const { t } = useTranslation();
  switch (action.type) {
    case 'volume':
      return (<><DeviceField action={action} kind="outputs" onChange={onChange} /><StepField action={action} onChange={onChange} /></>);
    case 'micVolume':
      return (<><DeviceField action={action} kind="inputs" onChange={onChange} /><StepField action={action} onChange={onChange} /></>);
    case 'appVolume':
      return (<><AppField action={action} onChange={onChange} /><StepField action={action} onChange={onChange} /></>);
    case 'displayBrightness':
      return (<><DisplayField action={action} onChange={onChange} /><StepField action={action} onChange={onChange} /></>);
    case 'deckBrightness':
    case 'lightingBrightness':
    case 'y70Brightness':
      return <StepField action={action} onChange={onChange} />;
    case 'page':
      return <p className={keyStyles.description}>{t('panel.settings.deck.dial.pageHint')}</p>;
    case 'monitoring':
      return <MonitoringDialFields action={action} onChange={onChange} surface={surface} desktopEditor={desktopEditor} />;
    case 'custom':
      return <CustomDialFields action={action} onChange={onChange} target={target} surface={surface} desktopEditor={desktopEditor} />;
  }
}

export interface DeckDialInspectorProps {
  target: DeckTarget;
  page: number;
  folderPath: readonly number[];
  selectedDial: number | null;
  onSelectedDialChange: (index: number) => void;
  /** Stack entry being edited; 0 for a dial without a stack. */
  entryIndex: number;
  onEntryIndexChange: (index: number) => void;
  surface?: PanelSurface;
  desktopEditor?: boolean;
  /** 'picker' is the dial action list; 'editor' is the selected dial's fields. */
  part: 'picker' | 'editor';
}

/** Dial counterpart of DeckKeyInspector: the dial action list and the selected dial's action, look and stack editor. */
export function DeckDialInspector({ target, page, folderPath, selectedDial, onSelectedDialChange, entryIndex, onEntryIndexChange, surface, desktopEditor, part }: DeckDialInspectorProps) {
  const { t } = useTranslation();
  const dials = resolveTargetDials(target, page, folderPath);
  const index = selectedDial == null ? 0 : Math.min(selectedDial, Math.max(0, dials.length - 1));
  const dial: DeckDial = dials[index] ?? {};
  const stacked = isDialStack(dial);
  const entryAt = stacked ? Math.min(entryIndex, dial.stack!.length - 1) : 0;
  const entry = dialEntryAt(dial, entryAt);
  const [openKeys, setOpenKeys] = useState<Set<string>>(() => new Set(DIAL_PICKER_CATEGORIES.map(c => c.key)));
  const toggleOpen = (key: string) => setOpenKeys(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const writeDial = (next: DeckDial) => target.updateDial(page, folderPath, index, next);
  const writeEntry = (next: DeckDial) => writeDial(writeDialEntry(dial, entryAt, next));

  if (part === 'picker') {
    return (
      <SettingsSection title={t('panel.settings.deck.dial.actionType')}>
        <div className={keyStyles.categoryList}>
          {DIAL_PICKER_CATEGORIES.map(cat => (
            <CollapsibleSection key={cat.key} title={t(cat.labelKey)} open={openKeys.has(cat.key)} onToggle={() => toggleOpen(cat.key)} compact>
              <div className={keyStyles.kindList} role="listbox" aria-label={t(cat.labelKey)}>
                {cat.types.map(type => (
                  <DialPickerItem
                    key={type}
                    type={type}
                    active={selectedDial != null && entry.action?.type === type}
                    onPick={picked => { writeDial(assignDialAction(dial, entryAt, picked)); onSelectedDialChange(index); }}
                  />
                ))}
              </div>
            </CollapsibleSection>
          ))}
        </div>
      </SettingsSection>
    );
  }

  const stackSection: ReactNode = (
    <SettingsSection title={t('panel.settings.deck.dial.stack.title')}>
      {stacked ? (
        <div className={styles.stackList}>
          {dial.stack!.map((e, i) => (
            <div className={`${styles.stackRow} ${i === entryAt ? styles.stackRowActive : ''}`} key={i}>
              <button type="button" className={styles.stackPick} aria-pressed={i === entryAt} onClick={() => onEntryIndexChange(i)}>
                {t('panel.settings.deck.dial.stack.entry', { n: i + 1 })}
                {e.action ? ` - ${t(`panel.settings.deck.dial.action.${e.action.type}`)}` : ''}
              </button>
              <Button type="button" tone="ghost" size="sm" icon={<ArrowUp size={14} aria-hidden />} disabled={i === 0} aria-label={t('panel.settings.deck.dial.stack.moveUp')} onClick={() => { writeDial(stackMoveEntry(dial, i, -1)); if (i === entryAt) onEntryIndexChange(i - 1); }} />
              <Button type="button" tone="ghost" size="sm" icon={<ArrowDown size={14} aria-hidden />} disabled={i === dial.stack!.length - 1} aria-label={t('panel.settings.deck.dial.stack.moveDown')} onClick={() => { writeDial(stackMoveEntry(dial, i, 1)); if (i === entryAt) onEntryIndexChange(i + 1); }} />
              <Button type="button" tone="ghost" size="sm" icon={<Trash2 size={14} aria-hidden />} aria-label={t('panel.settings.deck.dial.stack.remove')} onClick={() => { writeDial(stackRemoveEntry(dial, i)); onEntryIndexChange(Math.max(0, Math.min(entryAt, dial.stack!.length - 2))); }} />
            </div>
          ))}
        </div>
      ) : (
        <p className={keyStyles.description}>{t('panel.settings.deck.dial.stack.hint')}</p>
      )}
      <Button
        type="button"
        size="sm"
        tone="neutral"
        icon={<Plus size={14} aria-hidden />}
        disabled={stacked && dial.stack!.length >= MAX_DIAL_STACK}
        onClick={() => { writeDial(stackAddEntry(dial)); onEntryIndexChange(stacked ? dial.stack!.length : 1); }}
      >
        {t('panel.settings.deck.dial.stack.add')}
      </Button>
    </SettingsSection>
  );

  const action = entry.action;
  return (
    <div className={keyStyles.root}>
      {stackSection}

      {action ? (
        <SettingsSection title={t(`panel.settings.deck.dial.action.${action.type}`)}>
          <div className={keyStyles.fieldStack}>
            <DialActionFields action={action} onChange={a => writeEntry({ ...entry, action: a })} target={target} surface={surface} desktopEditor={desktopEditor} />
          </div>
        </SettingsSection>
      ) : (
        <EmptyState compact title={t('panel.settings.deck.dial.emptyHint')} />
      )}

      <SettingsSection title={t('panel.settings.icon')}>
        <IconPicker
          key={`${page}:${folderPath.join('.')}:${index}:${entryAt}`}
          value={entry.icon}
          surface={surface}
          desktopEditor={desktopEditor}
          onChange={icon => writeEntry({ ...entry, icon })}
        />
        <SwatchRow label={t('panel.settings.deck.color')} value={entry.color} onChange={color => writeEntry({ ...entry, color })} />
      </SettingsSection>

      <SettingsSection title={t('panel.settings.deck.titleStyle.section')}>
        <SettingsRow label={t('panel.settings.deck.label')} wrapControl>
          <input
            className={keyStyles.input}
            type="text"
            value={entry.label ?? ''}
            placeholder={t('panel.settings.deck.labelPlaceholder')}
            aria-label={t('panel.settings.deck.label')}
            onChange={e => writeEntry({ ...entry, label: e.target.value || undefined })}
          />
        </SettingsRow>
      </SettingsSection>

      <Button type="button" tone="danger" className={keyStyles.deleteBtn} icon={<Trash2 size={14} aria-hidden />} onClick={() => writeDial({})}>
        {t('panel.settings.deck.dial.clear')}
      </Button>
    </div>
  );
}
