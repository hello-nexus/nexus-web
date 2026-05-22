import { useEffect, useState } from 'react';
import { fetchSteamConfig, saveSteamConfig } from '../../../api/steam';
import type { WidgetSettingsProps } from '../types';
import {
  SettingsActions,
  SettingsButton,
  SettingsHint,
  SettingsInput,
  SettingsRow,
  SettingsSaved,
  SettingsSection,
} from '../common/SettingsRow/SettingsRow';

export function SteamSettings(props: WidgetSettingsProps) {
  void props;
  const [apiKey, setApiKey] = useState('');
  const [steamId, setSteamId] = useState('');
  const [autoDetectedSteamId, setAutoDetectedSteamId] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetchSteamConfig().then(config => {
      if (!config) return;
      setSteamId(config.steamId || config.autoDetectedSteamId || '');
      setAutoDetectedSteamId(config.autoDetectedSteamId || '');
      setHasApiKey(config.hasApiKey);
    });
  }, []);

  const save = async (clearApiKey = false) => {
    const config = await saveSteamConfig({
      steamId: steamId.trim(),
      ...(apiKey.trim().length > 0 || clearApiKey ? { apiKey: apiKey.trim(), clearApiKey } : {}),
    });
    if (config) {
      setHasApiKey(config.hasApiKey);
      setSteamId(config.steamId || config.autoDetectedSteamId || steamId);
      setAutoDetectedSteamId(config.autoDetectedSteamId || '');
    }
    setApiKey('');
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  };

  return (
    <>
      <SettingsSection title="Steam API">
        <SettingsHint>
          Sign in at{' '}
          <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer noopener">
            steamcommunity.com/dev/apikey
          </a>
          {' '}to register a personal key. Any non-empty domain (e.g. <code>localhost</code>) is accepted &mdash; it&apos;s a label, not validated.
        </SettingsHint>
        <SettingsRow label="API key">
          <SettingsInput
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={hasApiKey ? 'configured' : 'required'}
          />
        </SettingsRow>
        <SettingsRow label="SteamID64">
          <SettingsInput
            type="text"
            value={steamId}
            onChange={e => setSteamId(e.target.value)}
            placeholder="7656119..."
          />
        </SettingsRow>
        <SettingsHint>
          Your 17-digit ID. Find it via{' '}
          <a href="https://steamcommunity.com/my/profile" target="_blank" rel="noreferrer noopener">
            your profile page
          </a>
          {' '}&rarr; profile menu &rarr; <em>Copy page URL</em>, or paste your vanity URL into{' '}
          <a href="https://steamid.io/" target="_blank" rel="noreferrer noopener">steamid.io</a>.
        </SettingsHint>
        {autoDetectedSteamId && (
          <SettingsHint>Detected local SteamID64: {autoDetectedSteamId}</SettingsHint>
        )}
        <SettingsActions>
          <SettingsButton onClick={() => save()}>
            Save
          </SettingsButton>
          {autoDetectedSteamId && (
            <SettingsButton variant="muted" onClick={() => setSteamId(autoDetectedSteamId)}>
              Use detected
            </SettingsButton>
          )}
          {hasApiKey && (
            <SettingsButton variant="muted" onClick={() => save(true)}>
              Clear key
            </SettingsButton>
          )}
          {saved && <SettingsSaved>Saved</SettingsSaved>}
        </SettingsActions>
      </SettingsSection>
    </>
  );
}
