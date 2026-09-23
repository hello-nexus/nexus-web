import { useCallback, type ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UseProfilesResult } from '../hooks/useProfiles';
import type { UseCloudAccountsResult } from '../hooks/useCloudAccounts';

// Fullscreen mode's top-bar changes touch a lot of sibling chrome (alerts, update
// status, the profile slot) that each carry their own provider/network
// dependencies unrelated to this change. Stub them so this test isolates the
// conditional rendering TopBar itself owns.
vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('./sidebar', () => ({
  ConnectedProfileSlot: ({ children }: { children: ReactNode }) => <>{children}</>,
  ConflictStatusSlot: () => <div data-testid="conflict-status-slot" />,
  UpdateStatusSlot: () => <div data-testid="update-status-slot" />,
}));

import { TopBar } from './TopBar';
import { PageChromeProvider, usePageSettingsAction } from './PageChrome';

const profiles: UseProfilesResult = {
  profiles: [],
  activeId: '',
  switchProfile: async () => null,
  createProfile: async () => ({ status: 200, body: null }),
  renameProfile: async () => ({ status: 200, body: null }),
  deleteProfile: async () => {},
  exportProfile: async () => {},
  importProfile: async () => ({ status: 200, body: null }),
  reorderProfiles: () => {},
  refresh: async () => {},
  loading: false,
};

const cloudAccounts: UseCloudAccountsResult = {
  activeAccountId: null,
  activeAccount: null,
  refresh: async () => {},
};

function renderTopBar(overrides: Partial<Parameters<typeof TopBar>[0]> = {}) {
  return render(
    <TopBar
      hasSidebar
      compact={false}
      onToggleCompact={() => {}}
      pageTitle="Monitoring"
      canGoBack={false}
      canGoForward={false}
      goBack={() => {}}
      goForward={() => {}}
      online={false}
      platform=""
      connectionState="online"
      connectEpoch={0}
      profiles={profiles}
      cloudAccounts={cloudAccounts}
      onPreferencesChanged={() => {}}
      onNavigateSettings={() => {}}
      onNavigateTools={() => {}}
      onOpenUpdate={() => {}}
      onInstall={() => {}}
      onManageConflictApps={() => {}}
      onManageProfiles={() => {}}
      onNavigateAccount={() => {}}
      isWindowsApp
      isMacApp={false}
      fullscreenCapable={false}
      fullscreen={false}
      onToggleFullscreen={() => {}}
      {...overrides}
    />,
  );
}

describe('TopBar focus mode', () => {
  it('does not render the Focus toggle on a non-capable page', () => {
    renderTopBar({ fullscreenCapable: false });
    expect(screen.queryByLabelText('topbar.fullscreen')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('topbar.fullscreen.exit')).not.toBeInTheDocument();
  });

  it('renders the Focus toggle immediately after the collapse button on a capable page', () => {
    renderTopBar({ fullscreenCapable: true, fullscreen: false });
    const collapse = screen.getByLabelText('sidebar.collapse');
    const focus = screen.getByLabelText('topbar.fullscreen');
    // Both live in the same left cluster, collapse first.
    expect(collapse.compareDocumentPosition(focus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('calls onToggleFullscreen when the Focus button is clicked', () => {
    const onToggleFullscreen = vi.fn();
    renderTopBar({ fullscreenCapable: true, fullscreen: false, onToggleFullscreen });
    fireEvent.click(screen.getByLabelText('topbar.fullscreen'));
    expect(onToggleFullscreen).toHaveBeenCalledTimes(1);
  });

  it('strips the bar to the Focus toggle + window controls while active', () => {
    renderTopBar({ fullscreenCapable: true, fullscreen: true, hasSidebar: true, isWindowsApp: true });

    // Hidden: collapse toggle, page title/search pill, alerts, update status,
    // overflow menu, profile slot.
    expect(screen.queryByLabelText('sidebar.collapse')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('sidebar.expand')).not.toBeInTheDocument();
    expect(screen.queryByText('Monitoring')).not.toBeInTheDocument();
    expect(screen.queryByTestId('conflict-status-slot')).not.toBeInTheDocument();
    expect(screen.queryByTestId('update-status-slot')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('topbar.menu')).not.toBeInTheDocument();

    // Kept: the Focus (exit) toggle and the window controls.
    expect(screen.getByLabelText('topbar.fullscreen.exit')).toBeInTheDocument();
    expect(screen.getByLabelText('app.window.close')).toBeInTheDocument();
  });

  it('shows the page title again once Focus mode is off', () => {
    renderTopBar({ fullscreenCapable: true, fullscreen: false });
    expect(screen.getByText('Monitoring')).toBeInTheDocument();
  });
});

// Stand-in for a page (Monitoring) registering its top-bar settings action.
function RegisterSettingsAction({ label, onOpen }: { label: string; onOpen: () => void }) {
  usePageSettingsAction({ label, onOpen: useCallback(() => onOpen(), [onOpen]) });
  return null;
}

function renderTopBarWithSettingsAction(
  onOpen: () => void,
  overrides: Partial<Parameters<typeof TopBar>[0]> = {},
) {
  return render(
    <PageChromeProvider>
      <RegisterSettingsAction label="monitoring.settings" onOpen={onOpen} />
      <TopBar
        hasSidebar
        compact={false}
        onToggleCompact={() => {}}
        pageTitle="Monitoring"
        canGoBack={false}
        canGoForward={false}
        goBack={() => {}}
        goForward={() => {}}
        online={false}
        platform=""
        connectionState="online"
        connectEpoch={0}
        profiles={profiles}
        cloudAccounts={cloudAccounts}
        onPreferencesChanged={() => {}}
        onNavigateSettings={() => {}}
        onNavigateTools={() => {}}
        onOpenUpdate={() => {}}
        onInstall={() => {}}
        onManageConflictApps={() => {}}
        onManageProfiles={() => {}}
        onNavigateAccount={() => {}}
        isWindowsApp
        isMacApp={false}
        fullscreenCapable={false}
        fullscreen={false}
        onToggleFullscreen={() => {}}
        {...overrides}
      />
    </PageChromeProvider>,
  );
}

describe('TopBar page settings action', () => {
  it('renders no settings button when the active page registered none', () => {
    renderTopBar();
    expect(screen.queryByRole('button', { name: 'monitoring.settings' })).not.toBeInTheDocument();
  });

  it('renders the registered settings button and fires it on click', () => {
    const onOpen = vi.fn();
    renderTopBarWithSettingsAction(onOpen);
    const btn = screen.getByRole('button', { name: 'monitoring.settings' });
    fireEvent.click(btn);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('hides the settings button in Focus mode', () => {
    renderTopBarWithSettingsAction(vi.fn(), { fullscreenCapable: true, fullscreen: true });
    expect(screen.queryByRole('button', { name: 'monitoring.settings' })).not.toBeInTheDocument();
  });
});
