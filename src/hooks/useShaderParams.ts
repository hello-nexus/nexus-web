import { useEffect, useState } from 'react';
import { fetchShaderSource, peekShaderSource, type ShaderParamSpec, type ShaderSource } from '../api/lighting';

export interface ShaderParamSpecs {
  /** Parsed hint_range specs for the effect's composed shader, keyed by uniform name. */
  specs: Record<string, ShaderParamSpec>;
  /** False only while the source is still being fetched for the first time. */
  loaded: boolean;
}

const EMPTY: ShaderParamSpecs = { specs: {}, loaded: false };

function fromSource(src: ShaderSource | null | undefined): ShaderParamSpecs {
  if (!src) return EMPTY;
  const specs: Record<string, ShaderParamSpec> = {};
  for (const p of src.params) specs[p.name] = p;
  return { specs, loaded: true };
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

  useEffect(() => {
    if (!effectKey) { setState(EMPTY); return; }
    const cached = peekShaderSource(effectKey);
    if (cached) { setState(fromSource(cached)); return; }
    let cancelled = false;
    setState(EMPTY);
    fetchShaderSource(effectKey).then(src => {
      if (!cancelled) setState(fromSource(src));
    });
    return () => { cancelled = true; };
  }, [effectKey]);

  return state;
}
