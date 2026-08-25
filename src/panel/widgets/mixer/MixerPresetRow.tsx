import { Trash2 } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { EditableText } from '../../../components/common/Editable/EditableText';
import { MAX_PRESET_NAME, type AudioMixerPreset, type AudioSession } from '../../../api/mixer';
import { SettingsButton } from '../common/SettingsRow/SettingsRow';
import styles from './MixerSettings.module.scss';

export interface MixerPresetRowProps {
  preset: AudioMixerPreset;
  sessions: AudioSession[];
  masterVolume: number;
  outputDeviceId: string;
  inputDeviceId: string;
  editable: boolean;
  onApply: () => void;
  /** Recaptures the live levels and devices into this preset. */
  onUpdate: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}

export function MixerPresetRow({
  preset,
  sessions,
  masterVolume,
  outputDeviceId,
  inputDeviceId,
  editable,
  onApply,
  onUpdate,
  onRename,
  onDelete,
}: MixerPresetRowProps) {
  const { t } = useTranslation();
  const active = isActive(preset, sessions, masterVolume, outputDeviceId, inputDeviceId);

  return (
    <div className={styles.presetRow}>
      <div className={styles.presetName}>
        {editable ? (
          <EditableText
            value={preset.name}
            maxLength={MAX_PRESET_NAME}
            onCommit={onRename}
            ariaLabel={t('panel.widget.mixer.settings.renamePreset', { name: preset.name })}
            className={styles.presetNameField}
          />
        ) : (
          <span className={styles.presetNameStatic}>{preset.name}</span>
        )}
      </div>
      {/* Pushed right, away from the name: next to it, Apply reads as though it
          commits the rename. */}
      <div className={styles.presetActions}>
        <SettingsButton variant={active ? 'muted' : 'primary'} disabled={active} onClick={onApply}>
          {active ? t('panel.widget.mixer.settings.applied') : t('panel.widget.mixer.settings.apply')}
        </SettingsButton>
        {/* Load reads the preset out; Save writes the live mixer back into it.
            Hidden when they already match, so there is nothing to save. */}
        {editable && !active && (
          <SettingsButton
            variant="muted"
            aria-label={t('panel.widget.mixer.settings.updatePresetAria', { name: preset.name })}
            onClick={onUpdate}
          >
            {t('panel.widget.mixer.settings.updatePreset')}
          </SettingsButton>
        )}
        <SettingsButton
          variant="muted"
          aria-label={t('panel.widget.mixer.settings.deletePreset', { name: preset.name })}
          onClick={onDelete}
        >
          <Trash2 size={15} strokeWidth={1.8} />
        </SettingsButton>
      </div>
    </div>
  );
}

/**
 * Whether the live mixer still matches what this preset captured. Derived
 * rather than latched on the click: a latch would keep claiming the preset is
 * applied after a fader moved, and would miss a change made from another panel.
 */
function isActive(
  preset: AudioMixerPreset,
  sessions: AudioSession[],
  masterVolume: number,
  outputDeviceId: string,
  inputDeviceId: string,
): boolean {
  if (preset.masterVolume !== null && pct(preset.masterVolume) !== pct(masterVolume)) return false;
  if (preset.outputDeviceId.length > 0 && preset.outputDeviceId !== outputDeviceId) return false;
  if (preset.inputDeviceId.length > 0 && preset.inputDeviceId !== inputDeviceId) return false;
  for (const app of preset.apps) {
    // An app that is not running cannot disagree - its level is restored when
    // it next opens a session.
    const live = sessions.find(s => s.id === app.id);
    if (!live) continue;
    if (pct(app.volume) !== pct(live.volume) || app.muted !== live.muted) return false;
  }
  return true;
}

function pct(value: number): number {
  return Math.round(value * 100);
}
