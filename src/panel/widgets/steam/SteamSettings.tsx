import { useEffect, useState } from 'react';
import { fetchSteamConfig, saveSteamConfig } from '../../../api/steam';
import { useTranslation } from '../../../lib/i18n';
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
  const { t } = useTranslation();
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
      <SettingsSection title={t('steam.settings.apiTitle')}>
        <SettingsHint>
          {t('steam.settings.apiKeyHint.before')}{' '}
          {/* eslint-disable-next-line i18next/no-literal-string -- URL link text */}
          <a href="https://steamcommunity.com/dev/apikey" target="_blank" rel="noreferrer noopener">
            steamcommunity.com/dev/apikey
          </a>
          {' '}{t('steam.settings.apiKeyHint.middle')}{' '}
          {/* eslint-disable-next-line i18next/no-literal-string -- technical example value */}
          <code>localhost</code>
          {t('steam.settings.apiKeyHint.after')}
        </SettingsHint>
        <SettingsRow label={t('steam.settings.apiKeyLabel')}>
          <SettingsInput
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={hasApiKey ? t('steam.settings.apiKeyConfigured') : t('steam.settings.apiKeyRequired')}
          />
        </SettingsRow>
        <SettingsRow label={t('steam.settings.steamIdLabel')}>
          <SettingsInput
            type="text"
            value={steamId}
            onChange={e => setSteamId(e.target.value)}
            placeholder="7656119..."
          />
        </SettingsRow>
        <SettingsHint>
          {t('steam.settings.steamIdHint.before')}{' '}
          <a href="https://steamcommunity.com/my/profile" target="_blank" rel="noreferrer noopener">
            {t('steam.settings.steamIdHint.profileLink')}
          </a>
          {' '}{t('steam.settings.steamIdHint.middle')} <em>{t('steam.settings.steamIdHint.copyUrl')}</em>{t('steam.settings.steamIdHint.afterCopy')}{' '}
          {/* eslint-disable-next-line i18next/no-literal-string -- URL link text */}
          <a href="https://steamid.io/" target="_blank" rel="noreferrer noopener">steamid.io</a>
          {t('steam.settings.steamIdHint.after')}
        </SettingsHint>
        {autoDetectedSteamId && (
          <SettingsHint>{t('steam.settings.detected', { id: autoDetectedSteamId })}</SettingsHint>
        )}
        <SettingsActions>
          <SettingsButton onClick={() => save()}>
            {t('steam.settings.save')}
          </SettingsButton>
          {autoDetectedSteamId && (
            <SettingsButton variant="muted" onClick={() => setSteamId(autoDetectedSteamId)}>
              {t('steam.settings.useDetected')}
            </SettingsButton>
          )}
          {hasApiKey && (
            <SettingsButton variant="muted" onClick={() => save(true)}>
              {t('steam.settings.clearKey')}
            </SettingsButton>
          )}
          {saved && <SettingsSaved>{t('steam.settings.saved')}</SettingsSaved>}
        </SettingsActions>
      </SettingsSection>
    </>
  );
}
