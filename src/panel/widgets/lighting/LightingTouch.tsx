import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LightingWidget } from './LightingWidget';
import { ScreenControls } from './page/ModeControls';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import { EffectEditor } from './effecteditor/EffectEditor';
import { EffectControls } from './page/EffectControls';
import { AnimateGrid } from './page/AnimateGrid';
import { MediaList } from './effecteditor/MediaList';
import { PostProcessControls } from './effecteditor/PostProcessControls';
import type { PostProcessState } from './effecteditor/types';
import {
  fetchAnimateSettings,
  fetchCurrentSync,
  fetchMediaEffect,
  fetchScreenEffect,
  saveAnimateTemplates,
  setMediaEffect,
  setScreenEffect,
  startAnimate,
} from '../../../api/lighting';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import {
  EFFECTS,
  defaultStateFor,
  type EffectState,
  type EffectTemplateBundle,
  type LightingMode,
} from '../../../types/lighting';
import { buildAllDefaultTemplates, mergeTemplates, slotThumbSignature } from '../../../types/lightingTemplates';
import type { WidgetProps } from '../types';

const DEFAULT_PP: PostProcessState = { hue: 0, colorize: 0, saturation: 1, contrast: 1 };

/**
 * Fullscreen lighting controller. Two stacked cells:
 *  - Cell 1: the immersive LightingWidget — square mode buttons (off / animate
 *    / media / mirror) over the effect preview.
 *  - Cell 2 (the fill cell): the shared Options | Effect editor, composed for
 *    the current mode (animate = shader grid + EffectControls; media = media
 *    list + post-process; mirror = monitor picker + post-process). Omitted in
 *    'off' mode. Both cells resync via the 'lighting' multiplex topic.
 */
export function LightingTouch({ widget, surface, immersiveGrid }: WidgetProps) {
  const fullsizeWidget = useMemo(() => ({ ...widget, size: '4x4' as const }), [widget]);
  const { mode, animate } = useImmersiveAnimateState();
  const post = useImmersivePostProcess(mode);

  const cells: ReactNode[] = [
    <LightingWidget widget={fullsizeWidget} surface={surface} immersive />,
  ];
  // Always keep a second (fill) cell below the fixed 4x4 preview so the preview
  // stays a 4x4 even when there's no editor (off mode). The spacer just holds
  // the leftover height; otherwise the lone preview becomes the fill cell.
  const editor = renderImmersiveEditor(mode, animate, post);
  cells.push(editor ?? <div key="imm-fill" />);

  return (
    <ImmersiveLayout
      cells={cells}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
    />
  );
}

function renderImmersiveEditor(
  mode: LightingMode,
  animate: ImmersiveAnimateController | null,
  post: ImmersivePostProcess,
): ReactNode | null {
  if (mode === 'animate') {
    if (!animate) return null;
    return (
      <EffectEditor
        options={(
          <AnimateGrid
            effect={animate.effect}
            onSelect={animate.onSelectEffect}
            slotFor={animate.slotFor}
            versionFor={animate.versionFor}
            rgbActiveEffect={animate.effect}
          />
        )}
        effect={(
          <EffectControls
            effect={animate.effect}
            state={animate.state}
            bundle={animate.bundle}
            canReset={animate.canReset}
            onTemplateSelect={animate.onTemplateSelect}
            onChange={animate.onChange}
            onCommit={animate.onCommit}
            onReset={animate.onReset}
            rgbActiveSlot={animate.bundle.selected}
          />
        )}
      />
    );
  }
  if (mode === 'gif') {
    return (
      <EffectEditor
        options={<MediaList />}
        effect={(
          <PostProcessControls value={post.value} onChange={post.onChange} onCommit={post.onCommit} onReset={post.onReset} />
        )}
      />
    );
  }
  if (mode === 'screen') {
    return (
      <EffectEditor
        options={<ScreenControls screenPP={post.value} onScreenPPChange={post.onScreenPPChange} />}
        effect={(
          <PostProcessControls value={post.value} onChange={post.onChange} onCommit={post.onCommit} onReset={post.onReset} />
        )}
      />
    );
  }
  return null;
}

interface ImmersiveAnimateController {
  effect: string;
  state: EffectState;
  bundle: EffectTemplateBundle;
  canReset: boolean;
  slotFor: (key: string) => number;
  versionFor: (key: string) => string;
  onSelectEffect: (key: string) => void;
  onTemplateSelect: (idx: number) => void;
  onChange: (patch: Partial<EffectState>, commit?: boolean) => void;
  onCommit: () => void;
  onReset: () => void;
}

function useImmersiveAnimateState(): { mode: LightingMode; animate: ImmersiveAnimateController | null } {
  const [active, setActive] = useState<string>('rainbow');
  const [templates, setTemplates] = useState<Record<string, EffectTemplateBundle>>(buildAllDefaultTemplates);
  const [mode, setMode] = useState<LightingMode>('none');
  const stagedRef = useRef<EffectState | null>(null);
  const [, force] = useState(0);

  const hydrate = useCallback(async () => {
    const [sync, settings] = await Promise.all([
      fetchCurrentSync(),
      fetchAnimateSettings(),
    ]);
    const next = buildAllDefaultTemplates();
    if (settings?.templates) {
      for (const e of EFFECTS) {
        next[e.key] = mergeTemplates(e.key, settings.templates[e.key]);
      }
    }
    setTemplates(next);
    const rawSync = sync?.sync || 'none';
    setMode(rawSync === 'screen' ? 'screen' : (rawSync === 'media' ? 'gif' : (rawSync === 'none' ? 'none' : 'animate')));
    if (EFFECTS.some(e => e.key === rawSync)) setActive(rawSync);
    else if (settings?.effect) setActive(settings.effect);
  }, []);

  useEffect(() => { hydrate(); }, [hydrate]);
  useTopicCallback('lighting', true, hydrate);

  const bundle = templates[active];
  const baseState = bundle?.slots[bundle.selected] ?? defaultStateFor(active);
  // Ref-backed staged state bypasses the render cycle on slider drag; `force`
  // a render after mutation.
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
    if (bundle) {
      const slots = bundle.slots.slice();
      slots[bundle.selected] = s;
      const nextBundle: EffectTemplateBundle = { ...bundle, slots };
      const nextTemplates = { ...templates, [active]: nextBundle };
      setTemplates(nextTemplates);
      saveAnimateTemplates(nextTemplates).catch(() => { /* best-effort */ });
    }
  }, [active, bundle, templates]);

  const onTemplateSelect = useCallback((idx: number) => {
    if (!bundle) return;
    const clamped = Math.min(Math.max(idx, 0), bundle.slots.length - 1);
    const nextBundle: EffectTemplateBundle = { ...bundle, selected: clamped };
    const nextTemplates = { ...templates, [active]: nextBundle };
    setTemplates(nextTemplates);
    stagedRef.current = null;
    const next = nextBundle.slots[clamped];
    saveAnimateTemplates(nextTemplates).catch(() => { /* best-effort */ });
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

  const onSelectEffect = useCallback((key: string) => {
    setActive(key);
    stagedRef.current = null;
    force(n => n + 1);
    const b = templates[key];
    const s = b?.slots[b.selected] ?? defaultStateFor(key);
    void startAnimate(key, s.speed, s.intensity, s.hue, s.colorize, s.saturation, s.contrast, s.params, true);
  }, [templates]);

  const animate: ImmersiveAnimateController | null = (mode === 'animate' && bundle)
    ? {
      effect: active,
      state: liveState,
      bundle,
      canReset: stagedRef.current !== null,
      slotFor: (e: string) => templates[e]?.selected ?? 0,
      versionFor: (e: string) => {
        const b = templates[e];
        return b && b.slots.length
          ? slotThumbSignature(b.slots[Math.min(Math.max(b.selected, 0), b.slots.length - 1)])
          : '0';
      },
      onSelectEffect,
      onTemplateSelect,
      onChange,
      onCommit,
      onReset,
    }
    : null;

  return { mode, animate };
}

interface ImmersivePostProcess {
  value: PostProcessState;
  onChange: (patch: Partial<PostProcessState>, commit?: boolean) => void;
  onCommit: () => void;
  onReset: () => void;
  onScreenPPChange: (pp: PostProcessState) => void;
}

function useImmersivePostProcess(mode: LightingMode): ImmersivePostProcess {
  const [pp, setPp] = useState<PostProcessState>(DEFAULT_PP);
  const ppRef = useRef(pp);
  ppRef.current = pp;

  const hydrate = useCallback(async () => {
    if (mode === 'screen') {
      const e = await fetchScreenEffect();
      if (e) setPp({ hue: e.hue, colorize: e.colorize, saturation: e.saturation, contrast: e.contrast, flipX: e.flipX, flipY: e.flipY });
    } else if (mode === 'gif') {
      const e = await fetchMediaEffect();
      if (e) setPp({ hue: e.hue, colorize: e.colorize, saturation: e.saturation, contrast: e.contrast, flipX: e.flipX, flipY: e.flipY });
    }
  }, [mode]);

  useEffect(() => { hydrate(); }, [hydrate]);
  useTopicCallback('lighting', true, hydrate);

  const apply = useCallback((next: PostProcessState, persist: boolean) => {
    if (mode === 'screen') void setScreenEffect(next, persist);
    else if (mode === 'gif') void setMediaEffect(next, persist);
  }, [mode]);

  // Commit-only writes (mirror the immersive animate controls): drag updates
  // local state for the live slider, the service write fires on release.
  const onChange = useCallback((patch: Partial<PostProcessState>, commit?: boolean) => {
    setPp(prev => {
      const next = { ...prev, ...patch };
      if (commit) apply(next, true);
      return next;
    });
  }, [apply]);

  const onCommit = useCallback(() => { apply(ppRef.current, true); }, [apply]);

  const onReset = useCallback(() => {
    setPp(DEFAULT_PP);
    apply(DEFAULT_PP, true);
  }, [apply]);

  // ScreenControls' filter presets call setScreenEffect + startScreenMirror
  // themselves; this just syncs the displayed value for the Effect tab.
  const onScreenPPChange = useCallback((next: PostProcessState) => { setPp(next); }, []);

  return { value: pp, onChange, onCommit, onReset, onScreenPPChange };
}
