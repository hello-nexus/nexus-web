import { useRef, useState } from 'react';
import classNames from 'classnames';
import {
  ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen,
  MoreHorizontal, Settings, FlaskConical, CircleHelp, Info, Unplug,
  SlidersHorizontal,
} from 'lucide-react';
import { ProfileDropdown } from '../components/common/ProfileDropdown/ProfileDropdown';
import { AboutModal } from '../components/common/AboutModal/AboutModal';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { useClickOutside } from '../hooks/useClickOutside';
import { useTranslation } from '../lib/i18n';
import { DEV_TOOLS } from '../lib/devTools';
import { useCommandPaletteOptional } from '../search/CommandPaletteContext';
import { TopSearch } from '../search/TopSearch';
import { CaptionButtons } from './CaptionButtons';
import { usePageChrome } from './PageChrome';
import { useWindowDragRegion } from './useWindowDragRegion';
import { ConnectedProfileSlot } from './sidebar';
import type { ConnectionState } from '../hooks/useServiceStatus';
import type { UseProfilesResult } from '../hooks/useProfiles';
import type { Preferences } from '../api/profiles';
import styles from './TopBar.module.scss';

// External help destination opened by the "..." menu's Help item.
const HELP_URL = 'https://hellonexus.com';

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
  connectionState: ConnectionState;
  // Bumped on every offline -> online transition so the profile slot replays
  // its fade-in once (mirrors the old sidebar header behavior).
  connectEpoch: number;
  profiles: UseProfilesResult;
  onPreferencesChanged: (prefs: Preferences) => void;
  onNavigateSettings: () => void;
  // The "..." menu's "Dev tools" target (standalone developer page).
  onNavigateTools: () => void;
  // Profile dropdown's "Manage profiles" target (standalone Profiles page).
  onManageProfiles: () => void;
  // True only inside the Nexus Windows --app shell (custom caption buttons).
  isWindowsApp: boolean;
  // True only inside the Nexus macOS shell. The native traffic lights overlay
  // the top-left, so the left cluster is inset past them.
  isMacApp: boolean;
}

// The "..." overflow menu: Settings / Dev tools / Help / About.
function TopBarMenu({ onNavigateSettings, onNavigateTools, onOpenAbout }: {
  onNavigateSettings: () => void;
  onNavigateTools: () => void;
  onOpenAbout: () => void;
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
          <MoreHorizontal size={18} />
        </button>
      </HoverTooltip>
      {open && (
        <div className={styles.menuDropdown} role="menu">
          <button type="button" className={styles.menuItem} role="menuitem"
            onClick={() => { close(); onNavigateSettings(); }}>
            <Settings size={14} /> {t('nav.settings')}
          </button>
          {DEV_TOOLS && (
            <button type="button" className={styles.menuItem} role="menuitem"
              onClick={() => { close(); onNavigateTools(); }}>
              <FlaskConical size={14} /> {t('settings.tab.tools')}
            </button>
          )}
          <a className={styles.menuItem} role="menuitem"
            href={HELP_URL} target="_blank" rel="noopener noreferrer"
            onClick={close}>
            <CircleHelp size={14} /> {t('nav.help')}
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
  connectionState,
  connectEpoch,
  profiles,
  onPreferencesChanged,
  onNavigateSettings,
  onNavigateTools,
  onManageProfiles,
  isWindowsApp,
  isMacApp,
}: TopBarProps) {
  const { t } = useTranslation();
  const [aboutOpen, setAboutOpen] = useState(false);
  const palette = useCommandPaletteOptional();
  // Settings affordance for the active page (Lighting / Cooling register one),
  // surfaced as a round button just right of the search pill.
  const pageSettings = usePageChrome()?.settings ?? null;
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
        {hasSidebar && (
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
      </div>

      {/* History arrows: pinned immediately to the left of the centered search
          pill. Desktop-app build only. */}
      {__SERVICE_BUILD__ && (
        <div className={styles.navArrows}>
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
          in-page <h1>s were removed when titles moved into the top bar. */}
      {palette ? (
        <TopSearch pageTitle={pageTitle} online={online} />
      ) : (
        <div className={styles.searchBar}>
          <h1 className={styles.searchTitle}>{pageTitle}</h1>
        </div>
      )}

      {/* Page settings, pinned just right of the centered search pill (mirrors
          the history arrows on its left). Round to echo the pill; shown only
          when the active page registers a settings action. */}
      {pageSettings && (
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
        <TopBarMenu onNavigateSettings={onNavigateSettings} onNavigateTools={onNavigateTools} onOpenAbout={() => setAboutOpen(true)} />
        <div className={styles.profileSlot}>
          {online ? (
            <ConnectedProfileSlot connectEpoch={connectEpoch}>
              <ProfileDropdown
                profiles={profiles}
                onPreferencesChanged={onPreferencesChanged}
                onNavigateSettings={onManageProfiles}
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
        {isWindowsApp && <CaptionButtons />}
      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </header>
  );
}
