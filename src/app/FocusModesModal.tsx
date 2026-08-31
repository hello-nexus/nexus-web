import { useState } from 'react';
import { ArrowDown, ArrowUp, BellOff, Cloud, MonitorOff, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../components/common/Button/Button';
import { CollapsibleSection } from '../components/common/CollapsibleSection/CollapsibleSection';
import { ConfirmModal } from '../components/common/ConfirmModal/ConfirmModal';
import { DeviceModal } from '../components/common/DeviceModal/DeviceModal';
import { SettingSelect, SettingToggle } from '../components/common/SettingRow/SettingRow';
import { TextInput } from '../components/common/TextInput/TextInput';
import { FOCUS_ICON_KEYS, focusIcon } from './focusIcons';
import { useFocus } from '../hooks/useFocus';
import { useTranslation } from '../lib/i18n';
import type { FocusMode, FocusTrigger } from '../api/focus';
import styles from './FocusModesModal.module.scss';

// Matches FocusRoutes.MaxNameLength: the name rides the top bar chip.
const MAX_NAME_LENGTH = 10;

/**
 * The only place focus modes are managed, opened from the top bar chip's
 * Settings entry. Every mode can be renamed, re-iconed, retriggered and
 * retuned, and non-built-in ones removed. Order is precedence - the first mode
 * whose trigger fires wins when two could activate.
 */
export function FocusModesModal({ open, onClose, serviceOnline }: {
  open: boolean;
  onClose: () => void;
  serviceOnline: boolean;
}) {
  const { t } = useTranslation();
  const { status, addMode, updateMode, removeMode, reorder, resetModes } = useFocus(serviceOnline);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FocusMode | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  // The field is a draft until it is committed: a PATCH per keystroke writes
  // settings.json on every letter, and the service ignores an empty name, so a
  // controlled field could never be cleared to retype.
  const [nameDraft, setNameDraft] = useState<{ id: string; value: string } | null>(null);

  const modes = status?.modes ?? [];
  const triggers = status?.availableTriggers ?? ['manual'];
  const disabled = !serviceOnline || !status;

  const commitName = (mode: FocusMode) => {
    const draft = nameDraft?.id === mode.id ? nameDraft.value.trim() : null;
    setNameDraft(null);
    if (draft && draft !== mode.name) void updateMode(mode.id, { name: draft });
  };

  const move = (index: number, delta: number) => {
    const next = modes.map(m => m.id);
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void reorder(next);
  };

  return (
    <DeviceModal open={open} onClose={onClose} title={t('focus.title')} medium>
      {modes.map((mode, index) => (
        <CollapsibleSection
          key={mode.id}
          boxed
          className={styles.mode}
          title={mode.name}
          titleAfter={<span className={styles.modeIcon}>{focusIcon(mode.icon, 15)}</span>}
          open={expandedId === mode.id}
          onToggle={() => setExpandedId(expandedId === mode.id ? null : mode.id)}
          rightInteractive
          right={
            <div className={styles.rowActions}>
              <Button
                size="sm"
                tone="ghost"
                icon={<ArrowUp size={14} />}
                aria-label={t('focus.mode.moveUp')}
                disabled={disabled || index === 0}
                onClick={() => move(index, -1)}
              />
              <Button
                size="sm"
                tone="ghost"
                icon={<ArrowDown size={14} />}
                aria-label={t('focus.mode.moveDown')}
                disabled={disabled || index === modes.length - 1}
                onClick={() => move(index, 1)}
              />
              {!mode.builtIn && (
                <Button
                  size="sm"
                  tone="ghost"
                  icon={<Trash2 size={14} />}
                  aria-label={t('focus.mode.remove')}
                  disabled={disabled}
                  onClick={() => setPendingDelete(mode)}
                />
              )}
            </div>
          }
        >
          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('focus.mode.name')}</span>
            <div className={styles.nameInput}>
              <TextInput
                value={nameDraft?.id === mode.id ? nameDraft.value : mode.name}
                maxLength={MAX_NAME_LENGTH}
                disabled={disabled}
                size="sm"
                ariaLabel={t('focus.mode.name')}
                onInput={value => setNameDraft({ id: mode.id, value })}
                onSubmit={() => commitName(mode)}
                onBlur={() => commitName(mode)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <span className={styles.fieldLabel}>{t('focus.mode.icon')}</span>
            <div className={styles.iconPicker}>
              {FOCUS_ICON_KEYS.map(key => (
                <button
                  key={key}
                  type="button"
                  className={key === mode.icon ? styles.iconChoiceActive : styles.iconChoice}
                  disabled={disabled}
                  onClick={() => void updateMode(mode.id, { icon: key })}
                  aria-label={key}
                  aria-pressed={key === mode.icon}
                >
                  {focusIcon(key, 16)}
                </button>
              ))}
            </div>
          </div>

          <SettingSelect
            label={t('focus.mode.trigger')}
            value={mode.trigger}
            options={triggers.map(id => ({ value: id, label: t(`focus.trigger.${id}`) }))}
            onChange={value => void updateMode(mode.id, { trigger: value as FocusTrigger })}
            disabled={disabled}
          />
          <SettingToggle
            label={t('focus.holdNotifications.label')}
            icon={<BellOff />}
            iconLeading="subtle"
            description={t('focus.holdNotifications.description')}
            checked={mode.holdNotifications}
            onChange={() => void updateMode(mode.id, { holdNotifications: !mode.holdNotifications })}
            disabled={disabled}
          />
          <SettingToggle
            label={t('focus.holdTraffic.label')}
            icon={<Cloud />}
            iconLeading="subtle"
            description={t('focus.holdTraffic.description')}
            checked={mode.holdBackgroundTraffic}
            onChange={() => void updateMode(mode.id, { holdBackgroundTraffic: !mode.holdBackgroundTraffic })}
            disabled={disabled}
          />
          <SettingToggle
            label={t('focus.panelsOff.label')}
            icon={<MonitorOff />}
            iconLeading="subtle"
            description={t('focus.panelsOff.description')}
            checked={mode.turnPanelDisplaysOff}
            onChange={() => void updateMode(mode.id, { turnPanelDisplaysOff: !mode.turnPanelDisplaysOff })}
            disabled={disabled}
          />
        </CollapsibleSection>
      ))}

      <div className={styles.footer}>
        <Button
          size="sm"
          tone="ghost"
          icon={<RotateCcw size={14} />}
          disabled={disabled}
          onClick={() => setResetOpen(true)}
        >
          {t('focus.mode.reset')}
        </Button>
        <Button
          size="sm"
          tone="neutral"
          icon={<Plus size={14} />}
          disabled={disabled}
          onClick={() => void addMode({
            name: t('focus.mode.newName'),
            icon: 'focus',
            trigger: 'manual',
          })}
        >
          {t('focus.mode.add')}
        </Button>
      </div>

      <ConfirmModal
        open={!!pendingDelete}
        title={t('focus.mode.removeConfirm.title')}
        message={t('focus.mode.removeConfirm.body').replace('{name}', pendingDelete?.name ?? '')}
        confirmLabel={t('focus.mode.remove')}
        onConfirm={() => {
          if (pendingDelete) void removeMode(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmModal
        open={resetOpen}
        title={t('focus.mode.resetConfirm.title')}
        message={t('focus.mode.resetConfirm.body')}
        confirmLabel={t('focus.mode.reset')}
        onConfirm={() => { void resetModes(); setResetOpen(false); }}
        onCancel={() => setResetOpen(false)}
      />
    </DeviceModal>
  );
}
