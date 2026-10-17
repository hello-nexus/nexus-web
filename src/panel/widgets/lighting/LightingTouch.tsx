import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LightingWidget } from './LightingWidget';
import { ScreenControls } from './page/ModeControls';
import { ImmersiveLayout } from '../common/ImmersiveLayout';
import { EffectEditor } from './effecteditor/EffectEditor';
import { EffectControls } from './page/EffectControls';
import { AnimateGrid } from './page/AnimateGrid';
import { MediaList } from './effecteditor/MediaList';
import { StaticDeviceSelect } from './effecteditor/StaticDeviceSelect';
import type { LedPick } from './page/DeviceLedStrip';
import { StaticPickerCanvas } from './page/StaticPickerCanvas';
import { PICKER_FIELD_SVG, PICKER_SEGMENTED_SVG, pickerHexAt, pickerPointFor, snapToSegment } from './page/staticPickerField';
import { useColorWriteQueue } from './page/useColorWriteQueue';
import { useGlobalColor } from './page/useGlobalColor';
import { usePins } from './page/usePins';
import { visibleCards } from './page/zoneUtils';
import { EffectCard } from '../../../components/common/EffectCard/EffectCard';
import { CollapsibleSection } from '../../../components/common/CollapsibleSection/CollapsibleSection';
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
  startStatic,
  type LightingDevice,
  type Pin,
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
import { usePersistentState } from '../../../hooks/usePersistentState';
import { usePanelIdSet } from '../../../hooks/usePanelIdSet';
import { zoneCardSelectionHoldable } from './page/ZoneCard';
import { useTranslation } from '../../../lib/i18n';
import { isPaletteKey } from '../../../types/lightingPalette';
import {
  staticLookPin, colorPin, animatePin, MIRROR_PIN, MEDIA_PIN, selectionPin, pinGridKey, pinHex, pinStripPick, pickerMarks, pinnedNamesByEffect, pinModeTargetLabel, pinTargetLabel, clearLegacyLightingKeys, SELECTED_DEVICES_STORAGE_KEY,
} from './pins';
import type { WidgetProps } from '../types';
import styles from './LightingPage.module.scss';

const DEFAULT_PP: PostProcessState = { hue: 0, colorize: 0, saturation: 1, contrast: 1 };

/**
 * Fullscreen lighting controller. Two stacked cells:
 *  - Cell 1: the immersive LightingWidget - square mode buttons (off / animate
 *    / media / mirror) over the effect preview; in Static that preview is the
 *    colour picker itself, since picking IS what the mode's canvas shows.
 *  - Cell 2 (the fill cell): the shared Options | Effect editor, composed for
 *    the current mode (animate = shader grid + EffectControls; media = media
 *    list + post-process; mirror = monitor picker + post-process). Omitted in
 *    'off' mode. Both cells resync via the 'lighting' multiplex topic.
 */
export function LightingTouch({ widget, surface, immersiveGrid }: WidgetProps) {
  const fullsizeWidget = useMemo(() => ({ ...widget, size: '4x4' as const }), [widget]);
  const { mode, animate, deviceSelect, scope, selectionPick } = useImmersiveAnimateState();
  // The filters belong to the source the editor shows: the Animation and Static
  // editors show a Mirror- or Media-pinned selection's shared source instead.
  const shaderEditor = mode === 'animate' || mode === 'static';
  const post = useImmersivePostProcess(shaderEditor && scope === 'mirror' ? 'screen' : shaderEditor && scope === 'media' ? 'gif' : mode);
  const panelUsage = usePanelBackgroundUsage();

  const cells: ReactNode[] = [
    <LightingWidget
      widget={fullsizeWidget}
      surface={surface}
      immersive
      immersiveCanvas={mode === 'static' && animate ? <ImmersivePickerCanvas animate={animate} /> : undefined}
    />,
  ];
  // Always keep a second (fill) cell below the fixed 4x4 preview so the preview
  // stays a 4x4 even when there's no editor (off mode). The spacer just holds
  // the leftover height; otherwise the lone preview becomes the fill cell.
  const editor = renderImmersiveEditor(mode, animate, post, panelUsage, deviceSelect, scope, selectionPick);
  cells.push(editor ?? <div key="imm-fill" />);

  return (
    <ImmersiveLayout
      cells={cells}
      gridColumns={immersiveGrid?.columns ?? 4}
      gridRows={immersiveGrid?.rows ?? 8}
    />
  );
}

/** Static's colour field, filling the immersive preview cell. */
function ImmersivePickerCanvas({ animate }: { animate: ImmersiveAnimateController }) {
  return (
    <StaticPickerCanvas
      fill
      devices={animate.pickerDevices}
      implied={animate.selectedIds.size === 0}
      hex={animate.selectedHex}
      segmented={animate.segmented}
      patternEffect={animate.staticPattern?.key ?? null}
      patternSlot={animate.staticPattern?.slot ?? 0}
      patternVersion={animate.staticPattern ? animate.versionForSlot(animate.staticPattern.key, animate.staticPattern.slot) : '0'}
      gpuAvailable
      onPreview={animate.onPreviewCustom}
      onCommit={animate.onSelectCustom}
    />
  );
}

/** The two tiles that pick which field the canvas above shows. */
function ImmersivePicker({ animate }: { animate: ImmersiveAnimateController }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(true);
  const pick = (toSegment: boolean) => {
    animate.onSetSegmented(toSegment);
    const base = animate.selectedHex || animate.customColor || '#ff0000';
    if (!toSegment) {
      animate.onSelectCustom(base);
      return;
    }
    const p = pickerPointFor(base);
    const snapped = snapToSegment(p.x, p.y);
    animate.onSelectCustom(pickerHexAt(snapped.x, snapped.y));
  };
  return (
    <CollapsibleSection
      compact
      title={t('lighting.static.pickerGroup')}
      open={open}
      onToggle={() => setOpen(o => !o)}
    >
      <div className={styles.animateGridSection}>
        <EffectCard
          overlay
          label={t('lighting.static.pickerSegmented')}
          thumbUrl={PICKER_SEGMENTED_SVG}
          active={!animate.staticPattern && animate.segmented}
          onClick={() => pick(true)}
        />
        <EffectCard
          overlay
          label={t('lighting.static.picker')}
          thumbUrl={PICKER_FIELD_SVG}
          active={!animate.staticPattern && !animate.segmented}
          onClick={() => pick(false)}
        />
      </div>
    </CollapsibleSection>
  );
}

function renderImmersiveEditor(
  mode: LightingMode,
  animate: ImmersiveAnimateController | null,
  post: ImmersivePostProcess,
  panelUsage: PanelBackgroundUsage,
  deviceSelect: React.ComponentProps<typeof StaticDeviceSelect>,
  scope: EditorScope,
  selectionPick: (() => void) | undefined,
): ReactNode | null {
  const mirrorPostProcess = (
    <PostProcessControls value={post.value} onChange={post.onChange} onCommit={post.onCommit} onReset={post.onReset} />
  );
  if (mode === 'animate' || mode === 'static') {
    if (!animate) return null;
    const isStatic = mode === 'static';
    return (
      <EffectEditor
        devices={<StaticDeviceSelect {...animate.deviceSelect} />}
        // A mixed selection or a palette color has no single set of controls.
        effectDisabled={scope === 'mixed' || scope === 'palette'}
        // A selection pinned to the shared Mirror or Media edits that source here,
        // without switching the global mode to it.
        options={scope === 'mirror' ? <ScreenControls screenPP={post.value} onScreenPPChange={post.onScreenPPChange} keepMode />
          : scope === 'media' ? <MediaList keepMode /> : (
          <AnimateGrid
            // The highlight belongs to what the SELECTION wears, not to what was
            // last browsed: a pattern tile left lit after a color pick reads as
            // a second selection beside the picker tile.
            effect={isStatic ? (animate.staticPattern?.key ?? '') : animate.effect}
            onSelect={animate.onSelectEffect}
            effects={isStatic ? STATIC_PATTERN_EFFECTS : ANIMATE_EFFECTS}
            frozen={isStatic}
            slotFor={animate.slotFor}
            versionFor={animate.versionFor}
            rgbActiveEffect={isStatic ? null : animate.runningEffect}
            panelEffects={panelUsage.effects}
            pinnedDevices={animate.pinnedDevices}
            leading={isStatic ? <ImmersivePicker animate={animate} /> : undefined}
          />
        )}
        effect={scope === 'mirror' || scope === 'media' ? mirrorPostProcess : (
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
  // A Media or Mirror pick with cards selected gives just them the shared source.
  if (mode === 'gif') {
    return (
      <EffectEditor
        devices={<StaticDeviceSelect {...deviceSelect} />}
        options={<MediaList onSelectionPick={selectionPick} />}
        effect={mirrorPostProcess}
      />
    );
  }
  if (mode === 'screen') {
    return (
      <EffectEditor
        devices={<StaticDeviceSelect {...deviceSelect} />}
        options={<ScreenControls screenPP={post.value} onScreenPPChange={post.onScreenPPChange} onSelectionPick={selectionPick} />}
        effect={mirrorPostProcess}
      />
    );
  }
  return null;
}

interface ImmersiveAnimateController {
  /** The effect the editor shows: the pinned target when the selection wears one, else the running one. */
  effect: string;
  /** The effect the global source is running. */
  runningEffect: string;
  /** Props for the devices tab: the rail's cards with pin buttons. */
  deviceSelect: React.ComponentProps<typeof StaticDeviceSelect>;
  /** Device names per pinned effect, for the grid badges. */
  pinnedDevices: ReadonlyMap<string, readonly string[]>;
  selectedIds: Set<string>;
  onSetSelection: (ids: Set<string>, primary: string | null) => void;
  customColor: string;
  onSelectCustom: (hex: string) => void;
  /** Fires per pointer-move; the controller paces its own writes. */
  onPreviewCustom: (hex: string) => void;
  /** The colour the selection shares, for the picker's marks and hex readout. */
  selectedHex: string;
  /** Set when the selection wears a pattern rather than a flat colour. */
  staticPattern: { key: string; slot: number } | null;
  segmented: boolean;
  onSetSegmented: (on: boolean) => void;
  pickerDevices: { id: string; name: string; hex: string }[];
  state: EffectState;
  bundle: EffectTemplateBundle;
  canReset: boolean;
  slotFor: (key: string) => number;
  versionFor: (key: string) => string;
  /** A specific slot's content hash - a pattern's thumbnail is keyed on the
   *  slot the pick came from, not the effect's currently selected one. */
  versionForSlot: (key: string, slot: number) => string;
  onSelectEffect: (key: string) => void;
  onTemplateSelect: (idx: number) => void;
  onChange: (patch: Partial<EffectState>, commit?: boolean) => void;
  onCommit: () => void;
  onReset: () => void;
}

/**
 * The lighting devices plus this view's own remembered selection, which is
 * never the desktop lighting page's.
 */
function useImmersiveDevices(enabled: boolean) {
  useState(clearLegacyLightingKeys);
  const [devices, setDevices] = useState<LightingDevice[]>([]);
  const holdableIds = useMemo(
    () => new Set(visibleCards(devices).filter(zoneCardSelectionHoldable).map(d => d.id)),
    [devices],
  );
  const [selectedIds, setSelectedIds] = usePanelIdSet(SELECTED_DEVICES_STORAGE_KEY, 'lightingSelection', holdableIds);
  const [, setPrimaryId] = useState<string | null>(null);

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

/** What the selection wears, for the editor: nothing, mixed pins, a palette color, Mirror, or a shader or static look. */
type EditorScope = 'none' | 'mixed' | 'palette' | 'mirror' | 'media' | 'pin';

function useImmersiveAnimateState(): {
  mode: LightingMode;
  animate: ImmersiveAnimateController | null;
  deviceSelect: React.ComponentProps<typeof StaticDeviceSelect>;
  scope: EditorScope;
  selectionPick: (() => void) | undefined;
} {
  const { t } = useTranslation();
  const [active, setActive] = useState<string>('rainbow');
  const [templates, setTemplates] = useState<Record<string, EffectTemplateBundle>>({});
  const [mode, setMode] = useState<LightingMode>('none');
  // The edit in progress, tagged with the target it belongs to: after the
  // selection or a pinned pick moves the editor to another effect or preset it
  // is simply not that target's staged state any more.
  const stagedRef = useRef<{ target: string; state: EffectState } | null>(null);
  const [, force] = useState(0);
  const { devices, selectedIds, onSetSelection } = useImmersiveDevices(mode === 'static' || mode === 'animate' || mode === 'screen' || mode === 'gif');
  const { pins, refresh: refreshPins, applyPins, recordPins } = usePins();
  useEffect(() => { void refreshPins(); }, [refreshPins]);
  useTopicCallback('lighting', true, () => { void refreshPins(); });
  const [segmented, setSegmented] = usePersistentState('nexus.lighting.pickerSegmented', true);
  const queueColorWrite = useColorWriteQueue(useCallback((ids: string[], pin: Pin) => applyPins(ids, pin, false), [applyPins]));
  const [customStaticColor, setCustomStaticColor] = usePersistentState('nexus.lighting.customColor', '');
  // The exact flat color the global Static look is, from the service; '' when it is an effect.
  const [globalColor, setGlobalColor, readGlobalColor] = useGlobalColor();

  const selectionIds = useMemo(() => [...selectedIds], [selectedIds]);
  const selection = useMemo(() => selectionPin(pins, selectionIds), [pins, selectionIds]);
  const scope: EditorScope = selection.kind === 'none' ? 'none'
    : selection.kind === 'mixed' ? 'mixed'
      : selection.pin.kind === 'mirror' ? 'mirror'
        : selection.pin.kind === 'media' ? 'media'
          : isPaletteKey(pinGridKey(selection.pin)) ? 'palette' : 'pin';
  // A selection wearing one shader or static pin shows that target in the
  // editor; the running effect is untouched.
  const pinnedKey = selection.kind === 'pin' && selection.pin.kind !== 'mirror' && selection.pin.kind !== 'media' && !isPaletteKey(pinGridKey(selection.pin))
    ? pinGridKey(selection.pin)
    : null;
  const pinnedSlot = selection.kind === 'pin' && selection.pin.kind === 'static' ? (selection.pin.slot ?? 0) : null;
  const shown = pinnedKey ?? active;

  // The colour the selection shares, which is where the picker marks it.
  const selectedHex = useMemo(() => {
    if (selectedIds.size === 0) return globalColor;
    let hex = '';
    for (const id of selectedIds) {
      const pin = pins[id];
      if (!pin || pin.kind !== 'static') return '';
      const h = pinHex(pin);
      if (hex && hex.toLowerCase() !== h.toLowerCase()) return '';
      hex = h;
    }
    return hex;
  }, [globalColor, pins, selectedIds]);

  const hydrate = useCallback(async () => {
    const land = readGlobalColor();
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
    land(staticSettings?.color ?? '');
    const rawSync = sync?.sync || 'none';
    const nextMode = resolveImmersiveMode(rawSync);
    setMode(nextMode);
    if (nextMode === 'static') {
      // Seed on entry only: re-seeding on every broadcast (there are dozens,
      // most unrelated to lighting) would yank the browsed effect back.
      setActive(prev => isStaticEffect(prev)
        ? prev
        : (isStaticEffect(staticSettings?.effect ?? '') ? staticSettings!.effect : DEFAULT_STATIC_EFFECT));
    } else if (EFFECTS.some(e => e.key === rawSync)) {
      setActive(rawSync);
    } else if (settings?.effect) {
      setActive(settings.effect);
    }
  }, [readGlobalColor]);

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

  const bundle = templates[shown];
  const slotShown = pinnedSlot ?? bundle?.selected ?? 0;
  const baseState = bundle?.slots[slotShown] ?? defaultStateFor(shown);

  // An edit: a static pin re-pins its devices, a shader pin only changes that
  // shader's settings (the running effect is not touched unless it is the
  // same shader), and with nothing pinned the global source is edited.
  const applyLook = useCallback((key: string, s: EffectState, slot: number) => {
    if (selection.kind === 'pin' && selection.pin.kind === 'static' && pinnedKey) {
      void applyPins(selectionIds, staticLookPin(key, slot, s));
      return;
    }
    if (pinnedKey && pinnedKey !== active) return;
    if (mode === 'static') {
      setGlobalColor('', startStatic(key, s.intensity, s.hue, s.colorize, s.saturation, s.contrast, s.params, true));
      return;
    }
    void startAnimate(key, s.speed, s.intensity, s.hue, s.colorize, s.saturation, s.contrast, s.params, true);
  }, [active, applyPins, mode, pinnedKey, selection, selectionIds, setGlobalColor]);

  const versionForSlot = useCallback((key: string, slot: number) => {
    const b = templates[key];
    if (!b || b.slots.length === 0) return '0';
    return slotThumbSignature(b.slots[Math.min(Math.max(slot, 0), b.slots.length - 1)]);
  }, [templates]);

  const ledPickFor = useCallback((id: string): LedPick | undefined => {
    const pin = pins[id];
    const pick = pin ? pinStripPick(pin) : null;
    return pick ? { ...pick, version: versionForSlot(pick.key, pick.slot) } : undefined;
  }, [pins, versionForSlot]);

  // The selection wears a pattern when every device agrees on one static pin
  // and that pin is an effect rather than a flat color.
  const staticPattern = useMemo(
    () => selection.kind === 'pin' && selection.pin.kind === 'static' && pinnedKey
      ? { key: pinnedKey, slot: selection.pin.slot ?? 0 }
      : null,
    [pinnedKey, selection],
  );

  const pickerDevices = useMemo(
    () => pickerMarks(visibleCards(devices), pins, selectedIds, globalColor),
    [devices, globalColor, pins, selectedIds],
  );

  // Static and animate share this editor; only the target differs. A pick with
  // devices selected pins them to it and leaves the running effect alone; with
  // none selected it is the global source.
  const onSelectEffect = useCallback((key: string) => {
    const b = templates[key];
    const s = b?.slots[b.selected] ?? defaultStateFor(key);
    const slot = b?.selected ?? 0;
    if (selectionIds.length > 0) {
      void applyPins(selectionIds, mode === 'static' ? staticLookPin(key, slot, s) : animatePin(key));
      return;
    }
    setActive(key);
    stagedRef.current = null;
    force(n => n + 1);
    applyLook(key, s, slot);
  }, [applyLook, applyPins, mode, selectionIds, templates]);

  const onSelectCustom = useCallback((hex: string) => {
    setCustomStaticColor(hex);
    // Nothing selected: the color is the exact global flat color.
    if (selectionIds.length === 0) {
      setGlobalColor(hex, startStatic(DEFAULT_STATIC_EFFECT, 1, 0, 0, 1, 1, {}, true, hex));
      return;
    }
    // Record without pushing and queue the write, so a commit cannot race a
    // preview still in flight and leave the hardware on the older colour.
    const pin = colorPin(hex);
    recordPins(selectionIds, pin);
    queueColorWrite(pin, selectionIds);
  }, [queueColorWrite, recordPins, selectionIds, setCustomStaticColor, setGlobalColor]);

  const onPreviewCustom = useCallback((hex: string) => {
    if (selectionIds.length === 0) return;
    const pin = colorPin(hex);
    recordPins(selectionIds, pin);
    queueColorWrite(pin, selectionIds);
  }, [queueColorWrite, recordPins, selectionIds]);
  // Ref-backed staged state bypasses the render cycle on slider drag; `force`
  // a render after mutation.
  const targetKey = `${shown}#${slotShown}`;
  const stagedFor = useCallback((target: string) => (stagedRef.current?.target === target ? stagedRef.current.state : null), []);
  const liveState = stagedFor(targetKey) ?? baseState;

  const onChange = useCallback((patch: Partial<EffectState>, commit?: boolean) => {
    const next = { ...(stagedFor(targetKey) ?? baseState), ...patch };
    stagedRef.current = { target: targetKey, state: next };
    force(n => n + 1);
    if (commit) {
      applyLook(shown, next, slotShown);
    }
  }, [applyLook, baseState, shown, slotShown, stagedFor, targetKey]);

  const onCommit = useCallback(() => {
    const s = stagedFor(targetKey);
    if (!s) return;
    applyLook(shown, s, slotShown);
    if (bundle) {
      const slots = bundle.slots.slice();
      slots[slotShown] = s;
      const nextBundle: EffectTemplateBundle = { ...bundle, slots };
      const nextTemplates = { ...templates, [shown]: nextBundle };
      setTemplates(nextTemplates);
      saveAnimateTemplates(nextTemplates).catch(() => { /* best-effort */ });
    }
  }, [applyLook, bundle, shown, slotShown, stagedFor, targetKey, templates]);

  const onTemplateSelect = useCallback((idx: number) => {
    if (!bundle) return;
    const clamped = Math.min(Math.max(idx, 0), bundle.slots.length - 1);
    // A static pin repoints only its devices; the effect's shared pointer stays.
    const nextBundle: EffectTemplateBundle = pinnedSlot === null ? { ...bundle, selected: clamped } : bundle;
    const nextTemplates = { ...templates, [shown]: nextBundle };
    setTemplates(nextTemplates);
    stagedRef.current = null;
    const next = nextBundle.slots[clamped];
    if (pinnedSlot === null) saveAnimateTemplates(nextTemplates).catch(() => { /* best-effort */ });
    if (next) {
      applyLook(shown, next, clamped);
    }
  }, [applyLook, bundle, pinnedSlot, shown, templates]);

  const onReset = useCallback(() => {
    stagedRef.current = null;
    force(n => n + 1);
    if (bundle) {
      const slot = bundle.slots[slotShown] ?? defaultStateFor(shown);
      applyLook(shown, slot, slotShown);
    }
  }, [applyLook, bundle, shown, slotShown]);

  // What a press on a following card's pin pins it to: the current global source.
  const sourceLabel = useCallback((key: string) => {
    const def = EFFECTS.find(e => e.key === key);
    return def ? t(def.labelKey) : key;
  }, [t]);
  const globalPin: { pin: Pin; name: string } | null = useMemo(() => {
    if (mode === 'static') {
      // A no-selection pick sets the global color and leaves the pattern alone.
      if (globalColor) {
        const pin = colorPin(globalColor);
        return { pin, name: pinTargetLabel(pin, t) };
      }
      const b = templates[active];
      const slot = b?.selected ?? 0;
      return { pin: staticLookPin(active, slot, b?.slots[slot] ?? defaultStateFor(active)), name: sourceLabel(active) };
    }
    if (mode === 'animate') return { pin: animatePin(active), name: sourceLabel(active) };
    if (mode === 'screen') return { pin: MIRROR_PIN, name: t('lighting.mode.screen') };
    if (mode === 'gif') return { pin: MEDIA_PIN, name: t('lighting.mode.gif') };
    return null;
  }, [active, globalColor, mode, sourceLabel, t, templates]);
  const deviceSelect: React.ComponentProps<typeof StaticDeviceSelect> = {
    devices,
    selectedIds,
    onSetSelection,
    ledPickFor,
    pins,
    pinSource: globalPin?.name ?? null,
    pinDisabledReason: globalPin ? undefined : t('lighting.pin.disabledUnavailable'),
    pinTargetName: (pin: Pin) => pinModeTargetLabel(pin, t),
    onSetPin: (ids, pinned) => { if (!pinned) void applyPins(ids, null); else if (globalPin) void applyPins(ids, globalPin.pin); },
  };

  const pinnedDevices = useMemo(() => {
    const names = new Map(devices.map(d => [d.id, d.name]));
    return pinnedNamesByEffect(pins, mode === 'static' ? 'static' : 'animate', id => names.get(id));
  }, [devices, mode, pins]);

  const animate: ImmersiveAnimateController | null = ((mode === 'animate' || mode === 'static') && bundle)
    ? {
      effect: shown,
      runningEffect: active,
      deviceSelect,
      pinnedDevices,
      selectedIds,
      onSetSelection,
      customColor: selectedHex || customStaticColor,
      onSelectCustom,
      onPreviewCustom,
      selectedHex,
      staticPattern,
      segmented,
      onSetSegmented: setSegmented,
      pickerDevices,
      state: liveState,
      bundle: pinnedSlot === null ? bundle : { ...bundle, selected: slotShown },
      canReset: stagedFor(targetKey) !== null,
      slotFor: (e: string) => templates[e]?.selected ?? 0,
      versionFor: (e: string) => versionForSlot(e, templates[e]?.selected ?? 0),
      versionForSlot,
      onSelectEffect,
      onTemplateSelect,
      onChange,
      onCommit,
      onReset,
    }
    : null;

  const selectionPick = selectionIds.length > 0 && (mode === 'screen' || mode === 'gif')
    ? () => { void applyPins(selectionIds, mode === 'screen' ? MIRROR_PIN : MEDIA_PIN); }
    : undefined;
  return { mode, animate, deviceSelect, scope, selectionPick };
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
  // Writes the ref first: a typed slider edit commits in the same tick.
  const onChange = useCallback((patch: Partial<PostProcessState>, commit?: boolean) => {
    const next = { ...ppRef.current, ...patch };
    ppRef.current = next;
    setPp(next);
    if (commit) apply(next, true);
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
