import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Keyboard, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { InlineError } from '../../common/InlineError/InlineError';
import { Notice } from '../../common/Notice/Notice';
import { SettingRow } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { TextInput } from '../../common/TextInput/TextInput';
import { useTranslation } from '../../../lib/i18n';
import {
  deleteHotkey, newHotkeyId, putHotkey, resetHotkeyDefaults, useHotkeys,
  type HotkeyBinding, type HotkeyBindingInput, type HotkeyPlatform, type HotkeysResult,
} from '../../../api/hotkeys';
import { getDeckPreset } from '../../../api/deck';
import { useStreamDecks } from '../../../hooks/useStreamDecks';
import {
  ActionEditor, DeckEditContext, NESTED_KINDS, type DeckPickerKind,
} from '../../../panel/widgets/deck/DeckKeyInspector';
import { HotkeyRecorder } from '../../../panel/widgets/deck/HotkeyRecorder';
import {
  bindingName, checkCombo, describeSlot, editorTargetFor, findDuplicate, findTag, formatCombo, hotkeyErrorText,
} from '../../../panel/widgets/deck/hotkeyCombo';
import { useHotkeyDeckInfo } from '../../../panel/widgets/deck/useHotkeyDeckInfo';
import type { DeckEditorTarget } from '../../../panel/widgets/deck/deckOpenEditorNav';
import type { DeckAction } from '../../../panel/widgets/deck/types';
import pageStyles from './SettingsView.module.scss';
import styles from './HotkeysTab.module.scss';

interface HotkeysTabProps {
  serviceOnline: boolean;
  /** Opens a deck's editor on a key or dial; supplied by the dashboard shell. */
  onOpenDeckEditor?: (target: DeckEditorTarget) => void;
}

// What a global hotkey may run: every nested-capable kind, minus the kinds that act on a deck's own
// screen (a hotkey has no deck serial, so they would do nothing).
const GLOBAL_KINDS: DeckPickerKind[] = NESTED_KINDS.filter(k => k !== 'deckBrightness' && k !== 'deckSleep');
const GLOBAL_EDIT_CONTEXT = { freezeSeed: false, serviceOps: true };

// SettingRow chip tone for a status that needs attention.
const WARN_TONE = 'warn' as const;
const WARN_STATUSES = new Set(['conflict', 'orphaned', 'unsupported']);

// Errors for actions with no row of their own show under the toolbar.
const TOOLBAR_ERROR = 'toolbar';
const FORM_ERROR = 'form';

function toInput(b: HotkeyBinding): HotkeyBindingInput {
  return { id: b.id, combo: b.combo, enabled: b.enabled, label: b.label, target: b.target };
}

export function HotkeysTab({ serviceOnline, onOpenDeckEditor }: HotkeysTabProps) {
  const { t } = useTranslation();
  const { state, loaded, apply } = useHotkeys(serviceOnline);
  const { decks } = useStreamDecks(serviceOnline);
  const [error, setError] = useState<{ id: string; msg: string } | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<HotkeyBinding | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const bindings = useMemo(() => state?.bindings ?? [], [state]);
  const deckSerials = useMemo(() => decks.map(d => d.serial), [decks]);
  const { presetNames, configs, serialByPreset, holders } = useHotkeyDeckInfo(serviceOnline, bindings, { configs: true, deckSerials });

  const platform: HotkeyPlatform = state?.platform ?? 'windows';
  const nameOf = (b: HotkeyBinding) => bindingName(b, t, presetNames, configs);

  const settle = (id: string, res: HotkeysResult): boolean => {
    if (res.ok) {
      apply(res.state);
      setError(null);
      return true;
    }
    setError({ id, msg: hotkeyErrorText(t, res.msg, res.code) });
    return false;
  };

  // Refuses what the service would, so the reason shows next to the row before any request.
  const guard = (id: string, b: HotkeyBinding, combo: string | null, enabled: boolean): boolean => {
    if (combo) {
      const check = checkCombo(combo);
      if (check !== 'ok') {
        setError({ id, msg: t(check === 'needsModifier' ? 'hotkeys.error.needsModifier' : 'hotkeys.error.invalidCombo') });
        return false;
      }
      const dup = enabled ? findDuplicate(bindings, combo, b.id) : undefined;
      if (dup) {
        setError({ id, msg: t('hotkeys.duplicate', { combo: formatCombo(combo, platform, t), name: nameOf(dup) }) });
        return false;
      }
    }
    return true;
  };

  const setCombo = async (b: HotkeyBinding, combo: string | null) => {
    if (!guard(b.id, b, combo, true)) return;
    settle(b.id, await putHotkey({ ...toInput(b), combo, enabled: true }));
  };

  // There is no on/off control: a binding is live whenever it has a combo. A binding saved
  // disabled by an earlier build is switched on once so it cannot stay stuck off.
  const healed = useRef(new Set<string>());
  useEffect(() => {
    for (const b of bindings) {
      if (!b.combo || b.enabled || healed.current.has(b.id)) continue;
      healed.current.add(b.id);
      void putHotkey({ ...toInput(b), enabled: true }).then(res => { if (res.ok) apply(res.state); });
    }
  }, [bindings, apply]);

  const openEditor = async (b: HotkeyBinding) => {
    if (b.target.kind !== 'deck' || !onOpenDeckEditor) return;
    const { presetId, tag } = b.target;
    const serial = serialByPreset[presetId];
    const deck = decks.find(d => d.serial === serial);
    const preset = await getDeckPreset(presetId);
    const where = preset ? findTag(preset.deck, tag) : null;
    const at = serial && deck && preset && where
      ? editorTargetFor(where, { cols: preset.cols, rows: preset.rows, deck: preset.deck }, { cols: deck.cols, rows: deck.rows, kind: 'physical' })
      : null;
    if (!at || !serial) {
      setError({ id: b.id, msg: t('hotkeys.deck.openFailed') });
      return;
    }
    setError(null);
    onOpenDeckEditor({ serial, ...at });
  };

  if (!state) {
    return loaded ? <div className={pageStyles.tabPanel}><Notice tone="warning" role="status">{t('hotkeys.unavailable')}</Notice></div> : null;
  }

  if (!state.supported) {
    return (
      <div className={pageStyles.tabPanel}>
        <Notice tone="info" role="status">{t('hotkeys.unsupported')}</Notice>
      </div>
    );
  }

  const actionRows = bindings.filter(b => b.target.kind === 'action');
  const deckRows = bindings.filter(b => b.target.kind === 'deck');

  const renderRow = (b: HotkeyBinding) => {
    const deck = b.target.kind === 'deck' ? b.target : null;
    const hasEditor = !!deck && !!serialByPreset[deck.presetId] && !!onOpenDeckEditor;
    const rowError = error?.id === b.id ? error.msg : '';
    const where = deck && configs[deck.presetId] ? findTag(configs[deck.presetId], deck.tag) : null;
    const held = deck ? holders[deck.presetId] : undefined;
    const deckNames = held ? [
      ...held.serials.map(serial => decks.find(d => d.serial === serial)?.name).filter((n): n is string => !!n),
      ...(held.widgets > 0 ? [t('hotkeys.deck.widget')] : []),
    ] : [];
    const description = where || rowError ? (
      <>
        {where && `${b.label ? `${presetNames[deck!.presetId] ?? t('hotkeys.deck.unknownPreset')}: ` : ''}${describeSlot(where, t)}`}
        {deckNames.length > 0 && <span className={styles.holder}>{t('hotkeys.deck.holder', { deck: deckNames.join(', ') })}</span>}
        {rowError && <InlineError className={styles.rowError}>{rowError}</InlineError>}
      </>
    ) : undefined;
    return (
      <SettingRow
        key={b.id}
        label={deck && !b.label ? (presetNames[deck.presetId] ?? t('hotkeys.deck.unknownPreset')) : (b.label ?? nameOf(b))}
        description={description}
        state={WARN_STATUSES.has(b.status) ? { label: t(`hotkeys.status.${b.status}`), tone: WARN_TONE } : undefined}
      >
        <div className={styles.controls}>
          <div className={styles.recorder}>
            <HotkeyRecorder
              value={b.combo ?? ''}
              display={b.combo ? formatCombo(b.combo, platform, t) : undefined}
              onChange={keys => void setCombo(b, keys)}
              onClear={() => void setCombo(b, null)}
            />
          </div>
          {hasEditor && (
            <Button
              type="button"
              size="sm"
              tone="ghost"
              icon={<ExternalLink size={14} aria-hidden />}
              aria-label={t('hotkeys.deck.open')}
              title={t('hotkeys.deck.open')}
              onClick={() => void openEditor(b)}
            />
          )}
          <Button
            type="button"
            size="sm"
            tone="ghost"
            icon={<Trash2 size={14} aria-hidden />}
            aria-label={t('hotkeys.delete')}
            title={t('hotkeys.delete')}
            onClick={() => setConfirmDelete(b)}
          />
        </div>
      </SettingRow>
    );
  };

  return (
    <div className={pageStyles.tabPanel}>
      <SettingsSection
        title={t('hotkeys.group.nexus')}
        description={t('hotkeys.description')}
        action={(
          <div className={styles.toolbar}>
            <Button type="button" size="sm" tone="neutral" icon={<Plus size={14} aria-hidden />} onClick={() => setAdding(true)} disabled={adding}>
              {t('hotkeys.addButton')}
            </Button>
            <Button type="button" size="sm" tone="neutral" onClick={() => setConfirmReset(true)}>
              {t('hotkeys.reset')}
            </Button>
          </div>
        )}
      >
        {error?.id === TOOLBAR_ERROR && <InlineError>{error.msg}</InlineError>}
        {actionRows.length > 0 ? actionRows.map(renderRow) : <EmptyState compact icon={<Keyboard size={20} aria-hidden />} title={t('hotkeys.empty.nexus')} />}
      </SettingsSection>

      {adding && (
        <NewHotkeyForm
          bindings={bindings}
          platform={platform}
          nameOf={nameOf}
          onCancel={() => {
            setAdding(false);
            setError(current => (current?.id === FORM_ERROR ? null : current));
          }}
          onSave={async input => {
            const ok = settle(FORM_ERROR, await putHotkey(input));
            if (ok) setAdding(false);
          }}
          error={error?.id === FORM_ERROR ? error.msg : ''}
        />
      )}

      <SettingsSection title={t('hotkeys.group.deck')}>
        {deckRows.length > 0 ? deckRows.map(renderRow) : <EmptyState compact icon={<Keyboard size={20} aria-hidden />} title={t('hotkeys.empty.deck')} />}
      </SettingsSection>

      <ConfirmModal
        open={confirmDelete !== null}
        title={t('hotkeys.delete.title')}
        message={t('hotkeys.delete.message', { name: confirmDelete ? nameOf(confirmDelete) : '' })}
        confirmLabel={t('common.delete')}
        onConfirm={async () => {
          const target = confirmDelete;
          setConfirmDelete(null);
          if (target) settle(target.id, await deleteHotkey(target.id));
        }}
        onCancel={() => setConfirmDelete(null)}
      />
      <ConfirmModal
        open={confirmReset}
        title={t('hotkeys.reset.title')}
        message={t('hotkeys.reset.message')}
        confirmLabel={t('hotkeys.reset.confirm')}
        destructive={false}
        onConfirm={async () => {
          setConfirmReset(false);
          settle(TOOLBAR_ERROR, await resetHotkeyDefaults());
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}

interface NewHotkeyFormProps {
  bindings: readonly HotkeyBinding[];
  platform: HotkeyPlatform;
  error: string;
  nameOf: (b: HotkeyBinding) => string;
  onCancel: () => void;
  onSave: (input: HotkeyBindingInput) => Promise<void>;
}

// The action comes from the deck key inspector's own ActionEditor, so every
// field a key action has is available here without a second copy of it.
function NewHotkeyForm({ bindings, platform, error, nameOf, onCancel, onSave }: NewHotkeyFormProps) {
  const { t } = useTranslation();
  const [action, setAction] = useState<DeckAction>(() => ({ type: 'nexus', action: { op: 'toggleWindow' } }));
  const [label, setLabel] = useState('');
  const [combo, setCombo] = useState('');
  const dup = combo ? findDuplicate(bindings, combo) : undefined;
  const check = combo ? checkCombo(combo) : 'ok';
  const problem = dup
    ? t('hotkeys.duplicate', { combo: formatCombo(combo, platform, t), name: nameOf(dup) })
    : check === 'needsModifier' ? t('hotkeys.error.needsModifier')
      : check === 'invalid' ? t('hotkeys.error.invalidCombo')
        : error;

  return (
    <SettingsSection title={t('hotkeys.new.title')}>
      <DeckEditContext.Provider value={GLOBAL_EDIT_CONTEXT}>
        <div className={styles.form}>
          <ActionEditor action={action} onChange={setAction} showType allowed={GLOBAL_KINDS} desktopEditor />
        </div>
      </DeckEditContext.Provider>
      <SettingRow label={t('hotkeys.new.label')}>
        <TextInput value={label} onInput={setLabel} placeholder={t('hotkeys.new.labelPlaceholder')} ariaLabel={t('hotkeys.new.label')} />
      </SettingRow>
      <SettingRow label={t('hotkeys.new.shortcut')}>
        <div className={styles.recorder}>
          <HotkeyRecorder
            value={combo}
            display={combo ? formatCombo(combo, platform, t) : undefined}
            onChange={setCombo}
            onClear={() => setCombo('')}
          />
        </div>
      </SettingRow>
      {problem && <InlineError>{problem}</InlineError>}
      <div className={styles.formActions}>
        <Button type="button" size="sm" tone="ghost" onClick={onCancel}>{t('confirm.cancel')}</Button>
        <Button
          type="button"
          size="sm"
          tone="accent"
          disabled={!combo || check !== 'ok' || !!dup}
          onClick={() => void onSave({
            id: newHotkeyId(),
            combo,
            enabled: true,
            label: label.trim() || undefined,
            target: { kind: 'action', action },
          })}
        >
          {t('hotkeys.addButton')}
        </Button>
      </div>
    </SettingsSection>
  );
}
