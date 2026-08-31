import { useCallback, useRef, useState } from 'react';
import classNames from 'classnames';
import {
  ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen,
  MoreVertical, Settings, FlaskConical, Info, Unplug,
  SlidersHorizontal, RefreshCw, Maximize2, Minimize2,
} from 'lucide-react';
import { DiscordGlyph } from '../components/icons/NexusBrand';
import { ProfileDropdown } from '../components/common/ProfileDropdown/ProfileDropdown';
import { AboutModal } from '../components/common/AboutModal/AboutModal';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { useClickOutside } from '../hooks/useClickOutside';
import { useTranslation } from '../lib/i18n';
import { DEV_TOOLS } from '../lib/devTools';
import { OFFICIAL_BUILD } from '../lib/officialBuild';
import { useCommandPaletteOptional } from '../search/CommandPaletteContext';
import { useSearchSignal } from '../search/signals';
import { TopSearch } from '../search/TopSearch';
import { DISCORD_INVITE_URL } from '../lib/externalLinks';
import { CaptionButtons } from './CaptionButtons';
import { ErrorBoundary } from '../components/common/ErrorBoundary/ErrorBoundary';
import { FocusChip } from './FocusChip';
import { usePageChrome } from './PageChrome';
import { useWindowDragRegion } from './useWindowDragRegion';
import { ConnectedProfileSlot, ConflictStatusSlot, UpdateStatusSlot } from './sidebar';
import type { ConnectionState } from '../hooks/useServiceStatus';
import type { UseProfilesResult } from '../hooks/useProfiles';
import type { UseCloudAccountsResult } from '../hooks/useCloudAccounts';
import type { Preferences } from '../api/profiles';
import styles from './TopBar.module.scss';

interface TopBarProps {
  // Sidebar collapse toggle. Hidden when the current section renders no
  // sidebar (the collapse button has nothing to act on).
  hasSidebar: boolean;
  compact: boolean;
  onToggleCompact: () => void;
  // Centered page name shown inside the search-bar pill.
  pageTitle: string;
  // Browser-style history nav. Rendered only in the desktop app build.
  canGoBack: boolean;
  canGoForward: boolean;
  goBack: () => void;
  goForward: () => void;
  online: boolean;
  // Host OS from /ping, forwarded to the search palette's platform gates.
  platform: string;
  connectionState: ConnectionState;
  // Bumped on every offline -> online transition so the profile slot replays
  // its fade-in once (mirrors the old sidebar header behavior).
  connectEpoch: number;
  profiles: UseProfilesResult;
  // Cloud account state, for the top-bar avatar image/initial and the profile
  // dropdown's top account entry (log in / account row). Undefined/no active
  // account keeps the trigger's generic person icon unchanged.
  cloudAccounts: UseCloudAccountsResult;
  onPreferencesChanged: (prefs: Preferences) => void;
  onNavigateSettings: () => void;
  // The "..." menu's "Dev tools" target (standalone developer page).
  onNavigateTools: () => void;
  // The "..." menu's "Check for updates" target (opens the update modal). Also
  // the update status button's action in notify mode (view release notes).
  onOpenUpdate: () => void;
  // The update status button's action when an update is staged: start install.
  onInstall: () => void;
  // Profile dropdown's "Manage profiles" target (standalone Profiles page).
  onManageProfiles: () => void;
  // Profile dropdown's top account entry target (standalone Account page).
  onNavigateAccount: () => void;
  // True only inside the Nexus Windows --app shell (custom caption buttons).
  isWindowsApp: boolean;
  // True only inside the Nexus macOS shell. The native traffic lights overlay
  // the top-left, so the left cluster is inset past them.
  isMacApp: boolean;
  // True when the active page opted into Fullscreen mode (see
  // FULLSCREEN_CAPABLE_VIEWS in sidebarNav.tsx).
  fullscreenCapable: boolean;
  // Current Fullscreen state, owned by Dashboard - also drives the sidebar
  // visibility and the page-width layout.
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}

// The "..." overflow menu: Settings / Check for updates / Dev tools / Discord / About.
function TopBarMenu({ onNavigateSettings, onNavigateTools, onOpenAbout, onOpenUpdate }: {
  onNavigateSettings: () => void;
  onNavigateTools: () => void;
  onOpenAbout: () => void;
  onOpenUpdate: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, () => setOpen(false), open);

  const close = () => setOpen(false);

  return (
    <div className={styles.menuWrap} ref={ref}>
      <HoverTooltip body={t('topbar.menu')} side="bottom">
        <button
          type="button"
          className={classNames(styles.iconButton, { [styles.iconButtonActive]: open })}
          onClick={() => setOpen(o => !o)}
          aria-label={t('topbar.menu')}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <MoreVertical size={18} />
        </button>
      </HoverTooltip>
      {open && (
        <div className={styles.menuDropdown} role="menu">
          <button type="button" className={styles.menuItem} role="menuitem"
            onClick={() => { close(); onNavigateSettings(); }}>
            <Settings size={14} /> {t('nav.settings')}
          </button>
          {OFFICIAL_BUILD && (
            <button type="button" className={styles.menuItem} role="menuitem"
              onClick={() => { close(); onOpenUpdate(); }}>
              <RefreshCw size={14} /> {t('update.menu.check')}
            </button>
          )}
          {DEV_TOOLS && (
            <button type="button" className={styles.menuItem} role="menuitem"
              onClick={() => { close(); onNavigateTools(); }}>
              <FlaskConical size={14} /> {t('settings.tab.tools')}
            </button>
          )}
          <a className={styles.menuItem} role="menuitem"
            href={DISCORD_INVITE_URL} target="_blank" rel="noopener noreferrer"
            onClick={close}>
            <DiscordGlyph size={14} /> {t('nav.discord')}
          </a>
          <button type="button" className={styles.menuItem} role="menuitem"
            onClick={() => { close(); onOpenAbout(); }}>
            <Info size={14} /> {t('nav.about')}
          </button>
        </div>
      )}
    </div>
  );
}

export function TopBar({
  hasSidebar,
  compact,
  onToggleCompact,
  pageTitle,
  canGoBack,
  canGoForward,
  goBack,
  goForward,
  online,
  platform,
  connectionState,
  connectEpoch,
  profiles,
  cloudAccounts,
  onPreferencesChanged,
  onNavigateSettings,
  onNavigateTools,
  onOpenUpdate,
  onInstall,
  onManageProfiles,
  onNavigateAccount,
  isWindowsApp,
  isMacApp,
  fullscreenCapable,
  fullscreen,
  onToggleFullscreen,
}: TopBarProps) {
  const { t } = useTranslation();
  const [aboutOpen, setAboutOpen] = useState(false);
  const palette = useCommandPaletteOptional();
  // Search's About entry opens the modal this bar owns.
  useSearchSignal('about', useCallback(() => setAboutOpen(true), []));
  // Page-registered chrome, surfaced just right of the search pill: a
  // settings action (Monitoring registers one).
  const pageChrome = usePageChrome();
  const pageSettings = pageChrome?.settings ?? null;
  const setTabsSlot = pageChrome?.setTabsSlot;
  // Empty areas of the bar drag the window (Windows shell only); see hook.
  const dragRegion = useWindowDragRegion();

  const offlineLabel = connectionState === 'checking'
    ? t('status.checking')
    : connectionState === 'offline-installed'
    ? t('status.offline-installed')
    : t('status.offline');

  return (
    <header
      {...dragRegion}
      className={classNames(styles.topBar, {
        [styles.topBarMacApp]: isMacApp,
        [styles.topBarWindowsApp]: isWindowsApp,
      })}
    >
      <div className={styles.leftCluster}>
        {hasSidebar && !fullscreen && (
          <HoverTooltip body={compact ? t('sidebar.expand') : t('sidebar.collapse')} side="bottom">
            <button
              type="button"
              className={styles.iconButton}
              onClick={onToggleCompact}
              aria-label={compact ? t('sidebar.expand') : t('sidebar.collapse')}
            >
              {compact ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          </HoverTooltip>
        )}
        {/* Fullscreen toggle: immediately right of the collapse button. Only
            renders on pages that opted in (FULLSCREEN_CAPABLE_VIEWS); stays
            visible in fullscreen since it's the only way back. */}
        {fullscreenCapable && (
          <HoverTooltip body={fullscreen ? t('topbar.fullscreen.exit') : t('topbar.fullscreen')} side="bottom">
            <button
              type="button"
              className={styles.iconButton}
              onClick={onToggleFullscreen}
              aria-label={fullscreen ? t('topbar.fullscreen.exit') : t('topbar.fullscreen')}
            >
              {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </HoverTooltip>
        )}
        {/* Boundaried on its own: the chip measures live layout, and TopBar
            sits outside Dashboard's boundary, so an error here would blank
            the whole window rather than one control. */}
        {!fullscreen && (
          <ErrorBoundary>
            <FocusChip online={online} />
          </ErrorBoundary>
        )}
        {/* Page tabs move up here in fullscreen. Inside leftCluster so they
            inherit the macOS traffic-light inset, and every tab is a <button>,
            which the drag region already excludes - so the bar still drags
            from the empty space to their right. */}
        <div className={styles.pageTabs} ref={setTabsSlot} />
      </div>

      {/* History arrows: pinned immediately to the left of the centered search
          pill. Desktop-app build only; hidden in fullscreen along with the
          rest of the bar's navigation chrome. */}
      {__SERVICE_BUILD__ && !fullscreen && (
        <div className={styles.navArrows} data-topbar-arrows>
          <HoverTooltip body={t('nav.back')} side="bottom">
            <button type="button" className={styles.iconButton}
              onClick={goBack} disabled={!canGoBack} aria-label={t('nav.back')}>
              <ChevronLeft size={18} />
            </button>
          </HoverTooltip>
          <HoverTooltip body={t('nav.forward')} side="bottom">
            <button type="button" className={styles.iconButton}
              onClick={goForward} disabled={!canGoForward} aria-label={t('nav.forward')}>
              <ChevronRight size={18} />
            </button>
          </HoverTooltip>
        </div>
      )}

      {/* Center search pill. With a palette provider it's the interactive
          docked search (TopSearch); otherwise a display-only title (panel
          kiosk / iOS). The page name is the document's primary heading - the
          in-page <h1>s were removed when titles moved into the top bar.
          Hidden entirely in fullscreen. */}
      {!fullscreen && (palette ? (
        <TopSearch pageTitle={pageTitle} online={online} platform={platform} />
      ) : (
        <div className={styles.searchBar}>
          <h1 className={styles.searchTitle}>{pageTitle}</h1>
        </div>
      ))}

      {/* Page-registered chrome, pinned just right of the centered search pill
          (mirrors the history arrows on its left): the page-settings button.
          Hidden in Focus mode. The mac shell's drag-strip carve-out mirrors
          this cluster's geometry (MacAppWindow.IsTopBarButtonColumn) - width
          changes here need the matching constants updated there. */}
      {!fullscreen && pageSettings && (
        <div className={styles.pageSettings}>
          <HoverTooltip body={pageSettings.label} side="bottom">
            <button
              type="button"
              className={styles.pageSettingsButton}
              onClick={pageSettings.onOpen}
              aria-label={pageSettings.label}
            >
              <SlidersHorizontal size={16} aria-hidden />
            </button>
          </HoverTooltip>
        </div>
      )}

      <div className={styles.rightCluster}>
        {/* Status alerts sit just left of the "..." menu: app-conflict (amber)
            and update-available (green). Each hides itself when inactive.
            All hidden in Focus mode along with the rest of this cluster - only
            the window controls (below) survive it. */}
        {!fullscreen && <ConflictStatusSlot serviceOnline={online} />}
        {!fullscreen && OFFICIAL_BUILD && <UpdateStatusSlot serviceOnline={online} onOpen={onOpenUpdate} onInstall={onInstall} />}
        {!fullscreen && (
          <TopBarMenu onNavigateSettings={onNavigateSettings} onNavigateTools={onNavigateTools} onOpenAbout={() => setAboutOpen(true)} onOpenUpdate={onOpenUpdate} />
        )}
        {!fullscreen && (
          <div className={styles.profileSlot}>
            {online ? (
              <ConnectedProfileSlot connectEpoch={connectEpoch}>
                <ProfileDropdown
                  profiles={profiles}
                  onPreferencesChanged={onPreferencesChanged}
                  onNavigateSettings={onManageProfiles}
                  onNavigateAccount={onNavigateAccount}
                  accountAvatarUrl={cloudAccounts.activeAccount?.avatar?.small}
                  accountInitial={cloudAccounts.activeAccount?.username?.charAt(0).toUpperCase()}
                  accountUsername={cloudAccounts.activeAccount?.username}
                  signedIn={cloudAccounts.activeAccount != null}
                  variant="avatar"
                />
              </ConnectedProfileSlot>
            ) : (
              <HoverTooltip body={offlineLabel} side="bottom">
                <span className={styles.offlineAvatar} role="status" aria-live="polite" aria-label={offlineLabel}>
                  <Unplug
                    size={15}
                    className={classNames(styles.offlineIcon, {
                      [styles.offlineIconChecking]: connectionState === 'checking',
                    })}
                    aria-hidden
                  />
                </span>
              </HoverTooltip>
            )}
          </div>
        )}
        {isWindowsApp && <CaptionButtons />}
      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} onCheckUpdate={OFFICIAL_BUILD ? onOpenUpdate : undefined} />
    </header>
  );
}
