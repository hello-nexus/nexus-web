import { useCallback } from 'react';
import { useToast } from '../components/common/Toast/Toast';
import { useTopicCallback } from '../hooks/useMultiplexSocket';
import { useTranslation } from '../lib/i18n';
import { loadMarketplaceApps } from '../widgets/marketplaceRegistry';
import { APP_AUTO_INSTALLED_TOPIC, type AppAutoInstalledFrame } from '../api/store';

// The only announcement that software appeared without being asked for, so it
// outlasts the toast default.
const AUTO_INSTALL_TOAST_MS = 15000;

// Mounted at the layout root so the toast surfaces regardless of the open view.
// Reloading the registry is what makes the new app resolvable, since nothing
// else rescans until the stale timer fires.
export function AppAutoInstalledToasts() {
  const { t } = useTranslation();
  const { push } = useToast();

  const handleFrame = useCallback((raw: unknown) => {
    const frame = raw as AppAutoInstalledFrame | null;
    if (!frame || !frame.appId) return;
    const name = typeof frame.appName === 'string' && frame.appName !== '' ? frame.appName : frame.appId;
    void loadMarketplaceApps();
    push({
      title: t('store.autoInstalledTitle', { name }),
      body: frame.placed ? t('store.autoInstalledBodyPlaced', { name }) : t('store.autoInstalledBody', { name }),
      durationMs: AUTO_INSTALL_TOAST_MS,
    });
  }, [push, t]);

  useTopicCallback(APP_AUTO_INSTALLED_TOPIC, true, handleFrame);

  return null;
}
