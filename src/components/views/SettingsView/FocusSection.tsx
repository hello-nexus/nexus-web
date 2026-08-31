import { useState } from 'react';
import { BellOff, ChevronDown, ChevronRight, Cloud, Focus, MonitorOff, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { FOCUS_ICON_KEYS, focusIcon } from '../../../app/focusIcons';
import { useFocus } from '../../../hooks/useFocus';
import { useTranslation } from '../../../lib/i18n';
import type { FocusMode, FocusTrigger } from '../../../api/focus';
import styles from './FocusSection.module.scss';

/**
 * The focus-mode list: every mode can be renamed, re-iconed, retriggered and
 * retuned, and non-built-in ones removed. Order is precedence - the first mode
 * whose trigger fires wins when two could activate.
 */
export function FocusSection({ serviceOnline }: { serviceOnline: boolean }) {
  const { t } = useTranslation();
  const { status, addMode, updateMode, removeMode, reorder, setEnabled } = useFocus(serviceOnline);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FocusMode | null>(null);

  const modes = status?.modes ?? [];
  const triggers = status?.availableTriggers ?? ['manual'];
  const disabled = !serviceOnline || !status;

  const move = (index: number, delta: number) => {
    const next = modes.map(m => m.id);
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    void reorder(next);
  };

  return (
    <SettingsSection
      title={t('focus.title')}
      action={
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
      }
    >
      <SettingToggle
        label={t('focus.enabled.label')}
        anchorId="set-focus"
        icon={<Focus />}
        iconLeading="subtle"
        description={t('focus.enabled.description')}
        checked={status?.enabled ?? true}
        onChange={() => void setEnabled(!(status?.enabled ?? true))}
        disabled={disabled}
      />

      {modes.map((mode, index) => {
        const expanded = expandedId === mode.id;
        return (
          <div key={mode.id} className={styles.mode}>
            <div className={styles.header}>
              <button
                type="button"
                className={styles.disclosure}
                onClick={() => setExpandedId(expanded ? null : mode.id)}
                aria-expanded={expanded}
              >
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className={styles.modeIcon}>{focusIcon(mode.icon, 16)}</span>
                <span className={styles.modeName}>{mode.name}</span>
                {mode.id === status?.activeModeId && (
                  <span className={styles.activeBadge}>{t('focus.activeNow')}</span>
                )}
              </button>
              <div className={styles.headerActions}>
                <button
                  type="button"
                  className={styles.iconAction}
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                  aria-label={t('focus.mode.moveUp')}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.iconAction}
                  disabled={disabled || index === modes.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label={t('focus.mode.moveDown')}
                >
                  ↓
                </button>
                {!mode.builtIn && (
                  <button
                    type="button"
                    className={styles.iconAction}
                    disabled={disabled}
                    onClick={() => setPendingDelete(mode)}
                    aria-label={t('focus.mode.remove')}
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            {expanded && (
              <div className={styles.body}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('focus.mode.name')}</span>
                  <input
                    className={styles.textInput}
                    value={mode.name}
                    maxLength={40}
                    disabled={disabled}
                    onChange={e => void updateMode(mode.id, { name: e.target.value })}
                  />
                </label>

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

                {mode.trigger !== 'manual' && (
                  <SettingToggle
                    label={t(`focus.mode.autoActivate.${mode.trigger}`)}
                    checked={mode.autoActivate}
                    onChange={() => void updateMode(mode.id, { autoActivate: !mode.autoActivate })}
                    disabled={disabled}
                  />
                )}

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
              </div>
            )}
          </div>
        );
      })}

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
    </SettingsSection>
  );
}
