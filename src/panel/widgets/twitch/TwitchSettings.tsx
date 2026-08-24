import {
  isValidTwitchChannel,
  normalizeTwitchChannel,
  twitchChatTopic,
  type TwitchChatFrame,
} from '../../../api/twitch';
import { useDebouncedValue } from '../../../hooks/cadence';
import { useTopic } from '../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetSettingsProps } from '../types';
import { SettingsHint, SettingsInput, SettingsRow, SettingsSection } from '../common/SettingsRow/SettingsRow';

export function TwitchSettings({ widget, onUpdate }: WidgetSettingsProps) {
  const { t } = useTranslation();
  const raw = ((widget.config?.channel as string | undefined) ?? '');
  const typed = raw.trim().replace(/^#/, '');
  const channel = normalizeTwitchChannel(raw);

  // Debounced so a lookup follows the typing rather than each keystroke: the
  // subscribe is what makes the service JOIN, and that should not churn per
  // character.
  const settled = useDebouncedValue(channel, 600);
  const frame = useTopic<TwitchChatFrame>(settled ? twitchChatTopic(settled) : '', Boolean(settled));
  // The frame is for the settled channel only; a stale one must not label the
  // name currently in the box.
  const forThisChannel = settled === channel && frame?.channel === channel;

  return (
    <SettingsSection title={t('panel.widget.twitch.settings.title')}>
      <SettingsRow label={t('panel.settings.channel')}>
        <SettingsInput
          type="text"
          value={raw}
          // eslint-disable-next-line i18next/no-literal-string -- channel handle format hint
          placeholder="channel_name"
          onChange={e => onUpdate({ channel: e.target.value })}
        />
      </SettingsRow>
      <SettingsHint>{t(statusKey())}</SettingsHint>
    </SettingsSection>
  );

  function statusKey(): string {
    if (typed.length === 0) return 'panel.widget.twitch.settings.channelHint';
    if (!isValidTwitchChannel(typed)) return 'panel.widget.twitch.invalidChannel';
    if (!forThisChannel || frame?.exists == null) return 'panel.widget.twitch.settings.checking';
    return frame.exists ? 'panel.widget.twitch.settings.found' : 'panel.widget.twitch.channelNotFound';
  }
}
