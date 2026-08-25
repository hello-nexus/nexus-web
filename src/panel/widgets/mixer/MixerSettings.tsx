import { useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { useAudioDevices } from '../../../hooks/useAudioDevices';
import { useAudioMixer } from '../../../hooks/useAudioMixer';
import { useSystemVolume } from '../../../hooks/useSystemVolume';
import { MAX_PRESETS, MAX_PRESET_NAME, presetNameTaken } from '../../../api/mixer';
import { MixerPresetRow } from './MixerPresetRow';
import { canEditFreeText } from '../../types';
import type { WidgetSettingsProps } from '../types';
import {
  SettingsActions,
  SettingsButton,
  SettingsHint,
  SettingsInput,
  SettingsRow,
  SettingsSection,
  SettingsToggle,
} from '../common/SettingsRow/SettingsRow';

export function MixerSettings({ widget, surface, desktopEditor, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const devices = useAudioDevices(true);
  const mixer = useAudioMixer(true, devices.refresh);
  const volume = useSystemVolume(true);
  const [name, setName] = useState('');
  const [includeMaster, setIncludeMaster] = useState(true);
  const [includeDevices, setIncludeDevices] = useState(true);
  const [busy, setBusy] = useState(false);
  const [renameCollision, setRenameCollision] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const atLimit = mixer.presets.length >= MAX_PRESETS;
  // Presets are picked by name on the tile, so the service refuses a duplicate;
  // catching it here is what keeps Save from offering a write that cannot land.
  const nameTaken = presetNameTaken(mixer.presets, name);

  const showMaster = (widget.config?.showMaster as boolean | undefined) ?? true;
  const hideIdle = (widget.config?.hideIdle as boolean | undefined) ?? false;
  const showPresets = (widget.config?.showPresets as boolean | undefined) ?? true;
  // A preset needs a typed name, so creation is offered only where a keyboard
  // exists. Applying and deleting stay available on every surface. The shared
  // helper also covers the native shell, which a surface test alone misses.
  const canName = canEditFreeText(surface ?? 'desktop', desktopEditor);

  const renamePreset = (id: string, next: string) => {
    if (presetNameTaken(mixer.presets, next, id)) {
      setRenameCollision(next);
      return;
    }
    setRenameCollision('');
    void mixer.renamePreset(id, next);
  };

  const savePreset = async () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || busy || nameTaken || atLimit) return;
    setBusy(true);
    try {
      // Keep the typed name when the service refuses: clearing it unconditionally
      // threw away the user's input with nothing to show for it.
      const saved = await mixer.savePreset({ name: trimmed, includeMaster, includeDevices });
      setSaveFailed(!saved);
      if (saved) setName('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SettingsSection title={t('panel.widget.mixer.settings.display')}>
        <SettingsToggle
          label={t('panel.widget.mixer.settings.showMaster')}
          checked={showMaster}
          onChange={value => onUpdate({ showMaster: value })}
        />
        <SettingsToggle
          label={t('panel.widget.mixer.settings.hideIdle')}
          description={t('panel.widget.mixer.settings.hideIdleHint')}
          checked={hideIdle}
          onChange={value => onUpdate({ hideIdle: value })}
        />
        <SettingsToggle
          label={t('panel.widget.mixer.settings.showPresets')}
          checked={showPresets}
          onChange={value => onUpdate({ showPresets: value })}
        />
      </SettingsSection>

      <SettingsSection title={t('panel.widget.mixer.settings.memory')}>
        <SettingsToggle
          label={t('panel.widget.mixer.settings.sticky')}
          description={t('panel.widget.mixer.settings.stickyHint')}
          checked={mixer.stickyLevels}
          onChange={mixer.setSticky}
        />
        <SettingsActions>
          <SettingsButton variant="muted" onClick={mixer.clearLevels}>
            {t('panel.widget.mixer.settings.clearLevels')}
          </SettingsButton>
        </SettingsActions>
      </SettingsSection>

      {canName && (
        <SettingsSection title={t('panel.widget.mixer.settings.presetOptions')}>
          <SettingsToggle
            label={t('panel.widget.mixer.settings.includeMaster')}
            checked={includeMaster}
            onChange={setIncludeMaster}
          />
          <SettingsToggle
            label={t('panel.widget.mixer.settings.includeDevices')}
            checked={includeDevices}
            onChange={setIncludeDevices}
          />
        </SettingsSection>
      )}

      <SettingsSection title={t('panel.widget.mixer.settings.presets')}>
        {mixer.presets.length === 0 && (
          <SettingsHint>{t('panel.widget.mixer.settings.noPresets')}</SettingsHint>
        )}
        {renameCollision.length > 0 && (
          <SettingsHint tone="warning">
            {t('panel.widget.mixer.settings.duplicateName', { name: renameCollision })}
          </SettingsHint>
        )}
        {mixer.presets.map(preset => (
          <MixerPresetRow
            key={preset.id}
            preset={preset}
            sessions={mixer.sessions}
            masterVolume={volume.state.volume}
            outputDeviceId={devices.activeOutput?.id ?? ''}
            inputDeviceId={devices.activeInput?.id ?? ''}
            editable={canName}
            onApply={() => { void mixer.applyPreset(preset.id).then(devices.refresh); }}
            onUpdate={() => { void mixer.savePreset({
              id: preset.id,
              name: preset.name,
              // The Preset options toggles govern every save, new or existing.
              // Deriving them from what the preset already holds instead meant
              // one saved before endpoints existed could never gain them.
              includeMaster,
              includeDevices,
            }); }}
            onRename={next => renamePreset(preset.id, next)}
            onDelete={() => { void mixer.deletePreset(preset.id); }}
          />
        ))}

        {canName ? (
          <>
            <SettingsRow label={t('panel.widget.mixer.settings.presetName')}>
              <SettingsInput
                type="text"
                value={name}
                maxLength={MAX_PRESET_NAME}
                onChange={e => { setName(e.target.value); setSaveFailed(false); }}
                onKeyDown={e => { if (e.key === 'Enter') void savePreset(); }}
              />
            </SettingsRow>
            <SettingsHint tone={nameTaken || saveFailed ? 'warning' : undefined}>
              {nameTaken
                ? t('panel.widget.mixer.settings.duplicateName', { name: name.trim() })
                : saveFailed
                  ? t('panel.widget.mixer.settings.saveFailed')
                  : atLimit
                    ? t('panel.widget.mixer.settings.presetLimit')
                    : t(captureHintKey(includeMaster, includeDevices))}
            </SettingsHint>
            <SettingsActions>
              <SettingsButton
                disabled={name.trim().length === 0 || busy || atLimit || nameTaken}
                onClick={() => { void savePreset(); }}
              >
                {t('panel.widget.mixer.settings.saveCurrent')}
              </SettingsButton>
            </SettingsActions>
          </>
        ) : (
          <SettingsHint>{t('panel.widget.mixer.settings.addFromDashboard')}</SettingsHint>
        )}
      </SettingsSection>
    </>
  );
}

/** App levels are always captured; the toggles only add the master and the endpoints. */
function captureHintKey(includeMaster: boolean, includeDevices: boolean): string {
  if (includeMaster && includeDevices) return 'panel.widget.mixer.settings.saveHintAll';
  if (includeMaster) return 'panel.widget.mixer.settings.saveHintMaster';
  if (includeDevices) return 'panel.widget.mixer.settings.saveHintDevices';
  return 'panel.widget.mixer.settings.saveHintApps';
}

export default MixerSettings;
