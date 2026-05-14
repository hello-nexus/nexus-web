import { useEffect, useState } from 'react';
import { fetchDiscordConfig, saveDiscordConfig } from '../../../api/discord';
import type { WidgetSettingsProps } from '../types';
import {
  SettingsActions,
  SettingsButton,
  SettingsHint,
  SettingsInput,
  SettingsRow,
  SettingsSaved,
  SettingsSection,
  SettingsToggle,
} from './SettingsRow';

export function DiscordSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [hasClientSecret, setHasClientSecret] = useState(false);
  const [saved, setSaved] = useState(false);
  const privacyMode = ((widget.config?.privacyMode as boolean | undefined) ?? false);

  useEffect(() => {
    fetchDiscordConfig().then(config => {
      if (!config) return;
      setClientId(config.clientId || '');
      setHasClientSecret(config.hasClientSecret);
    });
  }, []);

  const save = async (clearClientSecret = false) => {
    const config = await saveDiscordConfig({
      clientId: clientId.trim(),
      ...(clientSecret.trim().length > 0 || clearClientSecret
        ? { clientSecret: clientSecret.trim(), clearClientSecret }
        : {}),
    });
    if (config) {
      setClientId(config.clientId || clientId);
      setHasClientSecret(config.hasClientSecret);
    }
    setClientSecret('');
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  return (
    <>
      <SettingsSection title="Discord">
        <SettingsToggle
          label="Privacy mode"
          checked={privacyMode}
          onChange={checked => onUpdate({ privacyMode: checked })}
        />
      </SettingsSection>
      <SettingsSection title="OAuth">
        <SettingsRow label="Client ID">
          <SettingsInput
            type="text"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            placeholder="required"
          />
        </SettingsRow>
        <SettingsRow label="Secret">
          <SettingsInput
            type="password"
            value={clientSecret}
            onChange={e => setClientSecret(e.target.value)}
            placeholder={hasClientSecret ? 'configured' : 'required'}
          />
        </SettingsRow>
        <SettingsHint>Required for the Discord RPC OAuth token exchange.</SettingsHint>
        <SettingsActions>
          <SettingsButton onClick={() => save()}>
            Save
          </SettingsButton>
          {hasClientSecret && (
            <SettingsButton variant="muted" onClick={() => save(true)}>
              Clear secret
            </SettingsButton>
          )}
          {saved && <SettingsSaved>Saved</SettingsSaved>}
        </SettingsActions>
      </SettingsSection>
    </>
  );
}
