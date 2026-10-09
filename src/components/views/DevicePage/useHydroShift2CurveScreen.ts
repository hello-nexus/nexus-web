import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getHydroShift2CurveSettings,
  setHydroShift2CurveSettings,
  type HydroShift2CurveSettings,
  type HydroShift2CurveSettingsPatch,
} from '../../../api/hydroshift2Curve';

const SETTINGS_POLL_MS = 5000;

export interface HydroShift2CurveScreen {
  settings: HydroShift2CurveSettings | null;
  write: (patch: HydroShift2CurveSettingsPatch) => Promise<void>;
  previewBrightness: (value: number) => void;
  commitBrightness: (value: number) => void;
  refresh: () => Promise<void>;
  /** The clip on the glass: a running screen saver, else the selected video in video mode. */
  playingClip: string | null;
}

/** Polled Curve screen settings shared by the settings tab and the preview; idle when disabled. */
export function useHydroShift2CurveScreen(enabled: boolean): HydroShift2CurveScreen {
  const [settings, setSettings] = useState<HydroShift2CurveSettings | null>(null);
  const aliveRef = useRef(true);
  // A poll issued before the latest write finished may carry the old value.
  const writesInFlightRef = useRef(0);
  const writeGenRef = useRef(0);
  const brightnessDirtyRef = useRef(false);
  const serverBrightnessRef = useRef<number | null>(null);
  const brightnessInFlightRef = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    const gen = writeGenRef.current;
    const s = await getHydroShift2CurveSettings();
    if (!aliveRef.current || !s) return;
    if (writesInFlightRef.current > 0 || gen !== writeGenRef.current) return;
    serverBrightnessRef.current = s.screenSaverBrightness;
    setSettings(prev => (prev && brightnessDirtyRef.current
      ? { ...s, screenSaverBrightness: prev.screenSaverBrightness }
      : s));
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    aliveRef.current = true;
    void refresh();
    const id = window.setInterval(() => { if (!document.hidden) void refresh(); }, SETTINGS_POLL_MS);
    return () => {
      aliveRef.current = false;
      window.clearInterval(id);
    };
  }, [enabled, refresh]);

  const write = useCallback(async (patch: HydroShift2CurveSettingsPatch) => {
    setSettings(prev => (prev ? { ...prev, ...patch } : prev));
    writesInFlightRef.current += 1;
    try {
      await setHydroShift2CurveSettings(patch);
    } finally {
      writesInFlightRef.current -= 1;
      writeGenRef.current += 1;
    }
    await refresh();
  }, [refresh]);

  const previewBrightness = useCallback((value: number) => {
    brightnessDirtyRef.current = true;
    setSettings(prev => (prev ? { ...prev, screenSaverBrightness: value } : prev));
  }, []);

  const commitBrightness = useCallback((value: number) => {
    brightnessDirtyRef.current = false;
    if ((brightnessInFlightRef.current ?? serverBrightnessRef.current) === value) return;
    brightnessInFlightRef.current = value;
    void write({ screenSaverBrightness: value }).finally(() => {
      if (brightnessInFlightRef.current === value) brightnessInFlightRef.current = null;
    });
  }, [write]);

  const playingClip = settings?.connected
    ? (settings.playing ?? (settings.screenMode === 'video' ? settings.video ?? null : null))
    : null;

  return { settings, write, previewBrightness, commitBrightness, refresh, playingClip };
}
