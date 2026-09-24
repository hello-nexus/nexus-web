import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchAudioDevices,
  setDefaultInput,
  setDefaultOutput,
  setSpatialSound,
  type AudioDevice,
  type AudioSpatialState,
} from '../api/mixer';

// The default endpoint can move without us (Windows' own flyout, a deck key, a
// headset powering on), so the header polls rather than trusting its own writes.
const REFRESH_MS = 5000;

export interface AudioDeviceController {
  outputs: AudioDevice[];
  inputs: AudioDevice[];
  activeOutput: AudioDevice | null;
  activeInput: AudioDevice | null;
  /** Null until the list arrives, and on a service without the switch. */
  spatial: AudioSpatialState | null;
  selectOutput: (deviceId: string) => void;
  selectInput: (deviceId: string) => void;
  /** Empty turns spatial sound off. */
  selectSpatial: (formatId: string) => void;
  refresh: () => void;
}

export function useAudioDevices(enabled: boolean): AudioDeviceController {
  const [outputs, setOutputs] = useState<AudioDevice[]>([]);
  const [inputs, setInputs] = useState<AudioDevice[]>([]);
  const [spatial, setSpatial] = useState<AudioSpatialState | null>(null);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const list = await fetchAudioDevices();
    if (!list || !mounted.current) return;
    setOutputs(list.outputs ?? []);
    setInputs(list.inputs ?? []);
    setSpatial(list.spatial?.supported ? list.spatial : null);
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) return () => { mounted.current = false; };
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [enabled, refresh]);

  // Mark the pick locally so the row reads as selected immediately, then
  // re-read once the POST resolves - the service returns after the endpoint
  // switch, so that is the real signal, not a timer.
  const selectOutput = useCallback((deviceId: string) => {
    setOutputs(prev => prev.map(d => ({ ...d, isDefault: d.id === deviceId })));
    void setDefaultOutput(deviceId).then(() => refresh());
  }, [refresh]);

  const selectInput = useCallback((deviceId: string) => {
    setInputs(prev => prev.map(d => ({ ...d, isDefault: d.id === deviceId })));
    void setDefaultInput(deviceId).then(() => refresh());
  }, [refresh]);

  // Mark it, then let the re-read settle it: the service only answers ok once
  // audiosrv reports the switch, so a refused pick snaps back on that refresh.
  // The target is whichever output is marked default right now, which after a
  // selectOutput is the new one before its own re-read lands.
  const selectSpatial = useCallback((formatId: string) => {
    setSpatial(prev => (prev ? { ...prev, activeId: formatId } : prev));
    const deviceId = outputs.find(d => d.isDefault)?.id ?? spatial?.deviceId ?? '';
    void setSpatialSound(deviceId, formatId).then(() => refresh());
  }, [refresh, outputs, spatial?.deviceId]);

  // Stable identity: callers hand this to useAudioMixer as its config-changed
  // callback, and a new function every render would churn that subscription.
  const refreshNow = useCallback(() => { void refresh(); }, [refresh]);

  return {
    outputs,
    inputs,
    activeOutput: outputs.find(d => d.isDefault) ?? null,
    activeInput: inputs.find(d => d.isDefault) ?? null,
    spatial,
    selectOutput,
    selectInput,
    selectSpatial,
    refresh: refreshNow,
  };
}
