import { useEffect, useRef, useState } from 'react';
import type { SensorUniform } from '../lib/sensorBinding';
import { fetchShaderSource, onShaderSourceInvalidated, peekShaderSource, type ShaderParamSpec, type ShaderSource } from '../api/lighting';

export interface ShaderParamSpecs {
  /** Parsed hint_range specs for the effect's composed shader, keyed by uniform name. */
  specs: Record<string, ShaderParamSpec>;
  /** The shader's sensor-fed uniforms with the author's default bindings. */
  sensors: SensorUniform[];
  /** False only while the source is still being fetched for the first time. */
  loaded: boolean;
}

const EMPTY: ShaderParamSpecs = { specs: {}, sensors: [], loaded: false };

function fromSource(src: ShaderSource | null | undefined): ShaderParamSpecs {
  if (!src) return EMPTY;
  const specs: Record<string, ShaderParamSpec> = {};
  for (const p of src.params) specs[p.name] = p;
  return { specs, sensors: src.sensors, loaded: true };
}

/**
 * Param specs for one effect, parsed from its composed shader's hint_range
 * annotations. Backs every slider range in EffectControls/LightingSection so
 * neither carries its own copy of the shader's min/max/step/default. A
 * cached source resolves synchronously so switching between already-seen
 * effects never unmounts the slider stack for a tick.
 */
export function useShaderParams(effectKey: string | null): ShaderParamSpecs {
  const [state, setState] = useState<ShaderParamSpecs>(() => fromSource(effectKey ? peekShaderSource(effectKey) : null));

  // Bumped when the effect's source is replaced, so a saved custom effect's new ranges load.
  const [sourceRev, setSourceRev] = useState(0);
  const refetchingRef = useRef<string | null>(null);
  useEffect(() => onShaderSourceInvalidated(name => {
    if (name !== effectKey) return;
    refetchingRef.current = name;
    setSourceRev(r => r + 1);
  }), [effectKey]);

  useEffect(() => {
    // A refetch of this same key keeps its current sliders until the new specs land.
    const refetching = !!effectKey && refetchingRef.current === effectKey;
    refetchingRef.current = null;
    if (!effectKey) { setState(EMPTY); return; }
    const cached = peekShaderSource(effectKey);
    if (cached) { setState(fromSource(cached)); return; }
    let cancelled = false;
    if (!refetching) setState(EMPTY);
    fetchShaderSource(effectKey).then(src => {
      if (!cancelled) setState(fromSource(src));
    });
    return () => { cancelled = true; };
  }, [effectKey, sourceRev]);

  return state;
}
