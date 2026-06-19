import { useCallback, useEffect, useRef, useState } from 'react';

interface NativeSettingsWindow extends Window {
  nexusNative?: {
    openSettings?: () => void;
    haptic?: (style?: string) => void;
    transferFiles?: () => void;
    sendClipboard?: () => void;
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

// Fire a device haptic tick: the iOS app bridge first, then the web Vibration
// API (Android). No-op on desktop / browsers without either.
export function triggerHaptic(style: 'light' | 'medium' | 'heavy' = 'medium', fallbackMs = 10) {
  const nativeWindow = window as NativeSettingsWindow;
  if (typeof nativeWindow.nexusNative?.haptic === 'function') {
    nativeWindow.nexusNative.haptic(style);
    return;
  }
  if (typeof nativeWindow.webkit?.messageHandlers?.nexusNativeHaptics?.postMessage === 'function') {
    nativeWindow.webkit.messageHandlers.nexusNativeHaptics.postMessage(style);
    return;
  }
  navigator.vibrate?.(fallbackMs);
}

// Progress events the native app dispatches on window while it picks/uploads
// on the panel's behalf.
export const NATIVE_TRANSFER_STATE_EVENT = 'nexus:transfer-state';

export interface NativeTransferState {
  phase: 'picking' | 'uploading' | 'done' | 'error' | 'cancelled';
  kind: 'file' | 'clipboard';
  count?: number;
  message?: string;
}

export function hasNativeTransferBridge() {
  return typeof (window as NativeSettingsWindow).nexusNative?.transferFiles === 'function';
}

export function hasNativeClipboardBridge() {
  return typeof (window as NativeSettingsWindow).nexusNative?.sendClipboard === 'function';
}

// Native transfer bridge: the app opens its own picker / reads the phone
// clipboard and uploads natively; progress arrives via
// NATIVE_TRANSFER_STATE_EVENT CustomEvents handed to `onState`. Availability
// is per method - an older shell may inject transferFiles without
// sendClipboard.
export function useNativeTransferBridge(
  enabled: boolean,
  onState?: (state: NativeTransferState) => void,
) {
  const [canFiles, setCanFiles] = useState(false);
  const [canClipboard, setCanClipboard] = useState(false);
  const onStateRef = useRef(onState);
  useEffect(() => { onStateRef.current = onState; }, [onState]);

  useEffect(() => {
    if (!enabled) return;

    const update = () => {
      setCanFiles(hasNativeTransferBridge());
      setCanClipboard(hasNativeClipboardBridge());
    };
    update();
    const handleState = (e: Event) => {
      const detail = (e as CustomEvent<NativeTransferState>).detail;
      if (detail && typeof detail.phase === 'string') onStateRef.current?.(detail);
    };
    window.addEventListener('nexus:native-ready', update);
    window.addEventListener(NATIVE_TRANSFER_STATE_EVENT, handleState);
    return () => {
      window.removeEventListener('nexus:native-ready', update);
      window.removeEventListener(NATIVE_TRANSFER_STATE_EVENT, handleState);
    };
  }, [enabled]);

  const transferFiles = useCallback(() => {
    (window as NativeSettingsWindow).nexusNative?.transferFiles?.();
  }, []);

  const sendClipboard = useCallback(() => {
    (window as NativeSettingsWindow).nexusNative?.sendClipboard?.();
  }, []);

  return {
    canTransferFiles: enabled && canFiles,
    canSendClipboard: enabled && canClipboard,
    transferFiles,
    sendClipboard,
  };
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
