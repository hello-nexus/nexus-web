import { useRef, useState } from 'react';
import classNames from 'classnames';
import {
  ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen,
  MoreHorizontal, Settings, CircleHelp, Info, Unplug,
} from 'lucide-react';
import { ProfileDropdown } from '../components/common/ProfileDropdown/ProfileDropdown';
import { AboutModal } from '../components/common/AboutModal/AboutModal';
import { HoverTooltip } from '../components/common/HoverTooltip/HoverTooltip';
import { useClickOutside } from '../hooks/useClickOutside';
import { useTranslation } from '../lib/i18n';
import { CaptionButtons } from './CaptionButtons';
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
  // True only inside the Nexus Windows --app shell (custom caption buttons).
  isWindowsApp: boolean;
  // True only inside the Nexus macOS shell. The native traffic lights overlay
  // the top-left, so the left cluster is inset past them.
  isMacApp: boolean;
}

// The "..." overflow menu: Settings / Help / About.
function TopBarMenu({ onNavigateSettings, onOpenAbout }: {
  onNavigateSettings: () => void;
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
  isWindowsApp,
  isMacApp,
}: TopBarProps) {
  const { t } = useTranslation();
  const [aboutOpen, setAboutOpen] = useState(false);

  const offlineLabel = connectionState === 'checking'
    ? t('status.checking')
    : connectionState === 'offline-installed'
    ? t('status.offline-installed')
    : t('status.offline');

  return (
    <header className={classNames(styles.topBar, {
      [styles.topBarMacApp]: isMacApp,
      [styles.topBarWindowsApp]: isWindowsApp,
    })}>
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

      {/* Center search-bar pill, absolutely centered on the window. Display-only
          today — it shows the active page name; the bar background around it
          remains the window-drag region. */}
      <div className={styles.searchBar}>
        {/* The page name is the document's primary heading (the in-page <h1>s
            were removed when titles moved into the top bar). */}
        <h1 className={styles.searchTitle}>{pageTitle}</h1>
      </div>

      <div className={styles.rightCluster}>
        <TopBarMenu onNavigateSettings={onNavigateSettings} onOpenAbout={() => setAboutOpen(true)} />
        <div className={styles.profileSlot}>
          {online ? (
            <ConnectedProfileSlot connectEpoch={connectEpoch}>
              <ProfileDropdown
                profiles={profiles}
                onPreferencesChanged={onPreferencesChanged}
                onNavigateSettings={onNavigateSettings}
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
