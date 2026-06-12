import { useEffect, useMemo, useRef, useState } from 'react';
import { Gamepad2, Play, Users } from 'lucide-react';
import {
  fetchSteamAchievements,
  fetchSteamFriends,
  fetchSteamOwnedGames,
  fetchSteamProfile,
  fetchSteamRecentGames,
  fetchSteamStatus,
  type SteamAchievement,
  type SteamFriendSummary,
  type SteamOwnedGame,
  type SteamPlayerSummary,
  type SteamRecentGame,
  type SteamStatusResponse,
} from '../../../api/steam';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetProps } from '../types';
import {
  PanelStatusDot,
  PanelWidgetEmpty,
  PanelWidgetSetup,
  PanelWidgetShell,
  PanelWidgetTab,
  PanelWidgetTabs,
} from '../common/PanelWidgetChrome';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { STEAM_PREVIEW } from './steamPreviewData';
import styles from './SteamWidget.module.scss';

type SteamTab = 'activity' | 'playing' | 'friends';

const PROFILE_POLL_MS = 5_000;
const LISTS_POLL_MS = 30_000;

export function SteamWidget({ widget, onConfigure }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const [status, setStatus] = useState<SteamStatusResponse | null>(preview ? STEAM_PREVIEW.status : null);
  const [profile, setProfile] = useState<SteamPlayerSummary | null>(preview ? STEAM_PREVIEW.profile : null);
  const [level, setLevel] = useState<number | null>(preview ? STEAM_PREVIEW.level : null);
  const [recentGames, setRecentGames] = useState<SteamRecentGame[]>(preview ? STEAM_PREVIEW.recentGames : []);
  const [ownedGames, setOwnedGames] = useState<SteamOwnedGame[]>(preview ? STEAM_PREVIEW.ownedGames : []);
  const [friends, setFriends] = useState<SteamFriendSummary[]>(preview ? STEAM_PREVIEW.friends : []);
  const [achievements, setAchievements] = useState<SteamAchievement[]>(preview ? STEAM_PREVIEW.achievements : []);
  const [activeTab, setActiveTab] = useState<SteamTab>('activity');
  const [bannerError, setBannerError] = useState(false);
  const trackedAppId = useRef<number | null>(null);

  const currentGame = useMemo(() => {
    const appId = Number(profile?.gameId);
    if (!profile?.gameExtraInfo || !Number.isFinite(appId) || appId <= 0) return null;
    return { appId, name: profile.gameExtraInfo };
  }, [profile]);

  // Profile + status drive the current-game detection that auto-switches to
  // the Playing tab, so they poll fast. Recent games + owned games + friends
  // change rarely; the service caches them anyway. Two timers > one combined
  // poll to keep activity-tab data from staling out the auto-switch.
  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    async function loadProfile() {
      const nextStatus = await fetchSteamStatus();
      if (cancelled || !nextStatus) return;
      setStatus(nextStatus);
      if (!nextStatus.ready) return;
      const profileResponse = await fetchSteamProfile();
      if (cancelled || !profileResponse || profileResponse.error) return;
      setProfile(profileResponse.profile ?? null);
      setLevel(profileResponse.level ?? null);
    }
    loadProfile();
    const timer = window.setInterval(loadProfile, PROFILE_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [preview]);

  useEffect(() => {
    if (preview || !status?.ready) return;
    let cancelled = false;
    async function loadLists() {
      const [recentResponse, ownedResponse, friendsResponse] = await Promise.all([
        fetchSteamRecentGames(),
        fetchSteamOwnedGames(),
        fetchSteamFriends(),
      ]);
      if (cancelled) return;
      if (recentResponse) setRecentGames(recentResponse);
      if (ownedResponse) setOwnedGames(ownedResponse);
      if (friendsResponse) setFriends(friendsResponse);
    }
    loadLists();
    const timer = window.setInterval(loadLists, LISTS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [preview, status?.ready]);

  useEffect(() => {
    if (!currentGame) {
      trackedAppId.current = null;
      return;
    }
    if (trackedAppId.current !== currentGame.appId) {
      trackedAppId.current = currentGame.appId;
      // Auto-switch to the Playing tab and reset banner state when the
      // active game changes. This is a one-shot reaction to an external
      // event (Steam profile poll says a new game started), not a derived
      // value, so setState in the effect is intentional.
       
      setActiveTab('playing');
      setBannerError(false);
    }
  }, [currentGame]);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    if (!currentGame) {
      // Clear stale achievements when leaving a game. The list is async-
      // loaded below so we can't compute it during render.
       
      setAchievements([]);
      return;
    }
    fetchSteamAchievements(currentGame.appId).then(next => {
      if (!cancelled && next) setAchievements(next);
    });
    return () => { cancelled = true; };
  }, [preview, currentGame]);

  const ready = Boolean(status?.ready);
  const compact = widget.size === '4x4';
  const visibleRecent = compact ? recentGames.slice(0, 4) : recentGames.slice(0, 8);
  const visibleFriends = compact ? friends.slice(0, 5) : friends.slice(0, 10);

  if (!ready) {
    return (
      <PanelWidgetShell size={widget.size} className={styles.widget}>
        <PanelWidgetSetup
          icon={<Gamepad2 size={28} />}
          message={status?.reason || t('steam.setup.message')}
          actions={onConfigure ? (
            <button type="button" className="panel-chip" onClick={onConfigure}>
              {t('steam.setup.settings')}
            </button>
          ) : undefined}
        />
      </PanelWidgetShell>
    );
  }

  return (
    <PanelWidgetShell size={widget.size} className={styles.widget}>
      <header className={styles.header}>
        {profile?.avatarFull ? (
          <img className={styles.avatar} src={profile.avatarFull} alt="" />
        ) : (
          <div className={styles.avatarFallback}><Gamepad2 size={22} /></div>
        )}
        <div className={styles.profileText}>
          {/* eslint-disable-next-line i18next/no-literal-string -- Steam brand-name fallback */}
          <div className={styles.name}>{profile?.personaName || 'Steam'}</div>
          <div className={styles.statusLine}>
            <PanelStatusDot tone={personaStatusKey(profile?.personaState)} />
            <span>{personaStatusLabel(t, profile?.personaState)}</span>
            {currentGame && <span className={styles.nowPlaying}>{t('steam.playing', { name: currentGame.name })}</span>}
          </div>
        </div>
        {level !== null && <div className={styles.level}>{level}</div>}
      </header>

      <PanelWidgetTabs ariaLabel={t('steam.tabs.ariaLabel')} compact={compact}>
        <PanelWidgetTab active={activeTab === 'activity'} onClick={() => setActiveTab('activity')} icon={<Gamepad2 size={14} />} label={t('steam.tab.activity')} tooltip={t('steam.tab.activity')} />
        <PanelWidgetTab active={activeTab === 'playing'} onClick={() => setActiveTab('playing')} icon={<Play size={14} />} label={t('steam.tab.playing')} tooltip={t('steam.tab.playing')} />
        <PanelWidgetTab active={activeTab === 'friends'} onClick={() => setActiveTab('friends')} icon={<Users size={14} />} label={t('steam.tab.friends')} tooltip={t('steam.tab.friends')} />
      </PanelWidgetTabs>

      <main className={styles.content}>
        {activeTab === 'activity' && (
          <div className={styles.list}>
            {visibleRecent.length > 0 ? visibleRecent.map(game => (
              // Rows are non-interactive: a click anywhere on the widget
              // body opens the Steam page via the panel's tap-to-immersive
              // path. A button would trap the click and suppress it.
              <div key={game.appId} className={styles.gameRow}>
                {game.iconHash ? (
                  <img className={styles.gameIcon} src={steamIconUrl(game.appId, game.iconHash)} alt="" />
                ) : (
                  <span className={styles.gameIconFallback} />
                )}
                <span className={styles.rowTitle}>{game.name}</span>
                <span className={styles.rowMeta}>{formatMinutes(game.playtime2Weeks)}</span>
              </div>
            )) : (
              <PanelWidgetEmpty icon={<Gamepad2 size={22} />} title={t('panel.steam.empty')} />
            )}
          </div>
        )}

        {activeTab === 'playing' && (
          currentGame ? (
            <div className={styles.playing}>
              <div className={styles.bannerWrap}>
                {bannerError ? (
                  <div className={styles.bannerFallback} />
                ) : (
                  <img
                    className={styles.banner}
                    src={steamHeaderUrl(currentGame.appId)}
                    alt=""
                    onError={() => setBannerError(true)}
                  />
                )}
              </div>
              <div className={styles.playingName}>{currentGame.name}</div>
              <div className={styles.stats}>
                <Stat label={t('steam.stat.total')} value={formatMinutes(ownedGames.find(g => g.appId === currentGame.appId)?.playtimeForever ?? 0)} />
                <Stat label={t('steam.stat.twoWeeks')} value={formatMinutes(ownedGames.find(g => g.appId === currentGame.appId)?.playtime2Weeks ?? 0)} />
              </div>
              <AchievementBar achievements={achievements} t={t} />
            </div>
          ) : (
            <PanelWidgetEmpty icon={<Play size={22} />} title={t('steam.empty.notInGame')} />
          )
        )}

        {activeTab === 'friends' && (
          <div className={styles.list}>
            {visibleFriends.length > 0 ? visibleFriends.map(friend => (
              <div key={friend.steamId} className={styles.friendRow}>
                <img className={styles.friendAvatar} src={friend.avatarMedium} alt="" />
                <div className={styles.friendInfo}>
                  <span className={styles.rowTitle}>{friend.personaName}</span>
                  <span className={styles.rowSub}>{friend.gameExtraInfo ? t('steam.playing', { name: friend.gameExtraInfo }) : personaStatusLabel(t, friend.personaState)}</span>
                </div>
                <PanelStatusDot tone={personaStatusKey(friend.personaState)} />
              </div>
            )) : (
              <PanelWidgetEmpty icon={<Users size={22} />} title={t('steam.empty.noFriends')} />
            )}
          </div>
        )}
      </main>
    </PanelWidgetShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statValue}>{value}</span>
      <span className={styles.statLabel}>{label}</span>
    </div>
  );
}

function AchievementBar({ achievements, t }: { achievements: SteamAchievement[]; t: (key: string) => string }) {
  if (achievements.length === 0) return null;
  const unlocked = achievements.filter(a => a.achieved === 1).length;
  const pct = Math.round((unlocked / achievements.length) * 100);
  return (
    <div className={styles.achievements}>
      <div className={styles.achievementTop}>
        <span>{t('steam.achievements')}</span>
        <span>{unlocked}/{achievements.length}</span>
      </div>
      <div className={styles.achievementTrack}>
        <div className={styles.achievementFill} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function steamIconUrl(appId: number, hash: string) {
  return `https://media.steampowered.com/steamcommunity/public/images/apps/${appId}/${hash}.jpg`;
}

function steamHeaderUrl(appId: number) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`;
}

function formatMinutes(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function personaStatusKey(state: number | undefined): 'online' | 'away' | 'busy' | 'offline' {
  if (state === 1 || state === 5 || state === 6) return 'online';
  if (state === 3 || state === 4) return 'away';
  if (state === 2) return 'busy';
  return 'offline';
}

function personaStatusLabel(t: (key: string) => string, state: number | undefined) {
  switch (state) {
    case 1:
      return t('steam.persona.online');
    case 2:
      return t('steam.persona.busy');
    case 3:
      return t('steam.persona.away');
    case 4:
      return t('steam.persona.snooze');
    case 5:
      return t('steam.persona.trading');
    case 6:
      return t('steam.persona.looking');
    default:
      return t('steam.persona.offline');
  }
}

export default SteamWidget;
