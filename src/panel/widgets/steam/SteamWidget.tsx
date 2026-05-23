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
import styles from './SteamWidget.module.scss';

type SteamTab = 'activity' | 'playing' | 'friends';

const PROFILE_POLL_MS = 5_000;
const LISTS_POLL_MS = 30_000;

export function SteamWidget({ widget, onConfigure }: WidgetProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SteamStatusResponse | null>(null);
  const [profile, setProfile] = useState<SteamPlayerSummary | null>(null);
  const [level, setLevel] = useState<number | null>(null);
  const [recentGames, setRecentGames] = useState<SteamRecentGame[]>([]);
  const [ownedGames, setOwnedGames] = useState<SteamOwnedGame[]>([]);
  const [friends, setFriends] = useState<SteamFriendSummary[]>([]);
  const [achievements, setAchievements] = useState<SteamAchievement[]>([]);
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
  }, []);

  useEffect(() => {
    if (!status?.ready) return;
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
  }, [status?.ready]);

  useEffect(() => {
    if (!currentGame) {
      trackedAppId.current = null;
      return;
    }
    if (trackedAppId.current !== currentGame.appId) {
      trackedAppId.current = currentGame.appId;
      setActiveTab('playing');
      setBannerError(false);
    }
  }, [currentGame]);

  useEffect(() => {
    let cancelled = false;
    if (!currentGame) {
      setAchievements([]);
      return;
    }
    fetchSteamAchievements(currentGame.appId).then(next => {
      if (!cancelled && next) setAchievements(next);
    });
    return () => { cancelled = true; };
  }, [currentGame]);

  const ready = Boolean(status?.ready);
  const compact = widget.size === '4x4';
  const visibleRecent = compact ? recentGames.slice(0, 4) : recentGames.slice(0, 8);
  const visibleFriends = compact ? friends.slice(0, 5) : friends.slice(0, 10);

  if (!ready) {
    return (
      <PanelWidgetShell size={widget.size} className={styles.widget}>
        <PanelWidgetSetup
          icon={<Gamepad2 size={28} />}
          message={status?.reason || 'Add a Steam Web API key in widget settings.'}
          actions={onConfigure ? (
            <button type="button" className="panel-chip" onClick={onConfigure}>
              Settings
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
          <div className={styles.name}>{profile?.personaName || 'Steam'}</div>
          <div className={styles.statusLine}>
            <PanelStatusDot tone={personaStatusKey(profile?.personaState)} />
            <span>{personaStatusLabel(profile?.personaState)}</span>
            {currentGame && <span className={styles.nowPlaying}>Playing {currentGame.name}</span>}
          </div>
        </div>
        {level !== null && <div className={styles.level}>{level}</div>}
      </header>

      <PanelWidgetTabs ariaLabel="Steam widget views" compact={compact}>
        <PanelWidgetTab active={activeTab === 'activity'} onClick={() => setActiveTab('activity')} icon={<Gamepad2 size={14} />} label="Activity" tooltip="Activity" />
        <PanelWidgetTab active={activeTab === 'playing'} onClick={() => setActiveTab('playing')} icon={<Play size={14} />} label="Playing" tooltip="Playing" />
        <PanelWidgetTab active={activeTab === 'friends'} onClick={() => setActiveTab('friends')} icon={<Users size={14} />} label="Friends" tooltip="Friends" />
      </PanelWidgetTabs>

      <main className={styles.content}>
        {activeTab === 'activity' && (
          <div className={styles.list}>
            {visibleRecent.length > 0 ? visibleRecent.map(game => (
              // Rows are non-interactive: clicking anywhere on the widget
              // body (including a row) is meant to open the Steam page
              // overlay via the panel's tap-to-immersive path. Wrapping
              // them in a button would suppress that gesture and trap the
              // click inside the widget.
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
                <Stat label="Total" value={formatMinutes(ownedGames.find(g => g.appId === currentGame.appId)?.playtimeForever ?? 0)} />
                <Stat label="2 weeks" value={formatMinutes(ownedGames.find(g => g.appId === currentGame.appId)?.playtime2Weeks ?? 0)} />
              </div>
              <AchievementBar achievements={achievements} />
            </div>
          ) : (
            <PanelWidgetEmpty icon={<Play size={22} />} title="Not currently in a game" />
          )
        )}

        {activeTab === 'friends' && (
          <div className={styles.list}>
            {visibleFriends.length > 0 ? visibleFriends.map(friend => (
              <div key={friend.steamId} className={styles.friendRow}>
                <img className={styles.friendAvatar} src={friend.avatarMedium} alt="" />
                <div className={styles.friendInfo}>
                  <span className={styles.rowTitle}>{friend.personaName}</span>
                  <span className={styles.rowSub}>{friend.gameExtraInfo ? `Playing ${friend.gameExtraInfo}` : personaStatusLabel(friend.personaState)}</span>
                </div>
                <PanelStatusDot tone={personaStatusKey(friend.personaState)} />
              </div>
            )) : (
              <PanelWidgetEmpty icon={<Users size={22} />} title="No friends found" />
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

function AchievementBar({ achievements }: { achievements: SteamAchievement[] }) {
  if (achievements.length === 0) return null;
  const unlocked = achievements.filter(a => a.achieved === 1).length;
  const pct = Math.round((unlocked / achievements.length) * 100);
  return (
    <div className={styles.achievements}>
      <div className={styles.achievementTop}>
        <span>Achievements</span>
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

function personaStatusLabel(state: number | undefined) {
  switch (state) {
    case 1:
      return 'Online';
    case 2:
      return 'Busy';
    case 3:
      return 'Away';
    case 4:
      return 'Snooze';
    case 5:
      return 'Trading';
    case 6:
      return 'Looking';
    default:
      return 'Offline';
  }
}

export default SteamWidget;
