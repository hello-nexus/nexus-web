import { useCallback, useEffect, useState } from 'react';

interface NativeSettingsWindow extends Window {
  nexusNative?: {
    openSettings?: () => void;
    haptic?: (style?: string) => void;
  };
  webkit?: {
    messageHandlers?: {
      nexusNativeSettings?: {
        postMessage?: (message: string) => void;
      };
      nexusNativeHaptics?: {
        postMessage?: (message: string) => void;
      };
    };
  };
}

export function hasNativeSettingsBridge() {
  const nativeWindow = window as NativeSettingsWindow;
  return typeof nativeWindow.nexusNative?.openSettings === 'function'
    || typeof nativeWindow.webkit?.messageHandlers?.nexusNativeSettings?.postMessage === 'function';
}

// True only when running inside the native iOS app wrapper, which injects
// `window.nexusNative` (and the `nexusNative*` webkit message handlers) at
// document start. In a plain browser none of these exist, so native-only
// affordances (e.g. the pairing dialog) can be hidden by gating on this.
export function isNativeApp() {
  const nativeWindow = window as NativeSettingsWindow;
  return typeof nativeWindow.nexusNative?.openSettings === 'function'
    || typeof nativeWindow.nexusNative?.haptic === 'function'
    || typeof nativeWindow.webkit?.messageHandlers?.nexusNativeSettings?.postMessage === 'function'
    || typeof nativeWindow.webkit?.messageHandlers?.nexusNativeHaptics?.postMessage === 'function';
}

export function useNativeSettingsBridge(enabled: boolean) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const update = () => setAvailable(hasNativeSettingsBridge());
    update();
    window.addEventListener('nexus:native-ready', update);
    return () => window.removeEventListener('nexus:native-ready', update);
  }, [enabled]);

  const open = useCallback(() => {
    const nativeWindow = window as NativeSettingsWindow;
    if (typeof nativeWindow.nexusNative?.openSettings === 'function') {
      nativeWindow.nexusNative.openSettings();
      return;
    }
    nativeWindow.webkit?.messageHandlers?.nexusNativeSettings?.postMessage?.('open');
  }, []);

  return { available: enabled && available, open };
}
