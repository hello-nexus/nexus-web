import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LightingWidget } from './LightingWidget';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import { EffectControls } from '../../../components/views/lighting/EffectControls';
import {
  fetchAnimateSettings,
  fetchCurrentSync,
  saveAnimateTemplates,
  startAnimate,
} from '../../../api/lighting';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import {
  EFFECTS,
  defaultStateFor,
  type EffectState,
  type EffectTemplateBundle,
} from '../../../types/lighting';
import { buildAllDefaultTemplates, mergeTemplates } from '../../../types/lightingTemplates';
import type { WidgetProps } from '../types';
import styles from './LightingImmersive.module.scss';

/**
 * Fullscreen lighting controller. Two stacked sections, each meant to
 * read as a 4x2 cell of the immersive 4x4 grid:
 *
 *  Top:    the existing 4x4 LightingWidget content (mode picker,
 *          effect carousel, templates) - same UI as the tile, just
 *          larger.
 *  Bottom: the desktop animate effect controls (palette ring + speed
 *          / saturation / contrast / intensity / per-effect-param
 *          sliders + reset). Hidden when the active mode isn't
 *          'animate' since the controls only apply to the animate
 *          mode.
 *
 * Each section owns its own state subscription to /lighting/animate/*.
 * The multiplex 'lighting' topic broadcasts on every mutation so the
 * two sections stay in sync without sharing local state.
 */
export function LightingImmersive({ widget, surface, immersiveGrid }: WidgetProps) {
  const fullsizeWidget = useMemo(() => ({ ...widget, size: '4x4' as const }), [widget]);
  const controls = useImmersiveAnimateState();

  const cells = [
    <LightingWidget widget={fullsizeWidget} surface={surface} />,
  ];
  if (controls) {
    cells.push(
      <div className={styles.controlsCell} data-panel-scrollable="true">
        <EffectControls
          effect={controls.effect}
          state={controls.state}
          bundle={controls.bundle}
          canReset={controls.canReset}
          onTemplateSelect={controls.onTemplateSelect}
          onChange={controls.onChange}
          onCommit={controls.onCommit}
          onReset={controls.onReset}
        />
      </div>,
    );
  }

  return (
    <ImmersiveLayout
      cells={cells}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
    />
  );
}

interface ImmersiveControlsState {
  effect: string;
  state: EffectState;
  bundle: EffectTemplateBundle;
  canReset: boolean;
  onTemplateSelect: (idx: number) => void;
  onChange: (patch: Partial<EffectState>, commit?: boolean) => void;
  onCommit: () => void;
  onReset: () => void;
}

function useImmersiveAnimateState(): ImmersiveControlsState | null {
  const [active, setActive] = useState<string>('rainbow');
  const [templates, setTemplates] = useState<Record<string, EffectTemplateBundle>>(buildAllDefaultTemplates);
  const [mode, setMode] = useState<string>('none');
  const stagedRef = useRef<EffectState | null>(null);
  const [, force] = useState(0);

  const hydrate = useCallback(async () => {
    const [sync, animate] = await Promise.all([
      fetchCurrentSync(),
      fetchAnimateSettings(),
    ]);
    const next = buildAllDefaultTemplates();
    if (animate?.templates) {
      for (const e of EFFECTS) {
        next[e.key] = mergeTemplates(e.key, animate.templates[e.key]);
      }
    }
    setTemplates(next);
    const rawSync = sync?.sync || 'none';
    setMode(rawSync === 'static' ? 'static' : (rawSync === 'screen' ? 'screen' : (rawSync === 'media' ? 'gif' : (rawSync === 'none' ? 'none' : 'animate'))));
    if (EFFECTS.some(e => e.key === rawSync)) setActive(rawSync);
    else if (animate?.effect) setActive(animate.effect);
  }, []);

  useEffect(() => { hydrate(); }, [hydrate]);
  useTopicCallback('lighting', true, hydrate);

  const bundle = templates[active];
  const baseState = bundle?.slots[bundle.selected] ?? defaultStateFor(active);
  const liveState = stagedRef.current ?? baseState;

  const onChange = useCallback((patch: Partial<EffectState>, commit?: boolean) => {
    const next = { ...(stagedRef.current ?? baseState), ...patch };
    stagedRef.current = next;
    force(n => n + 1);
    if (commit) {
      void startAnimate(active, next.speed, next.intensity, next.hue, next.colorize, next.saturation, next.contrast, next.params, true);
    }
  }, [active, baseState]);

  const onCommit = useCallback(() => {
    const s = stagedRef.current;
    if (!s) return;
    void startAnimate(active, s.speed, s.intensity, s.hue, s.colorize, s.saturation, s.contrast, s.params, true);
    // Persist into the active template slot so the change round-trips.
    if (bundle) {
      const slots = bundle.slots.slice();
      slots[bundle.selected] = s;
      const nextBundle: EffectTemplateBundle = { ...bundle, slots };
      const nextTemplates = { ...templates, [active]: nextBundle };
      setTemplates(nextTemplates);
      void saveAnimateTemplates(nextTemplates);
    }
  }, [active, bundle, templates]);

  const onTemplateSelect = useCallback((idx: number) => {
    if (!bundle) return;
    const clamped = Math.min(Math.max(idx, 0), bundle.slots.length - 1);
    const nextBundle: EffectTemplateBundle = { ...bundle, selected: clamped };
    const nextTemplates = { ...templates, [active]: nextBundle };
    setTemplates(nextTemplates);
    stagedRef.current = null;
    void saveAnimateTemplates(nextTemplates);
    const next = nextBundle.slots[clamped];
    if (next) {
      void startAnimate(active, next.speed, next.intensity, next.hue, next.colorize, next.saturation, next.contrast, next.params, true);
    }
  }, [active, bundle, templates]);

  const onReset = useCallback(() => {
    stagedRef.current = null;
    force(n => n + 1);
    if (bundle) {
      const slot = bundle.slots[bundle.selected] ?? defaultStateFor(active);
      void startAnimate(active, slot.speed, slot.intensity, slot.hue, slot.colorize, slot.saturation, slot.contrast, slot.params, true);
    }
  }, [active, bundle]);

  if (mode !== 'animate' || !bundle) return null;

  return {
    effect: active,
    state: liveState,
    bundle,
    canReset: stagedRef.current !== null,
    onTemplateSelect,
    onChange,
    onCommit,
    onReset,
  };
}
