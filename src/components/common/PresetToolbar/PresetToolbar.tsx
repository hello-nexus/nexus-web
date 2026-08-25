import { useState } from 'react';
import { RotateCcw, Undo2, Redo2, Pencil, Trash2, Plus, Import, AppWindow } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { isApplePlatform } from '../../../lib/platform';
import { isNameTaken } from '../../../lib/nameCollision';
import { Button } from '../Button/Button';
import { Select } from '../Select/Select';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';
import { PromptModal } from '../PromptModal/PromptModal';
import styles from './PresetToolbar.module.scss';

export const PRESET_CAP = 10;

const isMac = isApplePlatform();

export interface PresetToolbarPreset {
  id: string;
  name: string;
  /** Marks the preset with an app glyph: an app in focus activates it. */
  hasApps?: boolean;
}

interface PresetToolbarProps {
  presets: PresetToolbarPreset[];
  activeId: string | null;
  presetCount: number;
  cap?: number;
  onLoad: (id: string) => void;
  onCreate: (name: string) => Promise<{ error: boolean; msg?: string }>;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** Appends an "Import preset..." option after "New preset...", disabled at
   *  cap the same way. Omit to hide the option entirely (every existing
   *  caller). */
  onImport?: () => void;
  /** i18n key for the import option's label, falling back to
   *  `${translationPrefix}.importOption` like resetLabelKey does for reset. */
  importLabelKey?: string;
  /** Greys the import option out while the caller cannot accept one (the
   *  cooling page during a fan calibration), on top of the cap rule. */
  importDisabled?: boolean;
  /** Undo/Redo controls, plus Reset when `onReset` is supplied. Off for
   *  callers with no editable history to undo; on (default) matches the
   *  original lighting-canvas toolbar. */
  showHistory?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onReset?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Prefix for every string key this toolbar reads, so a caller can supply
   *  its own translated copy instead of the lighting layout-preset strings. */
  translationPrefix?: string;
  /** Full i18n key overrides for just the reset button/confirm text, when
   *  `translationPrefix`'s reset wording is lighting-specific ("Reset
   *  layout") and doesn't fit this caller's domain. Fall back to
   *  `${translationPrefix}.reset` / `.resetConfirm`. */
  resetLabelKey?: string;
  resetConfirmKey?: string;
  /** Adds an "Apps" option that opens the caller's app-binding modal. Omit to
   *  hide the option entirely (every existing caller). */
  onManageApps?: () => void;
  /** Hides the create/rename options - both open a PromptModal text input,
   *  unusable on a keyboardless surface. Switching and deleting stay
   *  available. Defaults to true (every existing caller keeps typing). */
  allowCreateRename?: boolean;
}

export function PresetToolbar({
  presets, activeId, presetCount, cap = PRESET_CAP,
  onLoad, onCreate, onRename, onDelete, onImport, importLabelKey, importDisabled, onManageApps,
  showHistory = true, canUndo = false, canRedo = false, onReset, onUndo, onRedo,
  translationPrefix = 'lighting.layoutPresets',
  resetLabelKey, resetConfirmKey,
  allowCreateRename = true,
}: PresetToolbarProps) {
  const { t } = useTranslation();
  const key = (suffix: string) => `${translationPrefix}.${suffix}`;
  const resetKey = resetLabelKey ?? key('reset');
  const resetConfirmMessageKey = resetConfirmKey ?? key('resetConfirm');
  const importKey = importLabelKey ?? key('importOption');
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptMode, setPromptMode] = useState<'create' | 'rename'>('create');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [lastAttemptedValue, setLastAttemptedValue] = useState('');

  const activePreset = presets.find(p => p.id === activeId) ?? null;
  const atCap = presetCount >= cap;

  const selectOptions = [
    ...presets.map(p => ({
      value: p.id,
      label: p.name,
      ...(p.hasApps ? { icon: <AppWindow size={14} aria-hidden /> } : {}),
    })),
    ...(activeId ? [
      { value: '__sep__', label: '', divider: true },
      ...(allowCreateRename ? [{ value: '__rename__', label: t(key('rename')), className: styles.actionOption, icon: <Pencil size={14} /> }] : []),
      ...(onManageApps ? [{ value: '__apps__', label: t(key('apps')), className: styles.actionOption, icon: <AppWindow size={14} /> }] : []),
      { value: '__delete__', label: t(key('delete')), className: styles.actionOption, icon: <Trash2 size={14} /> },
    ] : []),
    ...(allowCreateRename ? [{ value: '__create__', label: t(key('newOption')), className: styles.createOption, disabled: atCap, icon: <Plus size={14} /> }] : []),
    ...(onImport ? [{ value: '__import__', label: t(importKey), className: styles.createOption, disabled: atCap || !!importDisabled, icon: <Import size={14} /> }] : []),
  ];

  const handleSelectChange = (value: string) => {
    if (presets.some(p => p.id === value)) { onLoad(value); return; }
    if (value === '__import__') { onImport?.(); return; }
    if (value === '__create__') {
      setPromptMode('create');
      setCreateError(null);
      setPromptOpen(true);
      return;
    }
    if (value === '__rename__') { setPromptMode('rename'); setPromptOpen(true); return; }
    if (value === '__apps__') { onManageApps?.(); return; }
    if (value === '__delete__') { setDeleteConfirmOpen(true); return; }
  };

  const createValidate = (v: string): string | null => {
    if (!createError) return null;
    if (v !== lastAttemptedValue) {
      setCreateError(null);
      return null;
    }
    return createError;
  };

  const validate = (v: string): string | null => {
    const excludeId = promptMode === 'rename' ? (activeId ?? undefined) : undefined;
    if (isNameTaken(presets, v, excludeId)) return t(key('duplicateName'));
    return promptMode === 'create' ? createValidate(v) : null;
  };

  const handlePromptConfirm = async (name: string) => {
    if (promptMode === 'create') {
      setLastAttemptedValue(name);
      const result = await onCreate(name);
      if (result.error) {
        setCreateError(result.msg ?? t(key('capReached'), { max: cap }));
        return;
      }
      setCreateError(null);
    } else if (promptMode === 'rename' && activeId) {
      onRename(activeId, name);
    }
    setPromptOpen(false);
  };

  const undoTitle = `${t(key('undo'))} (${isMac ? 'Cmd' : 'Ctrl'}+Z)`;
  const redoTitle = `${t(key('redo'))} (${isMac ? 'Cmd' : 'Ctrl'}+Shift+Z)`;

  return (
    <div className={styles.toolbar}>
      <Select
        value={activeId ?? ''}
        onChange={handleSelectChange}
        options={selectOptions}
        ariaLabel={t(key('placeholder'))}
        placeholder={t(key('placeholder'))}
        className={styles.presetSelect}
      />
      {showHistory && (
        <>
          {onReset && (
            <>
              <Button
                tone="ghost"
                size="sm"
                icon={<RotateCcw size={14} />}
                title={t(resetKey)}
                aria-label={t(resetKey)}
                onClick={() => setResetConfirmOpen(true)}
              />
              <div className={styles.sep} aria-hidden="true" />
            </>
          )}
          <Button
            tone="ghost"
            size="sm"
            icon={<Undo2 size={14} />}
            title={undoTitle}
            aria-label={t(key('undo'))}
            onClick={onUndo}
            disabled={!canUndo}
          />
          <Button
            tone="ghost"
            size="sm"
            icon={<Redo2 size={14} />}
            title={redoTitle}
            aria-label={t(key('redo'))}
            onClick={onRedo}
            disabled={!canRedo}
          />
        </>
      )}
      <PromptModal
        open={promptOpen}
        title={t(key('namePrompt'))}
        initialValue={promptMode === 'rename' ? (activePreset?.name ?? '') : t(key('defaultName'), { n: presetCount + 1 })}
        maxLength={20}
        confirmLabel={promptMode === 'rename' ? t(key('rename')) : t(key('new'))}
        validate={validate}
        onConfirm={handlePromptConfirm}
        onCancel={() => { setPromptOpen(false); setCreateError(null); }}
      />
      <ConfirmModal
        open={deleteConfirmOpen}
        title={t(key('delete'))}
        message={t(key('deleteConfirm'), { name: activePreset?.name ?? '' })}
        onConfirm={() => { if (activeId) { onDelete(activeId); } setDeleteConfirmOpen(false); }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
      {showHistory && onReset && (
        <ConfirmModal
          open={resetConfirmOpen}
          title={t(resetKey)}
          message={t(resetConfirmMessageKey)}
          onConfirm={() => { setResetConfirmOpen(false); onReset?.(); }}
          onCancel={() => setResetConfirmOpen(false)}
        />
      )}
    </div>
  );
}
