import { useCallback, useEffect, useRef, useState } from 'react';
import type { SelectOption } from '../components/common/Select/Select';
import { fetchAudioOutput, setAudioOutput, type AudioOutputPick } from '../api/lighting';
import { useTranslation } from '../lib/i18n';
import { useAudioDevices } from './useAudioDevices';
import { useTopicCallback } from './useMultiplexSocket';

type Direction = 'output' | 'input';

// Option values carry the direction so an output and an input never collide.
const encode = (direction: Direction, deviceId: string) => `${direction}:${deviceId}`;
const decode = (value: string): { direction: Direction; deviceId: string } => {
  const cut = value.indexOf(':');
  return { direction: value.slice(0, cut) === 'input' ? 'input' : 'output', deviceId: value.slice(cut + 1) };
};

export interface LightingAudioOutput {
  /** Selected option value: direction and device id; an empty id follows that direction's system default. */
  value: string;
  options: SelectOption[];
  select: (value: string) => void;
}

/** The output or input device audio-reactive lighting listens to (Windows capture only). */
export function useLightingAudioOutput(enabled: boolean): LightingAudioOutput {
  const { t } = useTranslation();
  const { outputs, inputs, activeOutput, activeInput } = useAudioDevices(enabled);
  const [pick, setPick] = useState<AudioOutputPick>({ deviceId: '', deviceName: '', direction: 'output' });
  // Bumped on every local pick; a read started before it returns an older value.
  const writeSeq = useRef(0);
  const pendingWrites = useRef(0);

  const load = useCallback(() => {
    const seq = writeSeq.current;
    fetchAudioOutput()
      .then(r => {
        if (!r || seq !== writeSeq.current || pendingWrites.current > 0) return;
        setPick({ deviceId: r.deviceId ?? '', deviceName: r.deviceName ?? '', direction: r.direction === 'input' ? 'input' : 'output' });
      })
      .catch(() => { /* keep the current pick */ });
  }, []);

  useEffect(() => { if (enabled) load(); }, [enabled, load]);
  // The service bumps the lighting topic on every pick, so Settings, the
  // lighting canvas and other clients all follow a change made elsewhere.
  useTopicCallback('lighting', enabled, load);

  const select = useCallback((value: string) => {
    const prev = pick;
    const { direction, deviceId } = decode(value);
    const list = direction === 'input' ? inputs : outputs;
    const next: AudioOutputPick = { deviceId, deviceName: list.find(d => d.id === deviceId)?.name ?? '', direction };
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
  }, [pick, inputs, outputs, load]);

  const pickDirection: Direction = pick.direction === 'input' ? 'input' : 'output';
  const group = (direction: Direction): SelectOption[] => {
    const isInput = direction === 'input';
    const list = isInput ? inputs : outputs;
    const defaultName = (isInput ? activeInput : activeOutput)?.name ?? '';
    const defaultKey = isInput ? 'lighting.audioOutput.defaultInput' : 'lighting.audioOutput.systemDefault';
    const defaultNamedKey = isInput ? 'lighting.audioOutput.defaultInputNamed' : 'lighting.audioOutput.systemDefaultNamed';
    const out: SelectOption[] = [
      { value: encode(direction, ''), label: defaultName ? t(defaultNamedKey, { name: defaultName }) : t(defaultKey) },
      ...list.map(d => ({ value: encode(direction, d.id), label: d.name })),
    ];
    // Capture falls back to the default while the pick is unplugged, so it must
    // not read as live. An empty list is still loading, not everything unplugged.
    if (pickDirection === direction && pick.deviceId && !list.some(d => d.id === pick.deviceId)) {
      const name = pick.deviceName || pick.deviceId;
      out.push({
        value: encode(direction, pick.deviceId),
        label: list.length > 0 ? t('lighting.audioOutput.disconnected', { name }) : name,
      });
    }
    return out;
  };
  const options: SelectOption[] = [
    { value: '', label: t('panel.widget.mixer.output'), header: true },
    ...group('output'),
    { value: '', label: t('panel.widget.mixer.input'), header: true },
    ...group('input'),
  ];

  return { value: encode(pickDirection, pick.deviceId), options, select };
}
