import { useCallback, useEffect, useRef, useState } from 'react';

export interface NativePushStatus {
  platform: 'ios' | 'android';
  permission: 'granted' | 'denied' | 'prompt';
  // APNs token as lowercase hex, or the FCM registration token.
  token: string | null;
  environment: 'sandbox' | 'production';
}

// Dispatched by the wrapper on request and whenever the push token changes.
export const NATIVE_PUSH_STATUS_EVENT = 'nexus:push-status';

interface NativeSettingsWindow extends Window {
  nexusNative?: {
    openSettings?: () => void;
    haptic?: (style?: string) => void;
    transferFiles?: () => void;
    sendClipboard?: () => void;
    findComputer?: () => void;
    pushStatus?: () => void;
    requestPushPermission?: () => void;
  };
  nexusNativePush?: NativePushStatus;
  webkit?: {
    messageHandlers?: {
      nexusNativeSettings?: {
        postMessage?: (message: string) => void;
      };
      nexusNativeHaptics?: {
        postMessage?: (message: string) => void;
      };
      nexusNativeFindComputer?: {
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

// The native wrapper can return the user to its "Find your computer" page
// (LAN discovery + pair, keeping the current pairing). Present only inside the
// app; a plain browser has no such surface, so the panel gate hides the
// affordance when this is absent.
export function hasNativeFindComputerBridge() {
  const nativeWindow = window as NativeSettingsWindow;
  return typeof nativeWindow.nexusNative?.findComputer === 'function'
    || typeof nativeWindow.webkit?.messageHandlers?.nexusNativeFindComputer?.postMessage === 'function';
}

// Ask the native wrapper to open its "Find your computer" page. No-op outside
// the app.
export function openFindComputer() {
  const nativeWindow = window as NativeSettingsWindow;
  if (typeof nativeWindow.nexusNative?.findComputer === 'function') {
    nativeWindow.nexusNative.findComputer();
    return;
  }
  nativeWindow.webkit?.messageHandlers?.nexusNativeFindComputer?.postMessage?.('open');
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

export function hasNativePushBridge() {
  const nexusNative = (window as NativeSettingsWindow).nexusNative;
  return typeof nexusNative?.pushStatus === 'function'
    && typeof nexusNative?.requestPushPermission === 'function';
}

// Push alert state from the app wrapper. `available` is false in a plain
// browser, where the panel shows no alert controls.
export function useNativePush(enabled: boolean) {
  const [available, setAvailable] = useState(false);
  const [status, setStatus] = useState<NativePushStatus | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const nativeWindow = window as NativeSettingsWindow;
    const refresh = () => {
      const present = hasNativePushBridge();
      setAvailable(present);
      if (!present) return;
      if (nativeWindow.nexusNativePush) setStatus(nativeWindow.nexusNativePush);
      nativeWindow.nexusNative?.pushStatus?.();
    };
    const handleStatus = (e: Event) => {
      const detail = (e as CustomEvent<NativePushStatus>).detail;
      if (detail && typeof detail.permission === 'string') setStatus(detail);
    };
    refresh();
    window.addEventListener('nexus:native-ready', refresh);
    window.addEventListener(NATIVE_PUSH_STATUS_EVENT, handleStatus);
    return () => {
      window.removeEventListener('nexus:native-ready', refresh);
      window.removeEventListener(NATIVE_PUSH_STATUS_EVENT, handleStatus);
    };
  }, [enabled]);

  const requestPermission = useCallback(() => {
    (window as NativeSettingsWindow).nexusNative?.requestPushPermission?.();
  }, []);

  return { available: enabled && available, status, requestPermission };
}
