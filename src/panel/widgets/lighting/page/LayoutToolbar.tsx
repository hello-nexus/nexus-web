import { useState } from 'react';
import { RotateCcw, Undo2, Redo2 } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { isApplePlatform } from '../../../../lib/platform';
import { Button } from '../../../../components/common/Button/Button';
import { Select } from '../../../../components/common/Select/Select';
import { ConfirmModal } from '../../../../components/common/ConfirmModal/ConfirmModal';
import { PromptModal } from '../../../../components/common/PromptModal/PromptModal';
import type { LayoutPreset } from '../../../../api/lighting';
import styles from './LayoutToolbar.module.scss';

export const LAYOUT_PRESET_CAP = 10;

const isMac = isApplePlatform();

interface LayoutToolbarProps {
  presets: LayoutPreset[];
  activeId: string | null;
  presetCount: number;
  canUndo: boolean;
  canRedo: boolean;
  onLoad: (id: string) => void;
  onCreate: (name: string) => Promise<{ error: boolean; msg?: string }>;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onReset: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

export function LayoutToolbar({
  presets, activeId, presetCount,
  canUndo, canRedo,
  onLoad, onCreate, onRename, onDelete, onReset, onUndo, onRedo,
}: LayoutToolbarProps) {
  const { t } = useTranslation();
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptMode, setPromptMode] = useState<'create' | 'rename'>('create');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [lastAttemptedValue, setLastAttemptedValue] = useState('');

  const activePreset = presets.find(p => p.id === activeId) ?? null;
  const atCap = presetCount >= LAYOUT_PRESET_CAP;

  const selectOptions = [
    ...presets.map(p => ({ value: p.id, label: p.name })),
    ...(activeId ? [
      { value: '__sep__', label: '------', disabled: true, className: styles.sepOption },
      { value: '__rename__', label: t('lighting.layoutPresets.rename'), className: styles.actionOption },
      { value: '__delete__', label: t('lighting.layoutPresets.delete'), className: styles.deleteOption },
    ] : []),
    { value: '__create__', label: t('lighting.layoutPresets.newOption'), className: styles.createOption, disabled: atCap },
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
        setCreateError(result.msg ?? t('lighting.layoutPresets.capReached', { max: LAYOUT_PRESET_CAP }));
        return;
      }
      setCreateError(null);
    } else if (promptMode === 'rename' && activeId) {
      onRename(activeId, name);
    }
    setPromptOpen(false);
  };

  const undoTitle = `${t('lighting.layoutPresets.undo')} (${isMac ? 'Cmd' : 'Ctrl'}+Z)`;
  const redoTitle = `${t('lighting.layoutPresets.redo')} (${isMac ? 'Cmd' : 'Ctrl'}+Shift+Z)`;

  return (
    <div className={styles.toolbar}>
      <Select
        value={activeId ?? ''}
        onChange={handleSelectChange}
        options={selectOptions}
        ariaLabel={t('lighting.layoutPresets.placeholder')}
        placeholder={t('lighting.layoutPresets.placeholder')}
        className={styles.presetSelect}
      />
      <Button
        tone="ghost"
        size="sm"
        icon={<RotateCcw size={14} />}
        title={t('lighting.layoutPresets.reset')}
        aria-label={t('lighting.layoutPresets.reset')}
        onClick={() => setResetConfirmOpen(true)}
      />
      <div className={styles.sep} aria-hidden="true" />
      <Button
        tone="ghost"
        size="sm"
        icon={<Undo2 size={14} />}
        title={undoTitle}
        aria-label={t('lighting.layoutPresets.undo')}
        onClick={onUndo}
        disabled={!canUndo}
      />
      <Button
        tone="ghost"
        size="sm"
        icon={<Redo2 size={14} />}
        title={redoTitle}
        aria-label={t('lighting.layoutPresets.redo')}
        onClick={onRedo}
        disabled={!canRedo}
      />
      <PromptModal
        open={promptOpen}
        title={t('lighting.layoutPresets.namePrompt')}
        initialValue={promptMode === 'rename' ? (activePreset?.name ?? '') : t('lighting.layoutPresets.defaultName', { n: presetCount + 1 })}
        maxLength={20}
        confirmLabel={promptMode === 'rename' ? t('lighting.layoutPresets.rename') : t('lighting.layoutPresets.new')}
        validate={promptMode === 'create' ? createValidate : undefined}
        onConfirm={handlePromptConfirm}
        onCancel={() => { setPromptOpen(false); setCreateError(null); }}
      />
      <ConfirmModal
        open={deleteConfirmOpen}
        title={t('lighting.layoutPresets.delete')}
        message={t('lighting.layoutPresets.deleteConfirm', { name: activePreset?.name ?? '' })}
        onConfirm={() => { if (activeId) { onDelete(activeId); } setDeleteConfirmOpen(false); }}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
      <ConfirmModal
        open={resetConfirmOpen}
        title={t('lighting.layoutPresets.reset')}
        message={t('lighting.layoutPresets.resetConfirm')}
        onConfirm={() => { setResetConfirmOpen(false); onReset(); }}
        onCancel={() => setResetConfirmOpen(false)}
      />
    </div>
  );
}
