import { useContext, useEffect, useRef } from 'react';
import { MultiplexContext } from './useMultiplexSocket';

export interface AudioSnapshot {
  level: number;
  bass: number;
  mid: number;
  high: number;
  beat: number;
  spectrum: number[];
}

export function useAudioState(enabled: boolean): React.RefObject<AudioSnapshot | null> {
  const ctx = useContext(MultiplexContext);
  const ref = useRef<AudioSnapshot | null>(null);

  useEffect(() => {
    if (!ctx || !enabled) { ref.current = null; return; }
    const listener = (raw: unknown) => { ref.current = raw as AudioSnapshot; };
    ctx.subscribe('audio', listener);
    return () => { ctx.unsubscribe('audio', listener); ref.current = null; };
  }, [ctx, enabled]);

  return ref;
}
