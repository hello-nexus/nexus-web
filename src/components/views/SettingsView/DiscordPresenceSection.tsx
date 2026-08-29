import { useEffect, useRef, useState } from 'react';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow, SettingSelect, SettingToggle } from '../../common/SettingRow/SettingRow';
import {
  fetchDiscordPresence,
  saveDiscordPresence,
  type DiscordPresenceResponse,
} from '../../../api/discord';
import { useTranslation } from '../../../lib/i18n';
import { CircleAlert, Quote } from 'lucide-react';
import { DiscordGlyph } from '../../icons/NexusBrand';

/** How often the live connection state is re-read while this tab is open. */
const POLL_MS = 5000;

/**
 * Discord Rich Presence: publishes a status line to the user's Discord profile
 * while Nexus runs. Outbound only - it needs no account link and no OAuth,
 * which is why it is a single toggle rather than a connection flow.
 *
 * Server-authoritative, same shape as AiIntegrationSection: `mutatingRef`
 * blocks a second mutation while one is in flight, and `seqRef` is checked
 * before any response is applied, so a poll that resolves after a save can
 * never write back the pre-change value.
 */
export function DiscordPresenceSection({ serviceOnline }: { serviceOnline: boolean }) {
  const { t } = useTranslation();
  const [presence, setPresence] = useState<DiscordPresenceResponse | null>(null);
  const [mutating, setMutating] = useState(false);
  const mutatingRef = useRef(false);
  const seqRef = useRef(0);

  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    const read = async () => {
      // A poll must never clobber an in-flight or just-applied mutation.
      if (mutatingRef.current) return;
      const seq = seqRef.current;
      const next = await fetchDiscordPresence();
      if (cancelled || next === null || seq !== seqRef.current || mutatingRef.current) return;
      setPresence(next);
    };
    void read();
    const timer = window.setInterval(() => { void read(); }, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [serviceOnline]);

  const update = async (body: { enabled?: boolean; preset?: string }) => {
    if (mutatingRef.current) return;
    const previous = presence;
    mutatingRef.current = true;
    setMutating(true);
    const seq = ++seqRef.current;
    // Optimistic so the control does not wait a round trip.
    setPresence(current => (current ? { ...current, ...body } : current));
    try {
      const next = await saveDiscordPresence(body);
      if (seq !== seqRef.current) return;
      // A failed save must not leave the optimistic value claiming a write
      // that never happened.
      setPresence(next ?? previous);
    } finally {
      mutatingRef.current = false;
      setMutating(false);
    }
  };

  // Hidden entirely when the build carries no Discord application id.
  if (!presence?.available) return null;

  const busy = !serviceOnline || mutating;
  const status = presence.enabled
    ? (presence.connected ? t('discord.presence.connected') : t('discord.presence.waiting'))
    : t('discord.presence.off');

  return (
    <SettingsSection title={t('discord.presence.title')}>
      <SettingToggle
        label={t('discord.presence.enable')}
        description={t('discord.presence.hint')}
        anchorId="set-discord-presence"
        icon={<DiscordGlyph />}
        iconLeading="subtle"
        checked={presence.enabled}
        disabled={busy}
        onChange={checked => { void update({ enabled: checked }); }}
      />
      <SettingSelect
        label={t('discord.presence.status')}
        icon={<Quote />}
        iconLeading="subtle"
        description={status}
        descriptionBelow
        value={presence.preset}
        options={presence.presets.map(preset => ({ value: preset, label: preset }))}
        onChange={preset => { void update({ preset }); }}
        disabled={busy || !presence.enabled}
      />
      {presence.enabled && !presence.connected && (
        <SettingRow label={t('discord.presence.discordClosed')} icon={<CircleAlert />} iconLeading="subtle" />
      )}
    </SettingsSection>
  );
}
