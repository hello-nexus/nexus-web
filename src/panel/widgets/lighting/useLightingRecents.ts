import { useCallback, useRef } from 'react';
import { useUiSettings } from '../../../hooks/useUiSettings';
import { pushRecent } from './recents';

const NONE: readonly string[] = [];

export function useLightingRecents() {
  const { settings, update } = useUiSettings();
  const colors = settings.recentStaticColors ?? NONE;
  const animations = settings.recentAnimations ?? NONE;
  // The record callbacks read the latest lists through refs so their identity stays stable for memoized callers.
  const colorsRef = useRef(colors);
  const animationsRef = useRef(animations);
  colorsRef.current = colors;
  animationsRef.current = animations;
  const recordColor = useCallback((hex: string) => {
    colorsRef.current = pushRecent(colorsRef.current, hex);
    update({ recentStaticColors: colorsRef.current });
  }, [update]);
  const recordAnimation = useCallback((key: string) => {
    animationsRef.current = pushRecent(animationsRef.current, key);
    update({ recentAnimations: animationsRef.current });
  }, [update]);
  return { colors, animations, recordColor, recordAnimation };
}
