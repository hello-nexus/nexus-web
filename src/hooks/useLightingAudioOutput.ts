import { useCallback, useEffect, useRef, useState } from 'react';
import type { SelectOption } from '../components/common/Select/Select';
import { fetchAudioOutput, setAudioOutput, type AudioOutputPick } from '../api/lighting';
import { useTranslation } from '../lib/i18n';
import { useAudioDevices } from './useAudioDevices';

export interface LightingAudioOutput {
  /** Selected device id; empty follows the system default. */
  value: string;
  options: SelectOption[];
  select: (deviceId: string) => void;
}

/** The output audio-reactive lighting listens to (Windows capture only). */
export function useLightingAudioOutput(enabled: boolean): LightingAudioOutput {
  const { t } = useTranslation();
  const { outputs, activeOutput } = useAudioDevices(enabled);
  const [pick, setPick] = useState<AudioOutputPick>({ deviceId: '', deviceName: '' });
  // A pick made before the first read lands must not be overwritten by it.
  const pickedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    pickedRef.current = false;
    let cancelled = false;
    fetchAudioOutput()
      .then(r => {
        if (cancelled || !r || pickedRef.current) return;
        setPick({ deviceId: r.deviceId ?? '', deviceName: r.deviceName ?? '' });
      })
      .catch(() => { /* keep the default */ });
    return () => { cancelled = true; };
  }, [enabled]);

  const select = useCallback((deviceId: string) => {
    const prev = pick;
    const next = { deviceId, deviceName: outputs.find(d => d.id === deviceId)?.name ?? '' };
    pickedRef.current = true;
    setPick(next);
    // postService resolves null on a failed write rather than rejecting.
    setAudioOutput(next).then(r => { if (!r) setPick(prev); }, () => setPick(prev));
  }, [pick, outputs]);

  const defaultName = activeOutput?.name ?? '';
  const options: SelectOption[] = [
    {
      value: '',
      label: defaultName
        ? t('lighting.audioOutput.systemDefaultNamed', { name: defaultName })
        : t('lighting.audioOutput.systemDefault'),
    },
    ...(outputs.length > 0 ? [{ value: '__sep__', label: '', divider: true }] : []),
    ...outputs.map(d => ({ value: d.id, label: d.name })),
  ];
  // Capture falls back to the default while the pick is unplugged, so it must
  // not read as live. An empty list is still loading, not everything unplugged.
  if (pick.deviceId && !outputs.some(d => d.id === pick.deviceId)) {
    const name = pick.deviceName || pick.deviceId;
    options.push({
      value: pick.deviceId,
      label: outputs.length > 0 ? t('lighting.audioOutput.disconnected', { name }) : name,
    });
  }

  return { value: pick.deviceId, options, select };
}
