import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LightingWidget } from './LightingWidget';
import { ScreenControls } from './page/ModeControls';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import { EffectEditor } from './effecteditor/EffectEditor';
import { EffectControls } from './page/EffectControls';
import { AnimateGrid } from './page/AnimateGrid';
import { MediaList } from './effecteditor/MediaList';
import { StaticDeviceSelect } from './effecteditor/StaticDeviceSelect';
import { StaticPalette } from './page/StaticPalette';
import { PostProcessControls } from './effecteditor/PostProcessControls';
import type { PostProcessState } from './effecteditor/types';
import {
  fetchAnimateDefaults,
  fetchAnimateSettings,
  fetchCurrentSync,
  fetchMediaEffect,
  fetchScreenEffect,
  saveAnimateTemplates,
  setMediaEffect,
  setScreenEffect,
  fetchStaticSettings,
  fetchLightingDevices,
  startAnimate,
  type LightingDevice,
} from '../../../api/lighting';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { subscribeControlSync } from '../../../lib/controlSync';
import { usePanelBackgroundUsage, type PanelBackgroundUsage } from '../../../hooks/usePanelBackgroundUsage';
import {
  ANIMATE_EFFECTS,
  DEFAULT_STATIC_EFFECT,
  EFFECTS,
  STATIC_PATTERN_EFFECTS,
  defaultStateFor,
  isStaticEffect,
  type EffectState,
  type EffectTemplateBundle,
  type LightingMode,
} from '../../../types/lighting';
import { mergeTemplates, slotThumbSignature } from '../../../types/lightingTemplates';
import { normalizeSync as resolveImmersiveMode } from '../../../hooks/useLightingSync';
import { usePersistentState, usePersistentIdSet } from '../../../hooks/usePersistentState';
import { useTranslation } from '../../../lib/i18n';
import { paletteIdFromKey, type PaletteColor } from '../../../types/lightingPalette';
import {
  pickLookForDevices, pickPaletteForDevices,
  DEVICE_PICKS_STORAGE_KEY, SELECTED_DEVICES_STORAGE_KEY, PRIMARY_DEVICE_STORAGE_KEY,
  type DevicePicks,
} from './staticPicks';
import type { WidgetProps } from '../types';
import styles from './LightingPage.module.scss';

const DEFAULT_PP: PostProcessState = { hue: 0, colorize: 0, saturation: 1, contrast: 1 };

/**
 * Fullscreen lighting controller. Two stacked cells:
 *  - Cell 1: the immersive LightingWidget - square mode buttons (off / animate
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
  const panelUsage = usePanelBackgroundUsage();

  const cells: ReactNode[] = [
    <LightingWidget widget={fullsizeWidget} surface={surface} immersive />,
  ];
  // Always keep a second (fill) cell below the fixed 4x4 preview so the preview
  // stays a 4x4 even when there's no editor (off mode). The spacer just holds
  // the leftover height; otherwise the lone preview becomes the fill cell.
  const editor = renderImmersiveEditor(mode, animate, post, panelUsage);
  cells.push(editor ?? <div key="imm-fill" />);

  return (
    <ImmersiveLayout
      cells={cells}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
    />
  );
}

/** The page's palette, with the collapse state the immersive surface needs. */
function ImmersiveStaticPalette({ selectedId, onSelect }: {
  selectedId?: string | null;
  onSelect: (color: PaletteColor) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <StaticPalette
      selectedId={selectedId}
      open={open}
      onToggle={() => setOpen(o => !o)}
      onSelect={onSelect}
    />
  );
}

/**
 * The lighting page's static lockout, reusing its classes: with no devices
 * selected a pick has no target, so the browser shows through but is inert.
 */
function StaticBrowser({ locked, children }: { locked: boolean; children: ReactNode }) {
  const { t } = useTranslation();
  if (!locked) return <>{children}</>;
  return (
    <>
      <p className={styles.browserHint}>{t('lighting.pane.pickDevices')}</p>
      <div className={styles.browserLocked} inert>{children}</div>
    </>
  );
}

function renderImmersiveEditor(
  mode: LightingMode,
  animate: ImmersiveAnimateController | null,
  post: ImmersivePostProcess,
  panelUsage: PanelBackgroundUsage,
): ReactNode | null {
  if (mode === 'animate' || mode === 'static') {
    if (!animate) return null;
    const isStatic = mode === 'static';
    // Static picks land on the selection, so with none there is nothing to
    // pick for - the same lockout the lighting page shows.
    const needsSelection = isStatic && animate.selectedIds.size === 0;
    return (
      <EffectEditor
        devices={isStatic ? (
          <StaticDeviceSelect
            devices={animate.devices}
            selectedIds={animate.selectedIds}
            onSetSelection={animate.onSetSelection}
          />
        ) : undefined}
        effectDisabled={needsSelection}
        options={(
          <StaticBrowser locked={needsSelection}>
            <AnimateGrid
              effect={animate.effect}
              onSelect={animate.onSelectEffect}
              effects={isStatic ? STATIC_PATTERN_EFFECTS : ANIMATE_EFFECTS}
              frozen={isStatic}
              slotFor={animate.slotFor}
              versionFor={animate.versionFor}
              rgbActiveEffect={animate.effect}
              panelEffects={panelUsage.effects}
              leading={isStatic ? (
                <ImmersiveStaticPalette
                  selectedId={animate.selectedPaletteId}
                  onSelect={animate.onSelectPalette}
                />
              ) : undefined}
            />
          </StaticBrowser>
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
            panelSlots={panelUsage.slotsByEffect.get(animate.effect)}
            staticMode={isStatic}
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
  /** Static only: the devices a pick lands on, shared with the lighting page. */
  devices: LightingDevice[];
  selectedIds: Set<string>;
  onSetSelection: (ids: Set<string>, primary: string | null) => void;
  onSelectPalette: (color: PaletteColor) => void;
  /** The palette swatch the selection agrees on, so it renders as picked. */
  selectedPaletteId: string | null;
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

/**
 * The lighting devices plus the selection the lighting page keeps, so a static
 * pick made here targets exactly what that page shows selected.
 */
function useImmersiveDevices(enabled: boolean) {
  const [devices, setDevices] = useState<LightingDevice[]>([]);
  const [selectedIds, setSelectedIds] = usePersistentIdSet(SELECTED_DEVICES_STORAGE_KEY);
  const [, setPrimaryId] = usePersistentState<string | null>(PRIMARY_DEVICE_STORAGE_KEY, null);

  const refresh = useCallback(async () => {
    const list = await fetchLightingDevices();
    if (list?.devices) setDevices(list.devices);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    void refresh();
  }, [enabled, refresh]);
  useTopicCallback('lighting', enabled, refresh);

  const onSetSelection = useCallback((ids: Set<string>, primary: string | null) => {
    setSelectedIds(ids);
    setPrimaryId(primary);
  }, [setPrimaryId, setSelectedIds]);

  return { devices, selectedIds, onSetSelection };
}

function useImmersiveAnimateState(): { mode: LightingMode; animate: ImmersiveAnimateController | null } {
  const [active, setActive] = useState<string>('rainbow');
  const [templates, setTemplates] = useState<Record<string, EffectTemplateBundle>>({});
  const [mode, setMode] = useState<LightingMode>('none');
  const stagedRef = useRef<EffectState | null>(null);
  const [, force] = useState(0);
  const { devices, selectedIds, onSetSelection } = useImmersiveDevices(mode === 'static');
  const [devicePicks, setDevicePicks] = usePersistentState<DevicePicks>(DEVICE_PICKS_STORAGE_KEY, {});
  // Only when every selected device wears the same one; a mixed selection has
  // no single swatch to mark.
  const selectedPaletteId = useMemo(() => {
    let found: string | null = null;
    for (const id of selectedIds) {
      const pick = devicePicks[id];
      const paletteId = pick ? paletteIdFromKey(pick.key) : null;
      if (!paletteId) return null;
      if (found && found !== paletteId) return null;
      found = paletteId;
    }
    return found;
  }, [devicePicks, selectedIds]);

  const hydrate = useCallback(async () => {
    const [sync, settings, staticSettings, defaults] = await Promise.all([
      fetchCurrentSync(),
      fetchAnimateSettings(),
      fetchStaticSettings(),
      fetchAnimateDefaults(),
    ]);
    const next: Record<string, EffectTemplateBundle> = {};
    for (const e of EFFECTS) {
      next[e.key] = mergeTemplates(e.key, settings?.templates?.[e.key], defaults);
    }
    setTemplates(next);
    const rawSync = sync?.sync || 'none';
    const nextMode = resolveImmersiveMode(rawSync);
    setMode(nextMode);
    if (nextMode === 'static') {
      // Static picks are per device, so nothing here writes Lighting.Static.Effect
      // any more - re-seeding on every broadcast (there are dozens, most unrelated
      // to lighting picks) would yank the browsed effect back. Seed on entry only.
      setActive(prev => isStaticEffect(prev)
        ? prev
        : (isStaticEffect(staticSettings?.effect ?? '') ? staticSettings!.effect : DEFAULT_STATIC_EFFECT));
    } else if (EFFECTS.some(e => e.key === rawSync)) {
      setActive(rawSync);
    } else if (settings?.effect) {
      setActive(settings.effect);
    }
  }, []);

  useEffect(() => { hydrate(); }, [hydrate]);
  useTopicCallback('lighting', true, hydrate);

  // Optimistic mode update on same-browser mode changes (e.g. tapping the Media
  // button in the LightingWidget above). The lighting topic arrives after the
  // HTTP round-trip; controlSync fires immediately so the editor cell below
  // switches on the first tap rather than after the broadcast.
  useEffect(() => subscribeControlSync(event => {
    if (event.domain !== 'lighting') return;
    if (event.rawSync) {
      setMode(resolveImmersiveMode(event.rawSync));
    } else if (event.mode) {
      setMode(event.mode);
    }
  }), []);

  const bundle = templates[active];
  const baseState = bundle?.slots[bundle.selected] ?? defaultStateFor(active);

  // Static and animate share this editor; only the target differs. A static
  // pick belongs to the selected devices, exactly as on the lighting page -
  // starting the shared effect instead would repaint every device that carries
  // an assignment of its own.
  const applyLook = useCallback((key: string, s: EffectState, slot: number) => {
    if (mode === 'static') {
      if (selectedIds.size === 0) return;
      setDevicePicks(prev => pickLookForDevices(prev, key, slot, s, [...selectedIds], true));
      return;
    }
    void startAnimate(key, s.speed, s.intensity, s.hue, s.colorize, s.saturation, s.contrast, s.params, true);
  }, [mode, selectedIds, setDevicePicks]);

  const onSelectPalette = useCallback((color: PaletteColor) => {
    if (selectedIds.size === 0) return;
    setDevicePicks(prev => pickPaletteForDevices(prev, color, [...selectedIds]));
  }, [selectedIds, setDevicePicks]);
  // Ref-backed staged state bypasses the render cycle on slider drag; `force`
  // a render after mutation.
  const liveState = stagedRef.current ?? baseState;

  const onChange = useCallback((patch: Partial<EffectState>, commit?: boolean) => {
    const next = { ...(stagedRef.current ?? baseState), ...patch };
    stagedRef.current = next;
    force(n => n + 1);
    if (commit) {
      applyLook(active, next, bundle?.selected ?? 0);
    }
  }, [active, applyLook, baseState, bundle]);

  const onCommit = useCallback(() => {
    const s = stagedRef.current;
    if (!s) return;
    applyLook(active, s, bundle?.selected ?? 0);
    if (bundle) {
      const slots = bundle.slots.slice();
      slots[bundle.selected] = s;
      const nextBundle: EffectTemplateBundle = { ...bundle, slots };
      const nextTemplates = { ...templates, [active]: nextBundle };
      setTemplates(nextTemplates);
      saveAnimateTemplates(nextTemplates).catch(() => { /* best-effort */ });
    }
  }, [active, applyLook, bundle, templates]);

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
      applyLook(active, next, clamped);
    }
  }, [active, applyLook, bundle, templates]);

  const onReset = useCallback(() => {
    stagedRef.current = null;
    force(n => n + 1);
    if (bundle) {
      const slot = bundle.slots[bundle.selected] ?? defaultStateFor(active);
      applyLook(active, slot, bundle.selected);
    }
  }, [active, applyLook, bundle]);

  const onSelectEffect = useCallback((key: string) => {
    setActive(key);
    stagedRef.current = null;
    force(n => n + 1);
    const b = templates[key];
    const s = b?.slots[b.selected] ?? defaultStateFor(key);
    applyLook(key, s, b?.selected ?? 0);
  }, [applyLook, templates]);

  const animate: ImmersiveAnimateController | null = ((mode === 'animate' || mode === 'static') && bundle)
    ? {
      effect: active,
      devices,
      selectedIds,
      onSetSelection,
      onSelectPalette,
      selectedPaletteId,
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
      if (e) setPp({ hue: e.hue, colorize: e.colorize, saturation: e.saturation, contrast: e.contrast, flipX: e.flipX, flipY: e.flipY, reactive: e.reactive, reactivity: e.reactivity, intensity: e.intensity });
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
    setPp(prev => {
      const next = { ...prev, hue: 0, colorize: 0, saturation: 1, contrast: 1, reactivity: 0.5, intensity: 0.5 };
      apply(next, true);
      return next;
    });
  }, [apply]);

  // ScreenControls' filter presets call setScreenEffect + startScreenMirror
  // themselves; this just syncs the displayed value for the Effect tab.
  const onScreenPPChange = useCallback((next: PostProcessState) => { setPp(next); }, []);

  return { value: pp, onChange, onCommit, onReset, onScreenPPChange };
}
