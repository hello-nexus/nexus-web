export const PANEL_DEVICE_ID_KEY = 'nexus_panel_device_id';
export const PHONE_PANEL_PWA_KEY = 'nexus_phone_panel_pwa';
export const RESERVED_PANEL_PATH_SEGMENTS = new Set(['phone', 'q60', 'devices']);

export function shouldForcePhonePanelRoute() {
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  if (!standalone) return false;
  if (window.location.pathname.startsWith('/panel')) return false;
  return localStorage.getItem(PHONE_PANEL_PWA_KEY) === '1';
}
