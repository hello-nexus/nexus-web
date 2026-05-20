import { useCallback, useEffect, useState } from 'react';

interface NativeSettingsWindow extends Window {
  qosNative?: {
    openSettings?: () => void;
  };
  webkit?: {
    messageHandlers?: {
      qosNativeSettings?: {
        postMessage?: (message: string) => void;
      };
    };
  };
}

export function hasNativeSettingsBridge() {
  const nativeWindow = window as NativeSettingsWindow;
  return typeof nativeWindow.qosNative?.openSettings === 'function'
    || typeof nativeWindow.webkit?.messageHandlers?.qosNativeSettings?.postMessage === 'function';
}

export function useNativeSettingsBridge(enabled: boolean) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const update = () => setAvailable(hasNativeSettingsBridge());
    update();
    window.addEventListener('qos:native-ready', update);
    return () => window.removeEventListener('qos:native-ready', update);
  }, [enabled]);

  const open = useCallback(() => {
    const nativeWindow = window as NativeSettingsWindow;
    if (typeof nativeWindow.qosNative?.openSettings === 'function') {
      nativeWindow.qosNative.openSettings();
      return;
    }
    nativeWindow.webkit?.messageHandlers?.qosNativeSettings?.postMessage?.('open');
  }, []);

  return { available: enabled && available, open };
}
