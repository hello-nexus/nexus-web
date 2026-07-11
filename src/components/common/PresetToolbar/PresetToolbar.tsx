import { useState } from 'react';
import { RotateCcw, Undo2, Redo2, Pencil, Trash2, Plus } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { isApplePlatform } from '../../../lib/platform';
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
  /** Reset + Undo/Redo controls. Off for callers with no editable history to
   *  undo (e.g. deck config presets); on (default) matches the original
   *  lighting-canvas toolbar. */
  showHistory?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onReset?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  /** Prefix for every string key this toolbar reads, so a caller can supply
   *  its own translated copy instead of the lighting layout-preset strings. */
  translationPrefix?: string;
}

export function PresetToolbar({
  presets, activeId, presetCount, cap = PRESET_CAP,
  onLoad, onCreate, onRename, onDelete,
  showHistory = true, canUndo = false, canRedo = false, onReset, onUndo, onRedo,
  translationPrefix = 'lighting.layoutPresets',
}: PresetToolbarProps) {
  const { t } = useTranslation();
  const key = (suffix: string) => `${translationPrefix}.${suffix}`;
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptMode, setPromptMode] = useState<'create' | 'rename'>('create');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [lastAttemptedValue, setLastAttemptedValue] = useState('');

  const activePreset = presets.find(p => p.id === activeId) ?? null;
  const atCap = presetCount >= cap;

  const selectOptions = [
    ...presets.map(p => ({ value: p.id, label: p.name })),
    ...(activeId ? [
      { value: '__sep__', label: '', divider: true },
      { value: '__rename__', label: t(key('rename')), className: styles.actionOption, icon: <Pencil size={14} /> },
      { value: '__delete__', label: t(key('delete')), className: styles.actionOption, icon: <Trash2 size={14} /> },
    ] : []),
    { value: '__create__', label: t(key('newOption')), className: styles.createOption, disabled: atCap, icon: <Plus size={14} /> },
  ];

  const handleSelectChange = (value: string) => {
    if (presets.some(p => p.id === value)) { onLoad(value); return; }
    if (value === '__create__') {
      setPromptMode('create');
      setCreateError(null);
      setPromptOpen(true);
      return;
    }
    if (value === '__rename__') { setPromptMode('rename'); setPromptOpen(true); return; }
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
          <Button
            tone="ghost"
            size="sm"
            icon={<RotateCcw size={14} />}
            title={t(key('reset'))}
            aria-label={t(key('reset'))}
            onClick={() => setResetConfirmOpen(true)}
          />
          <div className={styles.sep} aria-hidden="true" />
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
        validate={promptMode === 'create' ? createValidate : undefined}
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
      {showHistory && (
        <ConfirmModal
          open={resetConfirmOpen}
          title={t(key('reset'))}
          message={t(key('resetConfirm'))}
          onConfirm={() => { setResetConfirmOpen(false); onReset?.(); }}
          onCancel={() => setResetConfirmOpen(false)}
        />
      )}
    </div>
  );
}
