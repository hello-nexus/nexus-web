import { useCallback, useEffect, useRef, useState } from 'react';
import type { SelectOption } from '../components/common/Select/Select';
import { fetchAudioOutput, setAudioOutput, type AudioOutputPick } from '../api/lighting';
import { useTranslation } from '../lib/i18n';
import { useAudioDevices } from './useAudioDevices';
import { useTopicCallback } from './useMultiplexSocket';

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
  // Bumped on every local pick; a read started before it returns an older value.
  const writeSeq = useRef(0);
  const pendingWrites = useRef(0);

  const load = useCallback(() => {
    const seq = writeSeq.current;
    fetchAudioOutput()
      .then(r => {
        if (!r || seq !== writeSeq.current || pendingWrites.current > 0) return;
        setPick({ deviceId: r.deviceId ?? '', deviceName: r.deviceName ?? '' });
      })
      .catch(() => { /* keep the current pick */ });
  }, []);

  useEffect(() => { if (enabled) load(); }, [enabled, load]);
  // The service bumps the lighting topic on every pick, so Settings, the
  // lighting canvas and other clients all follow a change made elsewhere.
  useTopicCallback('lighting', enabled, load);

  const select = useCallback((deviceId: string) => {
    const prev = pick;
    const next = { deviceId, deviceName: outputs.find(d => d.id === deviceId)?.name ?? '' };
    writeSeq.current += 1;
    pendingWrites.current += 1;
    setPick(next);
    // postService resolves null on a failed write rather than rejecting.
    setAudioOutput(next)
      .then(r => { if (!r) setPick(prev); }, () => setPick(prev))
      .finally(() => {
        pendingWrites.current -= 1;
        // Reads dropped while writing may have carried a newer remote pick.
        if (pendingWrites.current === 0) load();
      });
  }, [pick, outputs, load]);

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
