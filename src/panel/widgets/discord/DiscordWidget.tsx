import { useEffect, useMemo, useState } from 'react';
import {
  Bell, BellOff, Compass, Headphones, MessageCircle, Mic, MicOff, PhoneOff,
  Shield,
} from 'lucide-react';
import {
  disconnectDiscordVoice,
  fetchDiscordStatus,
  launchDiscord,
  openDiscordPath,
  setDiscordDeaf,
  setDiscordMute,
  type DiscordGuild,
  type DiscordNotification,
  type DiscordStatusResponse,
} from '../../../api/discord';
import type { WidgetProps } from '../types';
import { useTranslation } from '../../../lib/i18n';
import {
  PanelWidgetEmpty,
  PanelWidgetSetup,
  PanelWidgetShell,
  PanelWidgetTab,
  PanelWidgetTabs,
} from '../common/PanelWidgetChrome';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { DISCORD_PREVIEW } from './discordPreviewData';
import styles from './DiscordWidget.module.scss';

type DiscordTab = 'activity' | 'voice' | 'servers';

const POLL_MS = 5000;

export function DiscordWidget({ widget, onConfigure }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const [status, setStatus] = useState<DiscordStatusResponse | null>(preview ? DISCORD_PREVIEW : null);
  const [activeTab, setActiveTab] = useState<DiscordTab>('activity');
  const privacyMode = ((widget.config?.privacyMode as boolean | undefined) ?? false);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    const load = async () => {
      const next = await fetchDiscordStatus();
      if (!cancelled && next) setStatus(next);
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [preview]);

  const ready = Boolean(status?.ready);
  const notifications = useMemo(() => status?.notifications ?? [], [status?.notifications]);
  const mentions = useMemo(() => (
    notifications.filter(item => item.mentionEveryone || item.mentionUser).length
  ), [notifications]);

  if (!ready) {
    const needsConfig = !(status?.configured ?? false);
    return (
      <PanelWidgetShell size={widget.size} className={styles.widget}>
        <PanelWidgetSetup
          icon={<MessageCircle size={28} />}
          message={status?.reason || t('discord.notConnected')}
          actions={(
            <div className={styles.setupActions}>
              {/* When OAuth isn't configured the only useful action is "open
                  settings"; once configured but not connected, Launch reopens
                  the Discord client so the RPC handshake can happen. */}
              {needsConfig && onConfigure ? (
                <button type="button" className="panel-chip" onClick={onConfigure}>
                  {t('discord.settings')}
                </button>
              ) : (
                <button type="button" className="panel-chip" onClick={() => { void launchDiscord(); }}>
                  {t('discord.launch')}
                </button>
              )}
              {needsConfig && (
                <span className={styles.configHint}>
                  <Shield size={12} />
                  {t('discord.oauthSetupRequired')}
                </span>
              )}
            </div>
          )}
        />
      </PanelWidgetShell>
    );
  }

  const user = status?.user;

  return (
    <PanelWidgetShell size={widget.size} className={styles.widget}>
      <header className={styles.profile}>
        <div className={styles.banner} style={{ background: user?.bannerColor || 'var(--panel-element-bg)' }}>
          {user?.bannerUrl && <img src={user.bannerUrl} alt="" />}
        </div>
        <div className={styles.profileBottom}>
          {user?.avatarUrl ? (
            <img className={privacyMode ? `${styles.avatar} ${styles.blurred}` : styles.avatar} src={user.avatarUrl} alt="" />
          ) : (
            <div className={styles.avatarFallback}><MessageCircle size={22} /></div>
          )}
          <div className={styles.userText}>
            {/* eslint-disable-next-line i18next/no-literal-string -- Discord brand name fallback */}
            <div className={styles.name}>{privacyMode ? t('discord.privacyUser') : user?.globalName || user?.username || 'Discord'}</div>
            <div className={styles.meta}>
              <span>{t('discord.notificationCount', { count: notifications.length })}</span>
              {mentions > 0 && <span>{t('discord.mentionCount', { count: mentions })}</span>}
            </div>
          </div>
        </div>
      </header>

      <PanelWidgetTabs ariaLabel={t('discord.viewsLabel')} compact={widget.size === '4x4'}>
        <PanelWidgetTab active={activeTab === 'activity'} icon={<Bell size={14} />} label={t('discord.tab.activity')} onClick={() => setActiveTab('activity')} />
        <PanelWidgetTab active={activeTab === 'voice'} icon={<Mic size={14} />} label={t('discord.tab.voice')} onClick={() => setActiveTab('voice')} />
        <PanelWidgetTab active={activeTab === 'servers'} icon={<Compass size={14} />} label={t('discord.tab.servers')} onClick={() => setActiveTab('servers')} />
      </PanelWidgetTabs>

      <main className={styles.content}>
        {activeTab === 'activity' && (
          <ActivityTab notifications={notifications} privacyMode={privacyMode} compact={widget.size === '4x4'} />
        )}
        {activeTab === 'voice' && (
          status?.voiceState ? (
            <div className={styles.voice}>
              <div className={styles.voiceHeader}>
                <span>{privacyMode ? t('discord.voiceChannel') : status.voiceState.channelName}</span>
                <small>{privacyMode ? t('discord.server') : status.voiceState.guildName}</small>
              </div>
              <div className={styles.participants}>
                {status.voiceState.participants.map((participant, index) => (
                  <div key={participant.userId} className={styles.participant}>
                    {participant.avatarUrl ? (
                      <img className={privacyMode ? `${styles.participantAvatar} ${styles.blurred}` : styles.participantAvatar} src={participant.avatarUrl} alt="" />
                    ) : (
                      <span className={styles.participantAvatar}>{privacyMode ? '?' : participant.username[0]?.toUpperCase()}</span>
                    )}
                    <span>{privacyMode ? t('discord.userNumber', { number: index + 1 }) : participant.globalName || participant.username}</span>
                    <div className={styles.participantIcons}>
                      {participant.mute && <MicOff size={12} />}
                      {participant.deaf && <Headphones size={12} />}
                    </div>
                  </div>
                ))}
              </div>
              <div className={styles.voiceControls}>
                <button type="button" onClick={() => { void setDiscordMute(!status.voiceState?.selfMute); }} aria-label={t('discord.mute')}>
                  {status.voiceState.selfMute ? <MicOff size={15} /> : <Mic size={15} />}
                </button>
                <button type="button" onClick={() => { void setDiscordDeaf(!status.voiceState?.selfDeaf); }} aria-label={t('discord.deafen')}>
                  <Headphones size={15} />
                </button>
                <button type="button" onClick={() => { void disconnectDiscordVoice(); }} aria-label={t('discord.leave')}>
                  <PhoneOff size={15} />
                </button>
              </div>
            </div>
          ) : (
            <PanelWidgetEmpty icon={<Headphones size={22} />} title={t('discord.empty.voice.title')} text={t('discord.empty.voice.text')} />
          )
        )}
        {activeTab === 'servers' && (
          <ServersTab guilds={status?.guilds ?? []} privacyMode={privacyMode} />
        )}
      </main>
    </PanelWidgetShell>
  );
}

function ActivityTab({ notifications, privacyMode, compact }: {
  notifications: DiscordNotification[];
  privacyMode: boolean;
  compact: boolean;
}) {
  const { t } = useTranslation();
  const items = compact ? notifications.slice(0, 3) : notifications.slice(0, 8);
  if (items.length === 0) {
    return <PanelWidgetEmpty icon={<BellOff size={22} />} title={t('discord.empty.activity.title')} text={t('discord.empty.activity.text')} />;
  }
  return (
    <div className={styles.notificationList}>
      {items.map(item => (
        <button
          key={item.id}
          type="button"
          className={styles.notification}
          data-mention={item.mentionEveryone || item.mentionUser ? 'true' : 'false'}
          onClick={() => { void openDiscordPath(item.guildId ? `channels/${item.guildId}/${item.channelId}/${item.id}` : `channels/@me/${item.channelId}/${item.id}`); }}
        >
          <img className={privacyMode ? `${styles.notificationIcon} ${styles.blurred}` : styles.notificationIcon} src={item.iconUrl} alt="" />
          <div className={styles.notificationText}>
            <div className={styles.notificationTitle}>{privacyMode ? t('discord.privacyNotification') : item.title}</div>
            {item.body && <div className={styles.notificationBody}>{privacyMode ? t('discord.privacyNewMessage') : item.body}</div>}
          </div>
          {(item.mentionEveryone || item.mentionUser) && <span className={styles.mentionBadge}>@</span>}
        </button>
      ))}
    </div>
  );
}

function ServersTab({ guilds, privacyMode }: { guilds: DiscordGuild[]; privacyMode: boolean }) {
  const { t } = useTranslation();
  if (guilds.length === 0) {
    return <PanelWidgetEmpty icon={<Compass size={22} />} title={t('discord.empty.servers.title')} text={t('discord.empty.servers.text')} />;
  }
  return (
    <div className={styles.serverGrid}>
      {guilds.map(guild => (
        <button
          key={guild.id}
          type="button"
          className={styles.server}
          onClick={() => { void openDiscordPath(`channels/${guild.id}`); }}
          aria-label={privacyMode ? t('discord.server') : guild.name}
        >
          {guild.iconUrl ? (
            <img className={privacyMode ? styles.blurred : undefined} src={guild.iconUrl} alt="" />
          ) : (
            <span>{privacyMode ? '?' : initials(guild.name)}</span>
          )}
        </button>
      ))}
    </div>
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default DiscordWidget;
