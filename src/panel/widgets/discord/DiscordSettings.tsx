import { useEffect, useState } from 'react';
import { fetchDiscordConfig, saveDiscordConfig } from '../../../api/discord';
import type { WidgetSettingsProps } from '../types';
import { useTranslation } from '../../../lib/i18n';
import {
  SettingsActions,
  SettingsButton,
  SettingsHint,
  SettingsInput,
  SettingsRow,
  SettingsSaved,
  SettingsSection,
  SettingsToggle,
} from '../common/SettingsRow/SettingsRow';

export function DiscordSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
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
      <SettingsSection title={t('discord.section.title')}>
        <SettingsToggle
          label={t('discord.privacyMode')}
          checked={privacyMode}
          onChange={checked => onUpdate({ privacyMode: checked })}
        />
      </SettingsSection>
      <SettingsSection title={t('discord.oauth.title')}>
        <SettingsHint>
          {t('discord.oauth.hint.createAppAt')}{' '}
          {/* eslint-disable-next-line i18next/no-literal-string -- link text is a URL */}
          <a href="https://discord.com/developers/applications" target="_blank" rel="noreferrer noopener">
            discord.com/developers/applications
          </a>
          {' '}&rarr; <em>{t('discord.oauth.hint.newApplication')}</em>{t('discord.oauth.hint.applicationIdIntro')} <em>{t('discord.oauth.hint.applicationId')}</em> {t('discord.oauth.hint.applicationIdOutro')} <em>{t('discord.oauth.hint.oauth2')}</em> &rarr; <em>{t('discord.oauth.hint.resetSecret')}</em> {t('discord.oauth.hint.secretOutro')}
        </SettingsHint>
        <SettingsRow label={t('discord.clientId')}>
          <SettingsInput
            type="text"
            value={clientId}
            onChange={e => setClientId(e.target.value)}
            placeholder={t('discord.placeholder.required')}
          />
        </SettingsRow>
        <SettingsRow label={t('discord.secret')}>
          <SettingsInput
            type="password"
            value={clientSecret}
            onChange={e => setClientSecret(e.target.value)}
            placeholder={hasClientSecret ? t('discord.placeholder.configured') : t('discord.placeholder.required')}
          />
        </SettingsRow>
        <SettingsActions>
          <SettingsButton onClick={() => save()}>
            {t('discord.save')}
          </SettingsButton>
          {hasClientSecret && (
            <SettingsButton variant="muted" onClick={() => save(true)}>
              {t('discord.clearSecret')}
            </SettingsButton>
          )}
          {saved && <SettingsSaved>{t('discord.saved')}</SettingsSaved>}
        </SettingsActions>
      </SettingsSection>
    </>
  );
}
