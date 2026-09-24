import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Undo2, Redo2, AlignHorizontalDistributeCenter, Grid3x3, RotateCw,
  Trash2, FlipHorizontal2, FlipVertical2, RotateCcw, CheckSquare, Square,
  Merge, Scissors, ListRestart, Users, Palette, Droplet, Lightbulb, CircleDot, ExternalLink,
} from 'lucide-react';
import {
  fetchDeviceStructure, fetchDeviceMap, saveDeviceMap, saveDeviceZones, resetDeviceMap, resetDeviceZones,
  highlightLeds, testLedPattern, clearLedEditor, postLedPreviewLayout,
  previewDeviceChain, setDeviceChain, setZoneLedCount, setLightingDeviceColor, setHubComposition,
  type ApiEnvelope, type ChainEntryBody, type DeviceMapResponse, type DeviceStructureResponse, type DeviceZone, type LightingDevice, type HubCompositionPatch,
} from '../../../../api/lighting';
import { HubCompositionPanel } from './HubCompositionPanel';
import { useTranslation } from '../../../../lib/i18n';
import { pluralKey } from '../../../../lib/pluralKey';
import { useToast } from '../../../../components/common/Toast/Toast';
import { DeviceModal } from '../../../../components/common/DeviceModal/DeviceModal';
import { ConfirmModal } from '../../../../components/common/ConfirmModal/ConfirmModal';
import { PromptModal } from '../../../../components/common/PromptModal/PromptModal';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { Slider } from '../../../../components/common/Slider/Slider';
import { useThrottle } from '../../../../hooks/cadence';
import { isApplePlatform, isMultiSelectModifier } from '../../../../lib/platform';
import { CommunityMappingsPanel } from './CommunityMappingsPanel';
import { ZoneChainList, type ChainRow } from './ZoneChainList';
import {
  baselineFrom, buildSavePlan, checkMerge, defaultPartitionGuess, emptyHistory,
  flattenDeviceMap, isStagedZoneId, mergeStagedZones, orderZones,
  GRID_COLS, GRID_ROWS,
  pushHistory, redoHistory, relabelLedZones, reorderChainEntries, segmentOffsets,
  selectionCenter, selectionSnapAdjust, settleLed,
  splitStagedZones,
  splitZone, stagedZoneId, toZoneLocalIndices, undoHistory, zoneDeviceIndices,
  zoneEnabledCounts, zoneLedCount,
  SAME_POSITION_EPSILON, type BaselineEntry, type EditorHistory, type EditorLed, type EditorSnapshot, type ReceivedLed, type StagedPartition,
} from './zoneUtils';
import { shouldConsumeEditorEscape } from './ledMapEscape';
import styles from './LedMapEditor.module.scss';

const isMac = isApplePlatform();
// The selection toolbar is ~150x30px; past these the canvas would clip it.
const TOOLBAR_FLIP_X_PCT = 22;
const TOOLBAR_FLIP_Y_PCT = 10;
// Long-form guide for this editor. Absolute: the app is served from the local
// service, so a site-relative path would resolve against it.
const LED_MAP_DOCS_URL = 'https://hellonexus.com/docs/guides/lighting/led-maps';
const DEFAULT_RATIO = 16 / 9;

// Smart-light card ids are brand-prefixed (`govee:…`, `hue:…`); the brand set
// mirrors SmartLightsPage's categories. PC / OpenRGB device ids never carry one
// of these prefixes, so the color sliders stay hidden for them.
const SMART_LIGHT_BRANDS = [
  'govee', 'hue', 'nanoleaf', 'wled', 'lifx', 'twinkly', 'wiz', 'yeelight', 'elgato',
] as const;
const isSmartLightId = (id: string) =>
  SMART_LIGHT_BRANDS.some(brand => id.startsWith(`${brand}:`));
// Canvas box shape. Applied as an inline style so TS owns the single source;
// the device frame's default placement derives from it below.
const CANVAS_RATIO = 16 / 9;
// Plain black margin around the frame - no grid, no rim - so an LED sitting on
// an edge is still drawn whole instead of half-clipped. The horizontal percent
// is derived from CANVAS_RATIO so the margin is the same number of pixels on
// every side.
const FRAME_PAD_PCT = 3;
const DEFAULT_DEV_RECT = {
  x: FRAME_PAD_PCT / CANVAS_RATIO,
  y: FRAME_PAD_PCT,
  w: 100 - 2 * (FRAME_PAD_PCT / CANVAS_RATIO),
  h: 100 - 2 * FRAME_PAD_PCT,
};
const RECT_PAD_PX = 10;
const MAX_HISTORY = 50;
// Fraction of the selected LEDs' bbox edge to pad on each side for a
// group op (align strip / grid / rotate), so LEDs don't sit on the edges.
const SELECTION_BBOX_PAD_UV = 0.04;
// Above this the per-LED canvas stops being usable (and stops being drawable
// at a readable dot size), so the mapper declines rather than rendering a
// meaningless swarm. The count stays editable; only the visual map opts out.
const MAX_MAPPABLE_LEDS = 300;
// Pixel nudge step for arrow-key movement. Shift multiplies this by 5 for
// coarse nudges when reshaping wide selections.
const NUDGE_STEP_UV = 0.005;
const NUDGE_STEP_UV_COARSE = 0.025;
// A group is LEDs the Group action put on one point; only float noise apart.
// A snap never lands a drop on another LED's point, or it would form one.
const CO_LOCATED_EPSILON = 1e-6;

function onSamePoint(a: { u: number; v: number }, b: { u: number; v: number }): boolean {
  return Math.abs(a.u - b.u) < CO_LOCATED_EPSILON && Math.abs(a.v - b.v) < CO_LOCATED_EPSILON;
}

// A Lian Li port device's ring segment holds one LED ring per fan, so dividing
// the segment's LED count by the per-fan ring size recovers the fan count.
const LIANLI_LEDS_PER_FAN = 16;

type EditorMode = 'animation' | 'horizontal' | 'vertical' | 'none';

type SavedLedState = { u: number; v: number; disabled: boolean; isCustom: boolean };

type ZonePrompt = { mode: 'split' };
/** The community layouts button is hidden for now; the panel stays reachable from a card's community badge. */
const COMMUNITY_BUTTON = false;

// Sane client-side cap for zone names; mirrors the artifact name caps
// enforced service-side.
const MAX_ZONE_NAME_LENGTH = 40;

const SELECTION_HANDLE_CLASS: Record<'nw' | 'ne' | 'sw' | 'se', string> = {
  nw: styles.selectionHandleNW,
  ne: styles.selectionHandleNE,
  sw: styles.selectionHandleSW,
  se: styles.selectionHandleSE,
};

interface Props {
  /** Enumeration-unit device whose whole LED space the editor renders. */
  deviceId: string;
  /** Zone preselected on open; the card whose settings button launched the editor. */
  initialZoneId: string;
  /** Live card list, used to resolve the selected zone's card (deviceKey, resizability, smart-light colour). */
  devices: LightingDevice[];
  /** False hides every zone-management affordance (single-zone smart lights etc.). */
  zoneCustomizable: boolean;
  onClose: () => void;
  /** Open with the community modal already stacked on top; the device-card community badge deep-links here. */
  initialCommunityOpen?: boolean;
  /** Called after a hub composition change is confirmed. Receives the hubId so the parent can find matching devices. */
  onCompositionChanged?: (hubId: string) => void;
  /** Navigate to a device page by its unified device key; backs the hub
   * composition panel's "configure ports" deep link. */
  onNavigateToDevicePage?: (deviceKey: string) => void;
}

export function LedMapEditor({ deviceId, initialZoneId, devices, zoneCustomizable, onClose, initialCommunityOpen, onCompositionChanged, onNavigateToDevicePage }: Props) {
  const { t, language } = useTranslation();
  const { push } = useToast();

  const [structure, setStructure] = useState<DeviceStructureResponse | null>(null);
  const structureRef = useRef(structure);
  structureRef.current = structure;
  const [chainBusy, setChainBusy] = useState(false);
  const [leds, setLeds] = useState<EditorLed[]>([]);
  // Loaded state (position + disabled flag) of LEDs without a stored user
  // override: the resolved baseline a session edit can return to without
  // creating an override.
  const baselineRef = useRef<Map<number, BaselineEntry>>(new Map());
  // Snapshot of the last-saved state per device-space LED index. Anything
  // that diverges from this snapshot counts as "unsaved" and earns the
  // dashed outline in the editor; it is also what Revert restores.
  const [savedLedsMap, setSavedLedsMap] = useState<Map<number, SavedLedState>>(new Map());
  // The map as it last arrived from the service (load, preview, or the save
  // that made the current one stored). What diverges from it is LED work a
  // chain preview would replace.
  const receivedLedsRef = useRef<Map<number, ReceivedLed>>(new Map());
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hoveredLed, setHoveredLed] = useState<number | null>(null);
  // A chain the user composed but has not saved. Null means the port still
  // holds whatever was loaded. The preview that produced it is already on
  // screen, so this is only what Save has to post.
  const [stagedChain, setStagedChain] = useState<ChainEntryBody[] | null>(null);
  const stagedChainRef = useRef(stagedChain);
  stagedChainRef.current = stagedChain;

  // Drag identity per chain link, permuted with the links rather than derived
  // from their slot. dnd-kit animates a row from the position its id held to
  // the position it holds after the drop, so dragging with the positional zone
  // ids hands it back an identical list and it animates the row home again -
  // the drop then reads as two animations, the second undoing the first.
  const [chainKeys, setChainKeys] = useState<string[]>([]);
  const chainKeySeq = useRef(0);

  // Off by default: on, hand-placed LEDs land on the grid rather than a pixel
  // off one another. The pointer handlers read it through a ref because they
  // run from listeners bound once.
  const [snapGrid, setSnapGrid] = useState(false);
  const snapGridRef = useRef(snapGrid);
  snapGridRef.current = snapGrid;

  // The zone whose LEDs are editable; every other zone renders dimmed.
  const [selectedZoneId, setSelectedZoneId] = useState(initialZoneId);
  const selectedZoneIdRef = useRef(selectedZoneId);
  selectedZoneIdRef.current = selectedZoneId;
  // Zones marked for merge (modifier+click on chips). Always contains the
  // active zone after a plain selection.
  const [zoneMultiSel, setZoneMultiSel] = useState<Set<string>>(() => new Set([initialZoneId]));
  const [zonePrompt, setZonePrompt] = useState<ZonePrompt | null>(null);
  const [resetPartitionConfirm, setResetPartitionConfirm] = useState(false);
  const [resetMapConfirm, setResetMapConfirm] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [compositionConfirm, setCompositionConfirm] = useState(false);
  const [pendingCompositionPatch, setPendingCompositionPatch] = useState<HubCompositionPatch | null>(null);

  // Locally staged partition (zone split / merge / rename / reset). Replaces
  // the loaded zone list for everything the editor renders, rides the same
  // undo stack as LED edits, and only persists on Save.
  const [stagedPartition, setStagedPartition] = useState<StagedPartition | null>(null);
  const stagedPartitionRef = useRef(stagedPartition);
  stagedPartitionRef.current = stagedPartition;
  // Monotonic temp-id source for zones created by staged edits.
  const stagedIdSeqRef = useRef(0);
  const nextStagedId = useCallback(() => stagedZoneId(stagedIdSeqRef.current++), []);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragDelta, setDragDelta] = useState<{ du: number; dv: number } | null>(null);
  const [ringVfx, setRingVfx] = useState<{ id: number; u: number; v: number; kind: 'merge' | 'split' }[]>([]);
  // Ring ids: a counter, so rings spawned in one tick never share an id.
  const ringSeqRef = useRef(0);
  // Free-cursor drag for a single parked LED. The stored u,v is not useful
  // mid-drag (it's frozen at the last in-frame position); we track the
  // cursor directly and only commit a new u,v on release inside the frame.
  const [parkedDrag, setParkedDrag] = useState<{ index: number; cx: number; cy: number } | null>(null);

  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const [marqueeActive, setMarqueeActive] = useState(false);
  const marqueeAdditiveRef = useRef(false);
  const preMarqueeSelectionRef = useRef<Set<number>>(new Set());

  // The selected zone's card. Zone ids are card ids, so LED count
  // resizability, the smart-light colour, and the community deviceKey all
  // resolve through it.
  const zoneCard = devices.find(d => d.id === selectedZoneId);
  // The editor's own card, when the device is a single card the user can
  // rename. Present only once renamed - originalName is what it replaced.
  const renamed = devices.find(d => d.id === deviceId && d.originalName != null);

  // A zone's card carries the id the structure gives its zone, so a card
  // renamed on the device rail names its chip here too.
  const zoneDisplayName = (zone: { id: string; name: string }) =>
    devices.find(d => d.id === zone.id && d.originalName != null)?.name ?? zone.name;

  // Community layouts modal, stacked on top of the editor modal. Community
  // only exists for fingerprintable zones (non-empty card deviceKey);
  // custom-partition zones have empty keys so the rail button disables and
  // a requested open (deep link) is clamped shut for them.
  const [communityRequested, setCommunityRequested] = useState(initialCommunityOpen ?? false);
  const communityEnabled = (zoneCard?.deviceKey ?? '') !== '';
  const communityModalOpen = communityEnabled && communityRequested;
  const communityModalOpenRef = useRef(communityModalOpen);
  communityModalOpenRef.current = communityModalOpen;

  // Pending action (community apply / import / remove, zone switch, or a
  // partition edit) held behind the unsaved-edits confirm. Those actions
  // replace or reload the resolved map, which would silently discard any
  // unsaved edits.
  const [pendingDiscardAction, setPendingDiscardAction] = useState<(() => void) | null>(null);
  // Whether that prompt may save first and then run the action.
  const [pendingDiscardSaveable, setPendingDiscardSaveable] = useState(true);
  // While the publish dialog (community tab), a zone prompt, or any confirm
  // is open, the editor modal must ignore the Esc that closes them.
  const [communityDialogOpen, setCommunityDialogOpen] = useState(false);
  const childDialogOpenRef = useRef(false);
  childDialogOpenRef.current = zonePrompt !== null || communityDialogOpen
    || pendingDiscardAction !== null || resetPartitionConfirm || resetMapConfirm || compositionConfirm;

  const [editorMode, setEditorMode] = useState<EditorMode>('animation');

  const [devRect, setDevRect] = useState({ ...DEFAULT_DEV_RECT });
  // Selection-bbox resize: drag a corner handle to proportionally stretch
  // every selected LED relative to the fixed opposite corner.
  const [selectionResizing, setSelectionResizing] = useState(false);
  const selectionResizeRef = useRef<{
    corner: 'nw' | 'ne' | 'sw' | 'se';
    anchorU: number;
    anchorV: number;
    origU: number; // initial dragged-corner UV coords
    origV: number;
    initialLeds: Map<number, { u: number; v: number }>;
  } | null>(null);
  const [rectRatio, setRectRatio] = useState(DEFAULT_RATIO);
  // Ratio as it arrived on load. It may originate from an applied community
  // mapping rather than a stored user delta, so the save flow only sends the
  // live ratio once it diverges from this baseline.
  const loadedRatioRef = useRef(DEFAULT_RATIO);

  const ledsRef = useRef(leds);
  ledsRef.current = leds;
  const rectRatioRef = useRef(rectRatio);
  rectRatioRef.current = rectRatio;

  const [sweepPhase, setSweepPhase] = useState(0);
  const sweepStartRef = useRef(0);

  const canvasRef = useRef<HTMLDivElement>(null);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the most recent pointermove cursor position in canvas percent
  // units so pointerup / pointerleave can consult an accurate cursor even
  // if the native event arrives without coordinates (e.g. pointerLeave
  // fired after the cursor already left the canvas).
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);

  // Confirm dialog state for "close with unsaved changes" prompt.
  const [showUnsavedConfirm, setShowUnsavedConfirm] = useState(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  // ── Derived structure lookups ─────────────────────────────────────────

  const offsets = useMemo(
    () => segmentOffsets(structure?.segments ?? []),
    [structure],
  );

  // The zone list everything renders from: the staged partition when one
  // exists, the loaded partition otherwise.
  const zonesCurrent = useMemo(
    () => stagedPartition?.zones ?? structure?.zones ?? [],
    [stagedPartition, structure],
  );

  const zonesOrdered = useMemo(
    () => orderZones(zonesCurrent, offsets),
    [zonesCurrent, offsets],
  );

  // Minted only when the number of links changes - a load, an add, a remove.
  // A reorder keeps the count, so the permuted keys survive it and dnd-kit
  // sees the list it dropped into. Set during render rather than in an effect:
  // React re-runs this pass before committing, so no row is ever painted under
  // a key it is about to lose, which would remount every row on mount.
  if (chainKeys.length !== zonesOrdered.length) {
    setChainKeys(Array.from({ length: zonesOrdered.length }, () => `link-${chainKeySeq.current++}`));
  }

  const activeZone: DeviceZone | null = zonesOrdered.find(z => z.id === selectedZoneId) ?? null;

  const zoneNameById = useMemo(
    () => new Map(zonesOrdered.map(z => [z.id, z.name])),
    [zonesOrdered],
  );

  // Zone-local label per device-space index, so each zone's LEDs keep the
  // per-card numbering users know from the device list.
  const zoneLocalByDevice = useMemo(() => {
    const map = new Map<number, number>();
    for (const z of zonesOrdered) {
      zoneDeviceIndices(z, offsets).forEach((devIdx, local) => map.set(devIdx, local));
    }
    return map;
  }, [zonesOrdered, offsets]);

  const segmentTypeByIndex = useMemo(
    () => new Map((structure?.segments ?? []).map(s => [s.index, s.zoneType])),
    [structure],
  );

  // Enabled-LED count per zone for the chip labels, tracking the staged
  // editor state live as the user parks / restores LEDs.
  const enabledByZone = useMemo(() => zoneEnabledCounts(leds), [leds]);

  // Until the structure resolves there is no zone membership to scope by;
  // everything stays editable (matches single-zone devices).
  const zoneScoped = structure !== null && zonesCurrent.length > 0;
  // Reads the zone id from state, not the ref, so memos keyed on this
  // callback (hasRestorable) recompute on a clean zone switch.
  const isLedEnabled = useCallback((led: EditorLed) =>
    !zoneScoped || led.zoneId === selectedZoneId, [zoneScoped, selectedZoneId]);

  const mergeCheck = useMemo(
    () => checkMerge(zoneMultiSel, zonesCurrent, structure?.segments ?? [], offsets),
    [zoneMultiSel, zonesCurrent, structure, offsets],
  );

  // Split candidate from the current LED selection.
  const splitParts = useMemo(() => {
    if (!activeZone || saving) return null;
    return splitZone(activeZone, offsets, selected);
  }, [activeZone, saving, offsets, selected]);

  // ── Undo / redo ───────────────────────────────────────────────────────
  // Snapshots carry the LED state and the staged partition together, so one
  // undo step reverts a zone split / merge / rename / reset along with the
  // LED relabeling it caused.

  const historyRef = useRef<EditorHistory>(emptyHistory());
  const [undoLen, setUndoLen] = useState(0);
  const [redoLen, setRedoLen] = useState(0);

  /**
   * Put a previewed chain on screen. Deliberately NOT a load: the saved
   * baseline stays where it was, so the unsaved rings keep pointing at what
   * the service actually holds, and the undo history survives.
   */
  const applyPreview = useCallback((st: DeviceStructureResponse, dm: DeviceMapResponse) => {
    setStructure(st);
    const flat = flattenDeviceMap(dm);
    setLeds(flat);
    const received = new Map<number, ReceivedLed>();
    for (const l of flat) received.set(l.index, { u: l.u, v: l.v, disabled: l.disabled });
    receivedLedsRef.current = received;
    if (dm.aspectRatio > 0) setRectRatio(dm.aspectRatio);
    const offs = segmentOffsets(st.segments);
    const current = selectedZoneIdRef.current;
    const nextZone = st.zones.find(z => z.id === current) ?? orderZones(st.zones, offs)[0];
    if (nextZone) {
      setSelectedZoneId(nextZone.id);
      setZoneMultiSel(new Set([nextZone.id]));
    }
    // A selection from the previous zone list may name LEDs this one does not.
    setSelected(new Set());
  }, []);

  const snapshotCurrent = useCallback((): EditorSnapshot => ({
    leds: ledsRef.current.map(l => ({ ...l })),
    rectRatio: rectRatioRef.current,
    partition: stagedPartitionRef.current,
    chain: stagedChainRef.current,
    structure: structureRef.current,
    received: receivedLedsRef.current,
  }), []);

  const pushUndo = useCallback((snapshot: EditorSnapshot = snapshotCurrent()) => {
    historyRef.current = pushHistory(historyRef.current, snapshot, MAX_HISTORY);
    setUndoLen(historyRef.current.undo.length);
    setRedoLen(0);
  }, [snapshotCurrent]);

  // Re-anchor the zone selection after a restored or staged partition in
  // which the previously active zone id no longer exists.
  const reconcileZoneSelection = (zones: { id: string; slices: { segment: number; start: number; count: number }[] }[]) => {
    const current = selectedZoneIdRef.current;
    if (zones.some(z => z.id === current)) {
      setZoneMultiSel(new Set([current]));
      return;
    }
    const first = orderZones(zones, offsets)[0];
    if (first) {
      setSelectedZoneId(first.id);
      setZoneMultiSel(new Set([first.id]));
    }
  };

  const applyRestored = (restored: EditorSnapshot) => {
    const partitionChanged = restored.partition !== stagedPartitionRef.current;
    const chainChanged = restored.chain !== stagedChainRef.current;
    setLeds(restored.leds);
    setRectRatio(restored.rectRatio);
    setStagedPartition(restored.partition);
    receivedLedsRef.current = restored.received;
    if (chainChanged) {
      // The zone list differs, and the snapshot carries the one this chain
      // resolved to - restored directly rather than reloaded from disk, so the
      // step back to "no staged chain" keeps the unsaved LED work and the
      // history.
      setStagedChain(restored.chain);
      if (restored.structure) {
        // chainKeys re-mint themselves during render when the link count moves.
        setStructure(restored.structure);
        reconcileZoneSelection(restored.structure.zones);
        setSelected(new Set());
      }
    }
    if (partitionChanged) {
      // The LED selection may straddle zones of the other partition; the
      // active-zone invariant (selection only contains editable LEDs) is
      // cheaper to re-establish than to remap.
      setSelected(new Set());
      reconcileZoneSelection(restored.partition?.zones ?? structure?.zones ?? []);
    }
    setDirty(true);
  };

  // Both hold while a preview is in flight: the optimistic row order on
  // screen is not a state the history should capture, and the landing
  // preview would clobber whatever the step restored.
  const handleUndo = () => {
    if (chainBusy) return;
    const res = undoHistory(historyRef.current, snapshotCurrent());
    if (!res) return;
    historyRef.current = res.history;
    applyRestored(res.restored);
    setUndoLen(res.history.undo.length);
    setRedoLen(res.history.redo.length);
  };

  const handleRedo = () => {
    if (chainBusy) return;
    const res = redoHistory(historyRef.current, snapshotCurrent());
    if (!res) return;
    historyRef.current = res.history;
    applyRestored(res.restored);
    setUndoLen(res.history.undo.length);
    setRedoLen(res.history.redo.length);
  };

  // Holds the latest shortcut handlers so the keydown effect can run without
  // depending on handler identity (some of those handlers are declared further
  // down and can't be forward-referenced in a useCallback dep array).
  const shortcutHandlersRef = useRef<{
    selectAll: () => void;
    deleteSelected: () => void;
    nudge: (du: number, dv: number) => void;
    undo: () => void;
    redo: () => void;
  }>({ selectAll: () => { }, deleteSelected: () => { }, nudge: () => { }, undo: () => { }, redo: () => { } });
  // Tracks the current selection size so the capture-phase Escape handler
  // (below, near handleClose) can decide whether to clear-selection-only or
  // let Escape reach DeviceModal. Sync'd in render below.
  const selectedSizeRef = useRef(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Canvas shortcuts only act while the editor is the top modal; with the
      // community modal stacked on it a stray Delete must not park LEDs
      // behind the user's back.
      if (communityModalOpenRef.current) return;
      // Ignore keys when focus is in an editable field so the EditableNumber
      // count input and any future text inputs don't hijack arrows / delete.
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      const h = shortcutHandlersRef.current;
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.code === 'KeyA') { e.preventDefault(); h.selectAll(); return; }
      // Use e.code for Z-based shortcuts because e.key returns 'Z' (upper-
      // case) when Shift is held, which would never match 'z'. e.code is
      // layout-independent and always "KeyZ" for that physical key.
      if (mod && e.code === 'KeyZ' && !e.shiftKey) { e.preventDefault(); h.undo(); return; }
      if (mod && e.code === 'KeyZ' && e.shiftKey) { e.preventDefault(); h.redo(); return; }
      if (mod) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); h.deleteSelected(); return; }
      const step = e.shiftKey ? NUDGE_STEP_UV_COARSE : NUDGE_STEP_UV;
      if (e.key === 'ArrowLeft') { e.preventDefault(); h.nudge(-step, 0); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); h.nudge(step, 0); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); h.nudge(0, -step); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); h.nudge(0, step); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Load ──────────────────────────────────────────────────────────────

  // Latest toast closure for load() failures, so load keeps its stable
  // identity (its consumers' effects refetch when it changes) without
  // depending on the t / push identities.
  const loadFailedNoteRef = useRef(() => { });
  loadFailedNoteRef.current = () => push({ title: t('lighting.ledMap.loadFailed') });

  // Fetches structure + whole-device map. selectDeviceIndex picks the zone
  // containing that device-space LED after a partition edit (zone ids can be
  // reassigned by the service); otherwise the current selection is kept when
  // it survives, falling back to the first zone in device order.
  // silent: keep the current body on screen while refetching. A chain edit
  // re-derives zone ids server-side, so it has to reload - but swapping the
  // whole modal for the loading line on every drop reads as the modal
  // resetting under the pointer.
  const load = useCallback(async (selectDeviceIndex?: number, opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    const [rawSt, rawDm] = await Promise.all([
      fetchDeviceStructure(deviceId),
      fetchDeviceMap(deviceId),
    ]);
    // Both routes answer an unknown device with `error: true` at HTTP 200, so a
    // truthy body is not a loaded device.
    const st = rawSt?.error ? null : rawSt;
    const dm = rawDm?.error ? null : rawDm;
    // Structure and map must land together or not at all: applying one half
    // pairs the new map's zone ids with the old zone list (nothing selectable)
    // or the new counts with the old map, and the setDirty(false) below would
    // present that mismatch as saved. Keep the last good state instead.
    if (!st || !dm) {
      loadFailedNoteRef.current();
      if (!opts?.silent) setLoading(false);
      return;
    }
    setStructure(st);

    const flat = flattenDeviceMap(dm);
    setLeds(flat);
    baselineRef.current = baselineFrom(flat);
    const snap = new Map<number, SavedLedState>();
    for (const l of flat) snap.set(l.index, { u: l.u, v: l.v, disabled: l.disabled, isCustom: l.isCustom });
    setSavedLedsMap(snap);
    receivedLedsRef.current = snap;
    setRectRatio(dm.aspectRatio > 0 ? dm.aspectRatio : DEFAULT_RATIO);
    loadedRatioRef.current = dm.aspectRatio > 0 ? dm.aspectRatio : DEFAULT_RATIO;

    const offs = segmentOffsets(st.segments);
    let nextZone: DeviceZone | undefined;
    if (selectDeviceIndex !== undefined) {
      nextZone = st.zones.find(z => zoneDeviceIndices(z, offs).includes(selectDeviceIndex));
    }
    if (!nextZone) nextZone = st.zones.find(z => z.id === selectedZoneIdRef.current);
    if (!nextZone) nextZone = orderZones(st.zones, offs)[0];
    if (nextZone) {
      setSelectedZoneId(nextZone.id);
      setZoneMultiSel(new Set([nextZone.id]));
    }
    historyRef.current = emptyHistory();
    setUndoLen(0);
    setRedoLen(0);
    setStagedPartition(null);
    setStagedChain(null);
    setLoading(false);
    setDirty(false);
    setSelected(new Set());
  }, [deviceId]);

  useEffect(() => { void load(); }, [load]);

  // Per-zone editor state on the service (highlight + test pattern) follows
  // the selected zone; clear the previous zone's on switch and on unmount.
  // Staged temp ids have no service-side card, so they are skipped.
  useEffect(() => {
    const zoneId = selectedZoneId;
    return () => {
      if (!isStagedZoneId(zoneId)) clearLedEditor(zoneId);
    };
  }, [selectedZoneId]);

  // Animate the sweep line when a directional test pattern is active.
  // Phase resets to 0 on each mode activation so the UI bar starts at the
  // same position as the hardware (which also resets its phase timer when
  // the pattern POST is received, giving sub-network-latency sync).
  useEffect(() => {
    if (editorMode === 'animation' || editorMode === 'none' || selected.size > 0) {
      setSweepPhase(0);
      return;
    }
    sweepStartRef.current = performance.now();
    let raf: number;
    const tick = () => {
      setSweepPhase(((performance.now() - sweepStartRef.current) % 2000) / 2000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [editorMode, selected.size]);

  // Highlights speak the per-card protocol, so device-space indices are
  // translated to the selected zone's local space before posting. Staged
  // temp zones have no card to highlight on.
  const sendHighlight = useCallback((sel: Set<number>) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    highlightTimerRef.current = setTimeout(() => {
      if (isStagedZoneId(selectedZoneIdRef.current)) return;
      const indices = activeZone
        ? toZoneLocalIndices(activeZone, offsets, sel)
        : Array.from(sel);
      highlightLeds(selectedZoneIdRef.current, indices);
    }, 30);
  }, [activeZone, offsets]);

  useEffect(() => {
    sendHighlight(selected);
  }, [selected, sendHighlight]);

  useEffect(() => {
    if (selected.size === 0 && !isStagedZoneId(selectedZoneId)) {
      testLedPattern(selectedZoneId, editorMode);
    }
  }, [editorMode, selected.size, selectedZoneId]);

  // ── Per-zone color ────────────────────────────────────────────────────

  // Per-zone color, shown only for smart lights. Local state is degrees /
  // percent for the sliders; the service wants 0..1 floats. The card carries
  // hue/saturation as 0..1.
  const [hueDeg, setHueDeg] = useState<number>(() => (zoneCard?.hue ?? 0) * 360);
  const [satPct, setSatPct] = useState<number>(() => (zoneCard?.saturation ?? 1) * 100);
  // Latest hue/sat so a change to one slider sends the other's current value.
  const hueDegRef = useRef(hueDeg);
  hueDegRef.current = hueDeg;
  const satPctRef = useRef(satPct);
  satPctRef.current = satPct;
  const devicesRef = useRef(devices);
  devicesRef.current = devices;
  useEffect(() => {
    const card = devicesRef.current.find(d => d.id === selectedZoneId);
    setHueDeg((card?.hue ?? 0) * 360);
    setSatPct((card?.saturation ?? 1) * 100);
  }, [selectedZoneId]);
  const colorThrottle = useThrottle();
  const sendColor = useCallback(() => {
    if (isStagedZoneId(selectedZoneIdRef.current)) return;
    setLightingDeviceColor(selectedZoneIdRef.current, hueDegRef.current / 360, satPctRef.current / 100)
      .catch(() => { /* best-effort */ });
  }, []);
  const handleHueChange = useCallback((value: number) => {
    setHueDeg(value);
    hueDegRef.current = value;
    colorThrottle(sendColor);
  }, [colorThrottle, sendColor]);
  const handleSaturationChange = useCallback((value: number) => {
    setSatPct(value);
    satPctRef.current = value;
    colorThrottle(sendColor);
  }, [colorThrottle, sendColor]);

  // ── Close / discard confirms ──────────────────────────────────────────

  const showUnsavedConfirmRef = useRef(showUnsavedConfirm);
  showUnsavedConfirmRef.current = showUnsavedConfirm;
  // What the modal is called. Every rename the user made outranks the zones
  // API's name, which is always the hardware one: a card renamed on the rail,
  // a DEVICE renamed through a split card's header, or the group it sits in.
  // On a multi-zone device no card IS the device, so the device rename only
  // ever arrives on its zones as deviceName.
  const editorTitle = useMemo(() => {
    const members = devices.filter(d => (d.deviceId ?? d.id) === deviceId);
    const hardware = structure?.name?.trim()
      || renamed?.originalName?.trim()
      || members[0]?.originalName?.trim()
      || '';
    const deviceRename = members.find(d => d.deviceName)?.deviceName?.trim();
    const groupRename = members.find(d => d.parentName)?.parentName?.trim();
    const name = renamed?.name.trim() || deviceRename || hardware || members[0]?.name?.trim();
    return groupRename && name ? `${groupRename} - ${name}` : (name || t('lighting.ledMap.title'));
  }, [devices, deviceId, structure, renamed, t]);

  const handleClose = useCallback(() => {
    // Confirm dialog owns Escape while it's open - don't loop the prompt.
    // Same for the zone prompt, the community publish dialog, and the
    // stacked community modal: the Esc that closes them must not also close
    // (or confirm-close) the editor underneath.
    if (showUnsavedConfirmRef.current || childDialogOpenRef.current || communityModalOpenRef.current) return;
    if (dirtyRef.current) {
      setShowUnsavedConfirm(true);
      return;
    }
    if (!isStagedZoneId(selectedZoneIdRef.current)) clearLedEditor(selectedZoneIdRef.current);
    onClose();
  }, [onClose]);

  // DeviceModal's Escape-close is arbitrated by the shared modal stack
  // (modalStack.ts) through a bubble-phase document listener. A bubble-phase
  // listener registered here would fire after it, since document bubble
  // listeners run before window ones - too late to stop the close. A
  // capture-phase document listener runs before that bubble listener and can
  // stop propagation in time. Skipped whenever a dialog stacked above the
  // editor is open (same set handleClose checks above) - Escape belongs to
  // that surface, which arbitrates it through the same modal stack.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const target = e.target as HTMLElement | null;
      const consume = shouldConsumeEditorEscape({
        isEditableTarget: !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable),
        dialogAboveEditorOpen: showUnsavedConfirmRef.current || childDialogOpenRef.current || communityModalOpenRef.current,
        hasSelection: selectedSizeRef.current > 0,
      });
      if (!consume) return;
      e.preventDefault();
      e.stopPropagation();
      setSelected(new Set());
    };
    document.addEventListener('keydown', handler, true);
    return () => document.removeEventListener('keydown', handler, true);
  }, []);

  // Save, then leave - but only if the save actually landed, so a failed one
  // keeps the editor open with the edits intact rather than dropping them.
  const handleSaveAndClose = useCallback(() => {
    void (async () => {
      const ok = await handleSaveRef.current();
      if (!ok) return;
      setShowUnsavedConfirm(false);
      if (!isStagedZoneId(selectedZoneIdRef.current)) clearLedEditor(selectedZoneIdRef.current);
      onClose();
    })();
  }, [onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setShowUnsavedConfirm(false);
    if (!isStagedZoneId(selectedZoneIdRef.current)) clearLedEditor(selectedZoneIdRef.current);
    onClose();
  }, [onClose]);

  // Close for the stacked community modal. The Esc that closes a dialog
  // sitting above it (publish confirm, discard-edits confirm) must not also
  // close the community modal.
  const handleCommunityClose = useCallback(() => {
    if (childDialogOpenRef.current) return;
    setCommunityRequested(false);
  }, []);

  // Actions that replace or reload the resolved map (community apply /
  // import / remove, zone switch, partition edits) go through here so a
  // confirm can interpose while the editor holds unsaved edits; with a
  // clean editor the action runs immediately.
  const confirmDiscardEdits = useCallback((proceed: () => void, saveable = true) => {
    if (!dirtyRef.current) {
      proceed();
      return;
    }
    setPendingDiscardSaveable(saveable);
    setPendingDiscardAction(() => proceed);
  }, []);

  const handlePendingDiscardConfirm = useCallback(() => {
    const run = pendingDiscardAction;
    setPendingDiscardAction(null);
    run?.();
  }, [pendingDiscardAction]);

  // Save first, then do the thing that would have discarded the edits. A
  // failed save keeps both the edits and the prompt, so nothing is lost.
  const handleSaveThenPending = useCallback(() => {
    void (async () => {
      const ok = await handleSaveRef.current();
      if (!ok) return;
      const run = pendingDiscardAction;
      setPendingDiscardAction(null);
      run?.();
    })();
  }, [pendingDiscardAction]);

  // ── Zone rail actions ─────────────────────────────────────────────────
  // Split / merge / rename / reset are staged locally: they replace the
  // rendered zone list, relabel LED membership, ride the shared undo stack,
  // and only persist on Save. No partition edit discards LED edits anymore.

  const firstDeviceIndexOf = (zone: DeviceZone): number | undefined => {
    const first = zone.slices[0];
    if (!first) return undefined;
    return (offsets.get(first.segment) ?? 0) + first.start;
  };

  const stagePartition = (staged: StagedPartition | null, zones: DeviceZone[], selectZoneId?: string) => {
    pushUndo();
    setStagedPartition(staged);
    setLeds(prev => relabelLedZones(prev, zones, offsets));
    if (selectZoneId) {
      setSelectedZoneId(selectZoneId);
      setZoneMultiSel(new Set([selectZoneId]));
    } else {
      reconcileZoneSelection(zones);
    }
    setSelected(new Set());
    setDirty(true);
  };


  const handleZoneRowClick = (zoneId: string, multi: boolean) => {
    if (saving) return;
    if (multi) {
      setZoneMultiSel(prev => {
        const next = new Set(prev);
        if (next.has(zoneId)) next.delete(zoneId);
        else next.add(zoneId);
        return next;
      });
      return;
    }
    if (zoneId === selectedZoneId) {
      setZoneMultiSel(new Set([zoneId]));
      return;
    }
    setSelectedZoneId(zoneId);
    setZoneMultiSel(new Set([zoneId]));
    setSelected(new Set());
  };

  const handleMergeClick = () => {
    if (!mergeCheck.ok || saving) return;
    const members = zonesOrdered.filter(z => zoneMultiSel.has(z.id));
    if (members.length < 2) return;
    const mergedId = nextStagedId();
    const zones = mergeStagedZones(zonesCurrent, offsets, zoneMultiSel, mergedId);
    stagePartition({ kind: 'edited', zones }, zones, mergedId);
  };

  const handleSplitClick = () => {
    if (!splitParts) return;
    setZonePrompt({ mode: 'split' });
  };

  const handleZonePromptConfirm = (value: string) => {
    const prompt = zonePrompt;
    setZonePrompt(null);
    const name = value.trim();
    if (!prompt || !name || !activeZone) return;
    // The selection cannot have changed while the prompt was open, but the
    // parts are recomputed from live state to be safe.
    const parts = splitZone(activeZone, offsets, selected);
    if (!parts) return;
    const res = splitStagedZones(zonesCurrent, offsets, activeZone.id, parts, name, nextStagedId);
    stagePartition({ kind: 'edited', zones: res.zones }, res.zones, res.newZoneId);
  };

  // Staged revert-to-default. When the loaded partition already is the
  // default (staged edits sit on top of it), clearing the staged partition
  // restores it exactly and Save posts nothing for zones; otherwise the
  // reset is staged as a partition DELETE and the rail renders a
  // client-side default approximation until the post-save refetch.
  const handleResetPartitionConfirm = () => {
    setResetPartitionConfirm(false);
    if (!structure) return;
    const zones = defaultPartitionGuess(structure, nextStagedId);
    const staged: StagedPartition | null = structure.isDefaultPartition ? null : { kind: 'reset', zones };
    stagePartition(staged, zones);
  };

  // ── Canvas geometry ───────────────────────────────────────────────────

  const getCanvasPercent = (e: React.PointerEvent) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    };
  };

  const getPadPercent = useCallback(() => {
    if (!canvasRef.current) return { px: 0, py: 0 };
    const r = canvasRef.current.getBoundingClientRect();
    return {
      px: (RECT_PAD_PX / r.width) * 100,
      py: (RECT_PAD_PX / r.height) * 100,
    };
  }, []);

  const uvToCanvas = useCallback((u: number, v: number) => {
    const pad = getPadPercent();
    return {
      cx: devRect.x + pad.px + u * (devRect.w - 2 * pad.px),
      cy: devRect.y + pad.py + v * (devRect.h - 2 * pad.py),
    };
  }, [devRect, getPadPercent]);

  const canvasToUv = useCallback((cx: number, cy: number) => {
    const pad = getPadPercent();
    const innerW = devRect.w - 2 * pad.px;
    const innerH = devRect.h - 2 * pad.py;
    return {
      u: innerW > 0 ? (cx - devRect.x - pad.px) / innerW : 0,
      v: innerH > 0 ? (cy - devRect.y - pad.py) / innerH : 0,
    };
  }, [devRect, getPadPercent]);

  // Canvas-space point a given LED occupies. Disabled LEDs don't live at
  // their stored u,v - they sit in the "parking row" just below the device
  // frame at equidistant horizontal positions. LED indices remain the same
  // so the user can see which number maps to which parked circle.
  // disabledOrder: the sorted list of disabled LED indices in the current
  // map, so each disabled LED knows its slot + the total number of slots.
  // snapTarget: when set, overrides the drag-adjusted UV (live snap preview).
  const getLedCanvasPos = useCallback((led: EditorLed, dragOverride?: { du: number; dv: number }, snapTarget?: { u: number; v: number } | null) => {
    if (parkedDrag && parkedDrag.index === led.index) {
      return { cx: parkedDrag.cx, cy: parkedDrag.cy };
    }
    // A removed LED is not drawn at all: the canvas is only the grid now, and
    // the count plus the restore button below it is what says they exist.
    if (led.disabled) {
      return null;
    }
    let u = led.u;
    let v = led.v;
    if (dragOverride && selected.has(led.index)) {
      if (snapTarget) {
        u = snapTarget.u;
        v = snapTarget.v;
      } else {
        u = Math.max(0, Math.min(1, u + dragOverride.du));
        v = Math.max(0, Math.min(1, v + dragOverride.dv));
      }
    }
    return uvToCanvas(u, v);
  }, [uvToCanvas, selected, parkedDrag]);

  // Canvas point is "inside the device frame" when within the padded inner
  // rect. Used to decide whether a dragged LED should be re-enabled (dropped
  // inside) or parked (dropped outside).
  const isInsideFrame = useCallback((cx: number, cy: number) => {
    const pad = getPadPercent();
    return cx >= devRect.x + pad.px && cx <= devRect.x + devRect.w - pad.px
      && cy >= devRect.y + pad.py && cy <= devRect.y + devRect.h - pad.py;
  }, [devRect, getPadPercent]);

  const computeMarqueeSelection = useCallback((m: { x1: number; y1: number; x2: number; y2: number }) => {
    const minX = Math.min(m.x1, m.x2);
    const maxX = Math.max(m.x1, m.x2);
    const minY = Math.min(m.y1, m.y2);
    const maxY = Math.max(m.y1, m.y2);

    // Compute the parked row slots inline so the marquee can hit-test them
    // Removed LEDs are off the canvas entirely, so a lasso cannot reach one.
    const inBox = new Set<number>();
    for (const led of leds) {
      if (!isLedEnabled(led) || led.disabled) continue;
      const { cx, cy } = uvToCanvas(led.u, led.v);
      if (cx >= minX && cx <= maxX && cy >= minY && cy <= maxY) {
        inBox.add(led.index);
      }
    }

    const groups = ledGroupsRef.current;
    const expanded = new Set<number>();
    for (const idx of inBox) {
      const members = groups.get(idx);
      if (members && members.length > 1) {
        for (const m of members) expanded.add(m);
      } else {
        expanded.add(idx);
      }
    }

    if (marqueeAdditiveRef.current) {
      const merged = new Set(preMarqueeSelectionRef.current);
      for (const idx of expanded) merged.add(idx);
      return merged;
    }
    return expanded;
  }, [leds, uvToCanvas, isLedEnabled]);

  const handleLedPointerDown = (e: React.PointerEvent, ledIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    // Capture the pointer on the canvas so drag-out-bottom (auto-park) and
    // parked-drag-back-in fire a real pointerup event with correct coords
    // instead of pointerLeave with stale / missing coords.
    if (canvasRef.current) {
      try { canvasRef.current.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    lastPointerRef.current = getCanvasPercent(e);

    const led = leds.find(l => l.index === ledIndex);
    if (led && !isLedEnabled(led)) return;

    if (isMultiSelectModifier(e)) {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(ledIndex)) next.delete(ledIndex);
        else next.add(ledIndex);
        return next;
      });
      return;
    }

    // Parked LEDs drag with free cursor tracking so the user can drop one
    // back in the frame without having to predict where its stale (u,v)
    // ended up. Group drags don't work on parked LEDs - the typical flow
    // is "delete many, drag back one by one" and preserving group semantics
    // would collide with the free-tracking model.
    if (led && led.disabled) {
      pushUndo();
      setSelected(new Set([ledIndex]));
      const { x: cx, y: cy } = getCanvasPercent(e);
      setParkedDrag({ index: ledIndex, cx, cy });
      return;
    }

    const groupMembers = ledGroupsRef.current.get(ledIndex);
    if (groupMembers && groupMembers.length > 1 && !selected.has(ledIndex)) {
      setSelected(new Set(groupMembers));
    } else if (!selected.has(ledIndex)) {
      setSelected(new Set([ledIndex]));
    }

    pushUndo();
    setDragging(true);
    setDragStart(getCanvasPercent(e));
    setDragDelta(null);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).dataset.led) return;
    if ((e.target as HTMLElement).dataset.selectionHandle) return;
    const { x: px, y: py } = getCanvasPercent(e);

    const additive = isMultiSelectModifier(e);
    marqueeAdditiveRef.current = additive;
    preMarqueeSelectionRef.current = additive ? new Set(selected) : new Set();

    if (!additive) {
      setSelected(new Set());
    }

    setMarquee({ x1: px, y1: py, x2: px, y2: py });
    setMarqueeActive(true);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const cursor = getCanvasPercent(e);
    lastPointerRef.current = cursor;
    if (parkedDrag) {
      setParkedDrag({ ...parkedDrag, cx: cursor.x, cy: cursor.y });
      return;
    }

    if (selectionResizing && selectionResizeRef.current) {
      const { anchorU, anchorV, origU, origV, initialLeds } = selectionResizeRef.current;
      const { x: px, y: py } = getCanvasPercent(e);
      const { u: newU, v: newV } = canvasToUv(px, py);
      const origW = origU - anchorU;
      const origH = origV - anchorV;
      const newW = newU - anchorU;
      const newH = newV - anchorV;
      // Avoid divide-by-zero when the selection started as a single LED
      // (origW or origH == 0). Fall back to a no-op in that axis so the
      // other axis still stretches if there's width/height there.
      const sx = Math.abs(origW) > 0.001 ? newW / origW : 1;
      const sy = Math.abs(origH) > 0.001 ? newH / origH : 1;
      setLeds(prev => prev.map(l => {
        const init = initialLeds.get(l.index);
        if (!init) return l;
        const u = Math.max(0, Math.min(1, anchorU + (init.u - anchorU) * sx));
        const v = Math.max(0, Math.min(1, anchorV + (init.v - anchorV) * sy));
        return { ...l, u, v, isCustom: true };
      }));
      return;
    }

    if (marqueeActive && marquee) {
      const { x: px, y: py } = getCanvasPercent(e);
      const updated = { ...marquee, x2: px, y2: py };
      setMarquee(updated);
      setSelected(computeMarqueeSelection(updated));
      return;
    }

    if (!dragging || !dragStart) return;
    const { x: px, y: py } = getCanvasPercent(e);
    const dPx = px - dragStart.x;
    const dPy = py - dragStart.y;
    const pad = getPadPercent();
    const innerW = devRect.w - 2 * pad.px;
    const innerH = devRect.h - 2 * pad.py;
    const du = innerW > 0 ? dPx / innerW : 0;
    const dv = innerH > 0 ? dPy / innerH : 0;
    setDragDelta({ du, dv });
  };

  const handlePointerUp = (e?: React.PointerEvent) => {
    // Always use the most-recent pointermove cursor as the source of
    // truth for release position. pointerLeave fires without coordinates
    // in some browsers, and even when it does have them they can be
    // outside the canvas viewport; the last-pointermove snapshot is
    // accurate for the in-canvas trajectory we care about.
    const cursor = e ? getCanvasPercent(e) : lastPointerRef.current;

    if (parkedDrag) {
      // Prefer the event's cursor when available; fall back to the last
      // tracked position. parkedDrag already stores the last pointermove
      // cx/cy, but an event-provided release point is more exact.
      const cx = cursor ? cursor.x : parkedDrag.cx;
      const cy = cursor ? cursor.y : parkedDrag.cy;
      const ledIndex = parkedDrag.index;
      setParkedDrag(null);
      if (isInsideFrame(cx, cy)) {
        const { u, v } = canvasToUv(cx, cy);
        setLeds(prev => prev.map(l =>
          l.index === ledIndex
            ? { ...l, disabled: false, u: Math.max(0, Math.min(1, u)), v: Math.max(0, Math.min(1, v)), isCustom: true }
            : l,
        ));
        setDirty(true);
      }
      return;
    }

    if (selectionResizing) {
      setSelectionResizing(false);
      selectionResizeRef.current = null;
      setDirty(true);
      return;
    }

    if (marqueeActive) {
      setMarquee(null);
      setMarqueeActive(false);
      return;
    }

    if (dragging && dragDelta && selected.size > 0) {
      const pastBottom = cursor !== null && cursor.y > devRect.y + devRect.h;
      const currentSelected = selected;
      const currentDelta = dragDelta;
      setLeds(prev => {
        const others = prev.filter(l => !currentSelected.has(l.index) && !l.disabled);
        const moved = prev
          .filter(l => currentSelected.has(l.index) && !l.disabled)
          .map(l => ({
            u: Math.max(0, Math.min(1, l.u + currentDelta.du)),
            v: Math.max(0, Math.min(1, l.v + currentDelta.dv)),
          }));
        // One offset for the whole selection, so the arrangement inside it
        // survives the snap; a lone LED snaps itself below. A snap that would
        // put a member on another LED's point is dropped: only the Group
        // action makes a group.
        let groupAdjust = currentSelected.size > 1
          ? selectionSnapAdjust(moved, snapGridRef.current)
          : { du: 0, dv: 0 };
        if (moved.some(m => others.some(o => onSamePoint({ u: m.u + groupAdjust.du, v: m.v + groupAdjust.dv }, o)))) {
          groupAdjust = { du: 0, dv: 0 };
        }
        return prev.map(led => {
          if (!currentSelected.has(led.index)) return led;
          if (pastBottom) {
            return { ...led, disabled: true, isCustom: true };
          }
          let snapU = Math.max(0, Math.min(1, led.u + currentDelta.du));
          let snapV = Math.max(0, Math.min(1, led.v + currentDelta.dv));
          if (currentSelected.size > 1) {
            snapU = Math.max(0, Math.min(1, snapU + groupAdjust.du));
            snapV = Math.max(0, Math.min(1, snapV + groupAdjust.dv));
          } else {
            const settled = settleLed(snapU, snapV, snapGridRef.current);
            if (!others.some(o => onSamePoint(settled, o))) {
              snapU = settled.u;
              snapV = settled.v;
            }
          }
          return { ...led, u: snapU, v: snapV, isCustom: true };
        });
      });
      setDirty(true);
    }
    setDragging(false);
    setDragStart(null);
    setDragDelta(null);
  };

  const handleSelectionCornerDown = (e: React.PointerEvent, corner: 'nw' | 'ne' | 'sw' | 'se') => {
    e.preventDefault();
    e.stopPropagation();
    const bounds = getSelectionUvBounds();
    if (!bounds) return;
    pushUndo();
    // Anchor = opposite corner. Dragging NE stretches toward the north-east,
    // keeping the SW corner pinned; LEDs scale relative to that fixed corner.
    const anchorU = corner === 'nw' || corner === 'sw' ? bounds.maxU : bounds.minU;
    const anchorV = corner === 'nw' || corner === 'ne' ? bounds.maxV : bounds.minV;
    const origU = corner === 'nw' || corner === 'sw' ? bounds.minU : bounds.maxU;
    const origV = corner === 'nw' || corner === 'ne' ? bounds.minV : bounds.maxV;
    const initialLeds = new Map<number, { u: number; v: number }>();
    for (const l of leds) {
      if (selected.has(l.index)) initialLeds.set(l.index, { u: l.u, v: l.v });
    }
    selectionResizeRef.current = { corner, anchorU, anchorV, origU, origV, initialLeds };
    setSelectionResizing(true);
  };

  // ── Save / revert ─────────────────────────────────────────────────────

  /** True when everything the plan asked for landed, so a caller can close behind it. */
  const handleSave = async (): Promise<boolean> => {
    setSaving(true);

    // The map body builder keeps applied-mapping state (mapping-disabled
    // LEDs, mapping ratio) out of the user delta: only LEDs the user owns
    // (isCustom) and a ratio the user adjusted this session are posted, as
    // segment-local overrides.
    const plan = buildSavePlan({
      staged: stagedPartitionRef.current,
      offsets,
      leds,
      baseline: baselineRef.current,
      rectRatio,
      loadedRatio: loadedRatioRef.current,
    });
    // Device-space anchor for re-selecting the active zone after the
    // service reassigns zone ids on a partition change.
    const selIdx = activeZone ? firstDeviceIndexOf(activeZone) : undefined;

    // The chain writes the port's partition, its LED count and a mapping per
    // product, so it goes first and makes any staged partition moot: the zones
    // the user sees ARE the chain.
    const chain = stagedChainRef.current;
    if (chain) {
      const chainResp = await setDeviceChain(deviceId, chain);
      if (!chainResp || chainResp.error) {
        setSaving(false);
        push({ title: t('lighting.ledMap.assignFailed') });
        return false;
      }
      setStagedChain(null);
    }

    if (plan.partition && !chain) {
      // Partition first: the service drops per-zone prefs / layouts and
      // reassigns zone ids on a partition change, so the map overrides must
      // land after it. The body is id-free, so a failed-then-retried save
      // re-posts the same partition without harm.
      const zonesResp = plan.partition.kind === 'reset'
        ? await resetDeviceZones(deviceId)
        : await saveDeviceZones(deviceId, plan.partition.zones);
      if (!zonesResp || zonesResp.error) {
        setSaving(false);
        push({ title: t('lighting.ledMap.zonesUpdateFailed') });
        return false;
      }
      // The partition is persisted now; commit it client-side BEFORE the
      // map POST so a map failure cannot leave the editor holding staged
      // zones (and dead zone ids) for a partition that already landed. The
      // refetched structure carries the service-assigned ids every live
      // per-card call (highlight, test pattern, brightness, clear) uses
      // from here on.
      const stResp = await fetchDeviceStructure(deviceId);
      const st = stResp?.error ? null : stResp;
      if (st) {
        setStructure(st);
        const offs = segmentOffsets(st.segments);
        setLeds(prev => relabelLedZones(prev, st.zones, offs));
        // A staged reset's zone shapes were a client-side guess, so the
        // LED selection may straddle the real zones; clearing it is the
        // cheap way to re-establish the active-zone invariant.
        setSelected(new Set());
        let nextZone = selIdx !== undefined
          ? st.zones.find(z => zoneDeviceIndices(z, offs).includes(selIdx))
          : undefined;
        if (!nextZone) nextZone = orderZones(st.zones, offs)[0];
        if (nextZone) {
          setSelectedZoneId(nextZone.id);
          setZoneMultiSel(new Set([nextZone.id]));
        }
        // History snapshots reference pre-partition zone ids that no longer
        // exist; drop them with the staged partition rather than let an
        // undo resurrect a server-committed partition.
        setStagedPartition(null);
        historyRef.current = emptyHistory();
        setUndoLen(0);
        setRedoLen(0);
      } else {
        // Without the refreshed structure the new zone ids are unknowable;
        // keep the partition staged so a retry re-posts it (id-free,
        // harmless) and the post-save reload restores the real ids. History
        // still drops: snapshots carry the partition, so an undo would swap
        // the staged value away from what the server already committed.
        historyRef.current = emptyHistory();
        setUndoLen(0);
        setRedoLen(0);
        loadFailedNoteRef.current();
      }
    }
    const resp = await saveDeviceMap(deviceId, plan.map.overrides, plan.map.aspectRatio);
    // On failure keep the dirty state and snapshots untouched so the
    // unsaved map delta stays marked and a retry posts it again. With a
    // partition already committed above only the map delta remains staged,
    // and the toast says so.
    if (!resp || resp.error) {
      setSaving(false);
      push({
        title: t(plan.partition ? 'lighting.ledMap.zonesSavedMapFailed' : 'lighting.ledMap.saveFailed'),
      });
      return false;
    }
    if (plan.partition || chain) {
      // Full reload: per-zone prefs / layouts were dropped with the
      // partition, so the resolved baseline may have changed too.
      await load(selIdx);
      setSaving(false);
      return true;
    }
    // What was just sent is now the stored baseline.
    if (plan.map.aspectRatio > 0) loadedRatioRef.current = plan.map.aspectRatio;
    // Re-snapshot so the dashed "unsaved" rings disappear now that what the
    // user sees matches what the service has persisted.
    const snap = new Map<number, SavedLedState>();
    for (const l of leds) snap.set(l.index, { u: l.u, v: l.v, disabled: l.disabled, isCustom: l.isCustom });
    setSavedLedsMap(snap);
    receivedLedsRef.current = snap;
    setSaving(false);
    setDirty(false);
    clearTimeout(previewTimerRef.current);
    if (!isStagedZoneId(selectedZoneIdRef.current)) clearLedEditor(selectedZoneIdRef.current);
    return true;
  };

  // handleSave is redefined every render; the close prompt's Save is a stable
  // callback, so it reaches the current one through a ref.
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;

  // ── Live preview push ─────────────────────────────────────────────────

  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (loading || saving) return;
    if (isStagedZoneId(selectedZoneIdRef.current)) return;
    const zoneId = selectedZoneIdRef.current;
    const zoneLeds = zoneScoped
      ? leds.filter(l => l.zoneId === zoneId)
      : leds;
    const ledCount = zoneLeds.length;
    clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      if (isStagedZoneId(selectedZoneIdRef.current)) return;
      postLedPreviewLayout(
        selectedZoneIdRef.current,
        ledCount,
        zoneLeds.map(l => ({ index: l.index, u: l.u, v: l.v, disabled: l.disabled })),
      ).catch(() => { /* best-effort */ });
    }, 80);
    return () => clearTimeout(previewTimerRef.current);
  }, [leds, selectedZoneId, loading, saving, zoneScoped]);

  // ── Chain (what is wired to a port) ───────────────────────────────────
  // Every edit re-posts the whole chain: a pick, a retyped count, an added or
  // removed zone. The service rebuilds the port's zones and cards from it, so
  // the editor reloads rather than patching its own copy.
  // The staged list wins once there is one: its fromOrdinals point at the chain
  // on DISK, and re-deriving them from the previewed structure would renumber
  // them to the staged order, so a rename would stop following its device.
  const chainEntries = useCallback((): ChainEntryBody[] =>
    // A copy: callers edit the array in place, and the staged one is held by
    // the history snapshots.
    stagedChainRef.current?.slice()
      ?? (structure?.chain ?? []).map((e, i) => e.editableCount
        ? { key: e.key, ledCount: e.ledCount, fromOrdinal: i }
        : { key: e.key, fromOrdinal: i }), [structure]);
  /**
   * Show what a chain would do without committing it. The product geometry is
   * built in the service, so this still round-trips - but it writes nothing,
   * which is what lets a chain edit ride the undo stack and be abandoned by
   * closing the editor. Save is what posts it. The undo snapshot is taken
   * before the round trip: a caller that has already moved rows on screen
   * passes the one it took first, or undo would restore that mix.
   */
  const applyChain = useCallback(async (entries: ChainEntryBody[], snapshot: EditorSnapshot = snapshotCurrent()): Promise<boolean> => {
    setChainBusy(true);
    const resp = await previewDeviceChain(deviceId, entries);
    setChainBusy(false);
    if (!resp || resp.error || !resp.structure || !resp.map) {
      push({ title: t('lighting.ledMap.assignFailed') });
      return false;
    }
    pushUndo(snapshot);
    applyPreview(resp.structure, resp.map);
    setStagedChain(entries);
    setDirty(true);
    return true;
  }, [deviceId, push, t, pushUndo, applyPreview, snapshotCurrent]);

  // A preview re-seeds the whole map from the service, so LED work done since
  // the last map arrived goes with it (undo brings it back). Only that work
  // earns the prompt: a staged chain on its own does not.
  const confirmChainEdit = (proceed: () => void) => {
    const received = receivedLedsRef.current;
    const edited = leds.some(l => {
      const r = received.get(l.index);
      return !r || Math.abs(l.u - r.u) > SAME_POSITION_EPSILON || Math.abs(l.v - r.v) > SAME_POSITION_EPSILON || l.disabled !== r.disabled;
    });
    // No Save in this prompt: the entries were derived from the chain on
    // disk, and a save would move that chain under their ordinals.
    if (edited) confirmDiscardEdits(proceed, false);
    else proceed();
  };

  // Factory reset: the service drops the device's stored LED overrides and
  // aspect ratio, then the editor refetches structure + map. load() keeps
  // the current zone selection when it still exists and clears the dirty
  // flag, the LED selection, and the undo history; the device rect returns
  // to its default shape since the stored ratio is gone.
  const handleResetMapConfirm = () => {
    setResetMapConfirm(false);
    void (async () => {
      setResetBusy(true);
      const resp = await resetDeviceMap(deviceId);
      if (!resp || resp.error) {
        setResetBusy(false);
        push({ title: t('lighting.ledMap.resetFailed') });
        return;
      }
      await load();
      setDevRect({ ...DEFAULT_DEV_RECT });
      setResetBusy(false);
    })();
  };

  // ── Multi-select group ops ────────────────────────────────────────────
  // All three reshape the selected LEDs in UV space. Sort by LED index so
  // "arrange 0-N in a strip / grid" respects the firmware ordering, which is
  // what users are usually trying to match with the physical hardware.
  const getSelectedSorted = useCallback((): EditorLed[] => {
    // Disabled LEDs don't participate in bbox / align / rotate operations -
    // their "position" is the parking slot, not a real (u,v) the user cares
    // about. Restoring them is the one way to bring them back into ops.
    return leds.filter(l => selected.has(l.index) && !l.disabled).sort((a, b) => a.index - b.index);
  }, [leds, selected]);

  const getSelectionUvBounds = useCallback((): { minU: number; maxU: number; minV: number; maxV: number } | null => {
    const sel = leds.filter(l => selected.has(l.index) && !l.disabled);
    if (sel.length === 0) return null;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const l of sel) {
      if (l.u < minU) minU = l.u;
      if (l.u > maxU) maxU = l.u;
      if (l.v < minV) minV = l.v;
      if (l.v > maxV) maxV = l.v;
    }
    // Pad the bbox outward: a sparse selection's tight bbox can be
    // microscopic, piling aligned LEDs on one point. A constant pad
    // gives align-grid / align-strip room to spread.
    const p = SELECTION_BBOX_PAD_UV;
    return {
      minU: Math.max(0, minU - p),
      maxU: Math.min(1, maxU + p),
      minV: Math.max(0, minV - p),
      maxV: Math.min(1, maxV + p),
    };
  }, [leds, selected]);

  const handleAlignHorizontal = useCallback(() => {
    const sel = getSelectedSorted();
    if (sel.length < 2) return;
    const bounds = getSelectionUvBounds();
    if (!bounds) return;
    pushUndo();
    const midV = (bounds.minV + bounds.maxV) / 2;
    const span = bounds.maxU - bounds.minU;
    const step = sel.length > 1 ? span / (sel.length - 1) : 0;
    const byIndex = new Map<number, { u: number; v: number }>();
    sel.forEach((led, i) => {
      byIndex.set(led.index, { u: bounds.minU + step * i, v: midV });
    });
    setLeds(prev => prev.map(l => {
      const p = byIndex.get(l.index);
      return p ? { ...l, u: p.u, v: p.v, isCustom: true } : l;
    }));
    setDirty(true);
  }, [getSelectedSorted, getSelectionUvBounds, pushUndo]);

  const handleAlignGrid = useCallback(() => {
    const sel = getSelectedSorted();
    if (sel.length < 2) return;
    const bounds = getSelectionUvBounds();
    if (!bounds) return;
    pushUndo();
    const n = sel.length;
    // Prefer wider-than-tall grids since device rects usually are.
    const cols = Math.max(1, Math.ceil(Math.sqrt(n)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const spanU = bounds.maxU - bounds.minU;
    const spanV = bounds.maxV - bounds.minV;
    const stepU = cols > 1 ? spanU / (cols - 1) : 0;
    const stepV = rows > 1 ? spanV / (rows - 1) : 0;
    const byIndex = new Map<number, { u: number; v: number }>();
    sel.forEach((led, i) => {
      const r = Math.floor(i / cols);
      const c = i % cols;
      byIndex.set(led.index, {
        u: cols > 1 ? bounds.minU + stepU * c : (bounds.minU + bounds.maxU) / 2,
        v: rows > 1 ? bounds.minV + stepV * r : (bounds.minV + bounds.maxV) / 2,
      });
    });
    setLeds(prev => prev.map(l => {
      const p = byIndex.get(l.index);
      return p ? { ...l, u: p.u, v: p.v, isCustom: true } : l;
    }));
    setDirty(true);
  }, [getSelectedSorted, getSelectionUvBounds, pushUndo]);

  const handleAlignCircle = useCallback(() => {
    const sel = getSelectedSorted();
    if (sel.length < 2) return;
    const bounds = getSelectionUvBounds();
    if (!bounds) return;
    pushUndo();
    const cu = (bounds.minU + bounds.maxU) / 2;
    const cv = (bounds.minV + bounds.maxV) / 2;
    // Aspect-correct so LEDs land on a visually round circle. With
    // ar = rectRatio = width/height, one u-unit spans ar v-units worth of
    // pixels, so a v-space radius rV equals a u-space radius rV/ar. rV is the
    // largest radius (in v-units) that fits the selection in both axes:
    // min(du/2 * ar, dv/2). Mirrors the correction in handleRotate90.
    const ar = Math.max(0.01, rectRatio);
    const rV = Math.min((bounds.maxU - bounds.minU) / 2 * ar, (bounds.maxV - bounds.minV) / 2);
    const rU = rV / ar;
    const byIndex = new Map<number, { u: number; v: number }>();
    sel.forEach((led, i) => {
      // Start at the top (angle -PI/2) and go clockwise.
      const angle = (2 * Math.PI * i) / sel.length - Math.PI / 2;
      byIndex.set(led.index, {
        u: Math.max(0, Math.min(1, cu + Math.cos(angle) * rU)),
        v: Math.max(0, Math.min(1, cv + Math.sin(angle) * rV)),
      });
    });
    setLeds(prev => prev.map(l => {
      const p = byIndex.get(l.index);
      return p ? { ...l, u: p.u, v: p.v, isCustom: true } : l;
    }));
    setDirty(true);
  }, [getSelectedSorted, getSelectionUvBounds, pushUndo, rectRatio]);

  const handleCompositionChangeRequest = useCallback((patch: HubCompositionPatch) => {
    setPendingCompositionPatch(patch);
    setCompositionConfirm(true);
  }, []);

  const handleCompositionConfirm = useCallback(async () => {
    const hub = structure?.hubComposition;
    const patch = pendingCompositionPatch;
    if (!hub || !patch) return;
    setCompositionConfirm(false);
    setPendingCompositionPatch(null);
    const result = await setHubComposition(hub.hubKind, patch);
    if (!result || result.error) {
      push({ title: t('lighting.ledMap.hubCompositionFailed') });
      return;
    }
    onCompositionChanged?.(hub.hubId);
  }, [structure, pendingCompositionPatch, onCompositionChanged, push, t]);

  // Deep link to the Lian Li device page (per-port fan counts live there and
  // drive this LED composition). Routed through the unsaved-edits guard so a
  // mid-edit navigation does not silently drop LED overrides.
  const handleOpenHubDeviceSettings = useCallback(() => {
    confirmDiscardEdits(() => onNavigateToDevicePage?.('curated-lianli'));
  }, [confirmDiscardEdits, onNavigateToDevicePage]);

  const handleDeleteSelected = useCallback(() => {
    if (selected.size === 0) return;
    pushUndo();
    setLeds(prev => prev.map(l =>
      selected.has(l.index) && !l.disabled
        ? { ...l, disabled: true, isCustom: true }
        : l,
    ));
    setDirty(true);
  }, [selected, pushUndo]);

  const handleRestoreSelected = useCallback(() => {
    if (selected.size === 0) return;
    pushUndo();
    // Re-enable at the LED's stored u,v; parked drag-back-in is the way to
    // pick an exact new spot.
    setLeds(prev => prev.map(l =>
      selected.has(l.index) && l.disabled
        ? { ...l, disabled: false, isCustom: true }
        : l,
    ));
    setDirty(true);
  }, [selected, pushUndo]);

  const handleFlipH = useCallback(() => {
    const sel = leds.filter(l => selected.has(l.index) && !l.disabled);
    if (sel.length < 2) return;
    const bounds = getSelectionUvBounds();
    if (!bounds) return;
    pushUndo();
    const mid = (bounds.minU + bounds.maxU) / 2;
    setLeds(prev => prev.map(l =>
      selected.has(l.index) && !l.disabled
        ? { ...l, u: Math.max(0, Math.min(1, 2 * mid - l.u)), isCustom: true }
        : l,
    ));
    setDirty(true);
  }, [leds, selected, getSelectionUvBounds, pushUndo]);

  const handleFlipV = useCallback(() => {
    const sel = leds.filter(l => selected.has(l.index) && !l.disabled);
    if (sel.length < 2) return;
    const bounds = getSelectionUvBounds();
    if (!bounds) return;
    pushUndo();
    const mid = (bounds.minV + bounds.maxV) / 2;
    setLeds(prev => prev.map(l =>
      selected.has(l.index) && !l.disabled
        ? { ...l, v: Math.max(0, Math.min(1, 2 * mid - l.v)), isCustom: true }
        : l,
    ));
    setDirty(true);
  }, [leds, selected, getSelectionUvBounds, pushUndo]);

  const handleResetSelected = useCallback(() => {
    if (selected.size === 0) return;
    pushUndo();
    setLeds(prev => prev.map(l => {
      if (!selected.has(l.index)) return l;
      const s = savedLedsMap.get(l.index);
      return s ? { ...l, u: s.u, v: s.v, disabled: s.disabled, isCustom: s.isCustom } : l;
    }));
    setDirty(true);
  }, [selected, savedLedsMap, pushUndo]);

  const handleSelectAll = useCallback(() => {
    setSelected(new Set(leds.filter(l => isLedEnabled(l)).map(l => l.index)));
  }, [leds, isLedEnabled]);

  const handleRestoreAll = useCallback(() => {
    pushUndo();
    setLeds(prev => prev.map(l => {
      if (!l.disabled || !isLedEnabled(l)) return l;
      return { ...l, disabled: false, isCustom: true };
    }));
    setDirty(true);
  }, [pushUndo, isLedEnabled]);

  // Any parked LED at all keeps the parking-row separator visible; the
  // restore-all affordance only counts the editable zone's parked LEDs.
  const removedCount = useMemo(() => leds.filter(l => l.disabled && isLedEnabled(l)).length, [leds, isLedEnabled]);
  const mappingUnavailable = leds.length > MAX_MAPPABLE_LEDS;

  // Set of LED indices that differ from the last-saved snapshot. Only these
  // render with the dashed "unsaved change" ring; persisted customisations
  // look normal after Save.
  const unsavedLedSet = useMemo(() => {
    const s = new Set<number>();
    for (const l of leds) {
      const saved = savedLedsMap.get(l.index);
      if (!saved) {
        s.add(l.index);
        continue;
      }
      if (Math.abs(l.u - saved.u) > 0.0001
        || Math.abs(l.v - saved.v) > 0.0001
        || l.disabled !== saved.disabled) {
        s.add(l.index);
      }
    }
    return s;
  }, [leds, savedLedsMap]);

  // Maps each enabled LED index to its group members (enabled LEDs on the
  // same point, which only the Group action produces). Size-1 arrays = lone LED.
  const ledGroups = useMemo(() => {
    const enabledLeds = leds.filter(l => !l.disabled && isLedEnabled(l));
    const groupOf = new Map<number, number[]>();
    const groups: { rep: number; u: number; v: number; members: number[] }[] = [];
    for (const led of enabledLeds) {
      let assigned = false;
      for (const g of groups) {
        const du = led.u - g.u;
        const dv = led.v - g.v;
        if (Math.abs(du) < CO_LOCATED_EPSILON && Math.abs(dv) < CO_LOCATED_EPSILON) {
          g.members.push(led.index);
          assigned = true;
          break;
        }
      }
      if (!assigned) {
        groups.push({ rep: led.index, u: led.u, v: led.v, members: [led.index] });
      }
    }
    for (const g of groups) {
      for (const idx of g.members) {
        groupOf.set(idx, g.members);
      }
    }
    return groupOf;
  }, [leds, isLedEnabled]);

  const ledGroupsRef = useRef(ledGroups);
  ledGroupsRef.current = ledGroups;

  // Nudge selected LEDs by a small UV step. Shift = coarser step. Only
  // moves LEDs that are currently in the frame; parked LEDs need to be
  // dragged back before they can be nudged.
  const handleNudge = useCallback((du: number, dv: number) => {
    if (selected.size === 0) return;
    pushUndo();
    setLeds(prev => prev.map(l => {
      if (!selected.has(l.index) || l.disabled) return l;
      return {
        ...l,
        u: Math.max(0, Math.min(1, l.u + du)),
        v: Math.max(0, Math.min(1, l.v + dv)),
        isCustom: true,
      };
    }));
    setDirty(true);
  }, [selected, pushUndo]);

  const handleGroupSplit = useCallback((members: number[], centerU: number, centerV: number) => {
    pushUndo();
    const n = members.length;
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.5)));
    const rows = Math.max(1, Math.ceil(n / cols));
    const spreadU = Math.min(0.06, Math.min(centerU, 1 - centerU));
    const spreadV = Math.min(0.06, Math.min(centerV, 1 - centerV));
    const sortedMembers = [...members].sort((a, b) => a - b);
    const newPositions = new Map<number, { u: number; v: number }>();
    sortedMembers.forEach((idx, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      newPositions.set(idx, {
        u: cols > 1 ? centerU - spreadU + (c / (cols - 1)) * 2 * spreadU : centerU,
        v: rows > 1 ? centerV - spreadV + (r / (rows - 1)) * 2 * spreadV : centerV,
      });
    });
    setLeds(prev => prev.map(l => {
      const p = newPositions.get(l.index);
      return p ? { ...l, u: p.u, v: p.v, isCustom: true } : l;
    }));
    setDirty(true);
    setRingVfx(prev => [...prev, { id: ++ringSeqRef.current, u: centerU, v: centerV, kind: 'split' }]);
  }, [pushUndo]);

  const handleGroupSelected = useCallback(() => {
    const sel = leds.filter(l => selected.has(l.index) && !l.disabled);
    if (sel.length < 2) return;
    const centroidU = Math.max(0, Math.min(1, sel.reduce((s, l) => s + l.u, 0) / sel.length));
    const centroidV = Math.max(0, Math.min(1, sel.reduce((s, l) => s + l.v, 0) / sel.length));
    pushUndo();
    setLeds(prev => prev.map(l => {
      if (!selected.has(l.index) || l.disabled) return l;
      return { ...l, u: centroidU, v: centroidV, isCustom: true };
    }));
    setDirty(true);
    setRingVfx(prev => [...prev, { id: ++ringSeqRef.current, u: centroidU, v: centroidV, kind: 'merge' }]);
  }, [leds, selected, pushUndo]);

  const handleRotate90 = useCallback(() => {
    const sel = leds.filter(l => selected.has(l.index) && !l.disabled);
    if (sel.length < 2) return;
    pushUndo();
    // Rotate around the selection's UV centroid with aspect correction so the
    // visual rotation on the canvas matches a real 90 degree turn. Aspect
    // factor = device rect's visible width / height (px, taking rectRatio).
    const cu = sel.reduce((s, l) => s + l.u, 0) / sel.length;
    const cv = sel.reduce((s, l) => s + l.v, 0) / sel.length;
    // rectRatio is w/h of the device rect within the canvas.
    const ar = Math.max(0.01, rectRatio);
    const byIndex = new Map<number, { u: number; v: number }>();
    for (const l of sel) {
      const du = l.u - cu;
      const dv = l.v - cv;
      // 90 deg CW in screen coords (y-down): (x, y) -> (-y, x), with aspect
      // conversion between u (scaled by ar) and v.
      const nu = cu - dv / ar;
      const nv = cv + du * ar;
      byIndex.set(l.index, { u: nu, v: nv });
    }
    // Clamp + recenter: if the rotated bbox fell outside [0, 1], shift the
    // whole group so its min corner sits at >= 0 (preserving the rotation).
    let minNu = Infinity, maxNu = -Infinity, minNv = Infinity, maxNv = -Infinity;
    for (const p of byIndex.values()) {
      if (p.u < minNu) minNu = p.u;
      if (p.u > maxNu) maxNu = p.u;
      if (p.v < minNv) minNv = p.v;
      if (p.v > maxNv) maxNv = p.v;
    }
    let shiftU = 0, shiftV = 0;
    if (minNu < 0) shiftU = -minNu;
    else if (maxNu > 1) shiftU = 1 - maxNu;
    if (minNv < 0) shiftV = -minNv;
    else if (maxNv > 1) shiftV = 1 - maxNv;
    if (shiftU !== 0 || shiftV !== 0) {
      for (const [k, p] of byIndex) byIndex.set(k, { u: p.u + shiftU, v: p.v + shiftV });
    }
    setLeds(prev => prev.map(l => {
      const p = byIndex.get(l.index);
      return p
        ? { ...l, u: Math.max(0, Math.min(1, p.u)), v: Math.max(0, Math.min(1, p.v)), isCustom: true }
        : l;
    }));
    setDirty(true);
  }, [leds, selected, rectRatio, pushUndo]);

  // Canvas-space bbox for the floating selection toolbar. Uses the padded
  // UV bbox from getSelectionUvBounds so the visible box matches the area
  // that align-strip / align-grid / rotate will spread the LEDs into.
  const selectionCanvasBounds = useMemo(() => {
    const sel = leds.filter(l => selected.has(l.index) && !l.disabled);
    if (sel.length < 2) return null;
    const bounds = getSelectionUvBounds();
    if (!bounds) return null;
    const tl = uvToCanvas(bounds.minU, bounds.minV);
    const br = uvToCanvas(bounds.maxU, bounds.maxV);
    return { minX: tl.cx, maxX: br.cx, minY: tl.cy, maxY: br.cy };
  }, [leds, selected, getSelectionUvBounds, uvToCanvas]);

  // Show the selection toolbar whenever at least one LED is selected (even
  // a single parked LED gets the trash + restore affordance so group-of-1
  // deletes work). The anchor is the selection bbox when available, else
  // the last LED's canvas position as a fallback.
  const selectionToolbarAnchor = useMemo(() => {
    if (selectionCanvasBounds) return { cx: selectionCanvasBounds.maxX, cy: selectionCanvasBounds.minY };
    if (selected.size === 0) return null;
    const anyLed = leds.find(l => selected.has(l.index));
    if (!anyLed) return null;
    const pos = getLedCanvasPos(anyLed);
    if (!pos) return null;
    return { cx: pos.cx + 3, cy: pos.cy - 3 };
  }, [selectionCanvasBounds, selected, leds, getLedCanvasPos]);

  // Any selected LED that's currently parked -> show the Restore button
  // in the selection toolbar. Any selected LED that's currently enabled ->
  // show the Delete button. Both can appear at once when a mixed selection
  // is active.
  const hasEnabledSelected = useMemo(
    () => leds.some(l => selected.has(l.index) && !l.disabled),
    [leds, selected],
  );
  const hasDisabledSelected = useMemo(
    () => leds.some(l => selected.has(l.index) && l.disabled),
    [leds, selected],
  );

  const hoveredEntry = hoveredLed !== null ? leds.find(l => l.index === hoveredLed) : null;

  // Re-bind shortcut handlers every render so the keydown listener always
  // calls the current closures (which depend on selected / leds / pushUndo
  // identities). Declared here, after every handler useCallback, so all
  // references resolve.
  shortcutHandlersRef.current = {
    selectAll: handleSelectAll,
    deleteSelected: handleDeleteSelected,
    nudge: handleNudge,
    undo: handleUndo,
    redo: handleRedo,
  };
  selectedSizeRef.current = selected.size;

  // Where the selected LEDs sit mid-drag, before any snap. Both the snap
  // adjustment and the anchor dot are derived from this one list.
  const draggedSelectionPoints = useMemo(() => {
    if (!dragging || !dragDelta || selected.size <= 1) return [];
    const pts: { u: number; v: number }[] = [];
    for (const led of leds) {
      if (!selected.has(led.index) || led.disabled) continue;
      pts.push({
        u: Math.max(0, Math.min(1, led.u + dragDelta.du)),
        v: Math.max(0, Math.min(1, led.v + dragDelta.dv)),
      });
    }
    return pts;
  }, [dragging, dragDelta, selected, leds]);

  // The point that actually snaps for a multi-LED drag, so the user can see
  // what the grid is pulling.
  const selectionAnchor = useMemo(() => {
    if (draggedSelectionPoints.length <= 1) return null;
    const center = selectionCenter(draggedSelectionPoints);
    if (!center) return null;
    const adj = selectionSnapAdjust(draggedSelectionPoints, snapGrid);
    return { u: center.u + adj.du, v: center.v + adj.dv };
  }, [draggedSelectionPoints, snapGrid]);

  // The preview shows the same snap the drop will make, guard included.
  const getLedPosition = (led: EditorLed) => {
    const dragOverride = dragging && dragDelta ? dragDelta : undefined;
    let snapTarget: { u: number; v: number } | null = null;
    if (dragOverride && selected.has(led.index)) {
      const newU = Math.max(0, Math.min(1, led.u + dragOverride.du));
      const newV = Math.max(0, Math.min(1, led.v + dragOverride.dv));
      const others = leds.filter(l => !selected.has(l.index) && !l.disabled);
      if (selected.size <= 1) {
        const settled = settleLed(newU, newV, snapGrid);
        if ((settled.u !== newU || settled.v !== newV) && !others.some(o => onSamePoint(settled, o))) snapTarget = settled;
      } else if (snapGrid) {
        // Every member shifts by the same amount, the one that puts the
        // selection's centre on the grid.
        const adj = selectionSnapAdjust(draggedSelectionPoints, true);
        const clear = !draggedSelectionPoints.some(m => others.some(o => onSamePoint({ u: m.u + adj.du, v: m.v + adj.dv }, o)));
        if ((adj.du !== 0 || adj.dv !== 0) && clear) {
          snapTarget = {
            u: Math.max(0, Math.min(1, newU + adj.du)),
            v: Math.max(0, Math.min(1, newV + adj.dv)),
          };
        }
      }
    }
    return getLedCanvasPos(led, dragOverride, snapTarget);
  };

  const ledTypeClass = (led: EditorLed) => {
    const type = segmentTypeByIndex.get(led.segment);
    if (type === 'matrix') return styles.ledMatrix;
    if (type === 'single') return styles.ledSingle;
    return styles.ledLinear;
  };

  const modes: { key: EditorMode; label: string }[] = [
    { key: 'animation', label: t('lighting.ledMap.modeAnim') },
    { key: 'horizontal', label: t('lighting.ledMap.testH') },
    { key: 'vertical', label: t('lighting.ledMap.testV') },
    { key: 'none', label: t('lighting.ledMap.modeNone') },
  ];

  const mergeTooltip = mergeCheck.ok
    ? t('lighting.ledMap.zoneMerge')
    : mergeCheck.reason === 'wall'
      ? t('lighting.ledMap.zoneMergeWall')
      : mergeCheck.reason === 'adjacency'
        ? t('lighting.ledMap.zoneMergeAdjacentOnly')
        : t('lighting.ledMap.zoneMergeHint', { mod: isMac ? 'Cmd' : 'Ctrl' });

  // Rows follow the resolved zones in wire order, the chain alongside them; a
  // chained row is named by its product, the way the port lists it. Before the
  // structure resolves the card is the one zone, at its own count.
  const chainable = structure?.chainable === true && zonesOrdered.length > 0;
  const chainRows: ChainRow[] = zonesOrdered.length > 0
    ? zonesOrdered.map((z, i) => {
        const link = chainable ? structure?.chain?.[i] : undefined;
        // Off a chain, a resizable zone's count IS the hardware zone size, and
        // this row is the only place left to set it (NP50, MiniHub ports 1-2,
        // Q-series are resizable but not partitionable, so they carry no chain).
        const resizable = !chainable && devices.find(d => d.id === z.id)?.zoneResizable === true;
        return {
          zoneId: z.id,
          rowKey: chainKeys[i] ?? z.id,
          name: link?.name ?? zoneDisplayName(z),
          ledCount: zoneLedCount(z),
          enabledCount: enabledByZone.get(z.id) ?? 0,
          key: link?.key,
          editableCount: chainable ? link?.editableCount === true : resizable,
          resizable,
        };
      })
    : zoneCard
      ? [{ zoneId: zoneCard.id, rowKey: zoneCard.id, name: zoneCard.name, ledCount: zoneCard.ledCount, enabledCount: zoneCard.ledCount, editableCount: false }]
      : [];

  // A resizable zone off a chain: the count is the hardware zone's size, so it
  // round-trips through the resize route and reloads. Destructive to unsaved
  // LED work (the service re-seeds the map at the new count), hence the prompt.
  const handleZoneResize = (index: number, count: number) => {
    const row = chainRows[index];
    if (!row) return;
    confirmDiscardEdits(() => {
      void (async () => {
        setChainBusy(true);
        const resp = await setZoneLedCount(row.zoneId, count) as ApiEnvelope | null;
        setChainBusy(false);
        if (!resp || resp.error) {
          push({ title: t('lighting.ledMap.zonesUpdateFailed') });
          return;
        }
        await load();
      })();
    });
  };

  // Drag/keyboard reorder of the chain rows: the same entries the chain
  // already posts, in the dropped-to row order.
  const handleChainReorder = (rowKeys: string[]) => {
    const order = chainRows.map(r => r.rowKey);
    const reordered = reorderChainEntries(chainEntries(), order, rowKeys);
    if (!reordered) return;
    confirmChainEdit(() => {
      // Taken before the rows move, so undo lands on the pre-drag editor.
      const snapshot = snapshotCurrent();
      const priorChain = structure?.chain;
      const priorSelected = selectedZoneId;
      // Move the rows now: the preview is a round trip, and leaving them in
      // the old order until it lands reads as the drag having been rejected.
      const rowOrder = reorderChainEntries(structure?.chain ?? [], order, rowKeys);
      if (rowOrder) setStructure(prev => (prev ? { ...prev, chain: rowOrder } : prev));
      const keyOrder = reorderChainEntries(order, order, rowKeys);
      if (keyOrder) setChainKeys(keyOrder);
      // Zone ids stay put while their products move between them, so the
      // selection has to be re-pointed at the slot the selected device landed
      // in; without this the highlight stays behind on whatever moved into
      // its old slot.
      const from = chainRows.findIndex(r => r.zoneId === selectedZoneId);
      const to = from === -1 ? -1 : rowKeys.indexOf(order[from]);
      const landed = to === -1 ? undefined : chainRows[to];
      if (landed) {
        setSelectedZoneId(landed.zoneId);
        setZoneMultiSel(new Set([landed.zoneId]));
      }
      void applyChain(reordered, snapshot).then(ok => {
        if (ok) return;
        // The rows moved but the zones did not: put them back together.
        if (priorChain) setStructure(prev => (prev ? { ...prev, chain: priorChain } : prev));
        setChainKeys(order);
        setSelectedZoneId(priorSelected);
        setZoneMultiSel(new Set([priorSelected]));
      });
    });
  };

  const showZoneTools = zoneCustomizable && zonesOrdered.length > 0;

  // Reset-zones visibility: hidden once a reset is already staged; shown for
  // staged edits (revert them to the default) and for a loaded custom
  // partition.
  const canResetPartition = stagedPartition
    ? stagedPartition.kind === 'edited'
    : structure !== null && !structure.isDefaultPartition;

  return (
    <DeviceModal
      open
      onClose={handleClose}
      title={editorTitle}
      wide
    >
      {loading ? (
        <div className={styles.loading}>{t('lighting.ledMap.title')}...</div>
      ) : (
        <div className={styles.content}>
          {structure?.hubComposition && (
            <HubCompositionPanel
              composition={structure.hubComposition}
              onChange={handleCompositionChangeRequest}
              fanCount={
                structure.hubComposition.hubKind === 'lianli'
                  ? Math.round((structure.segments[0]?.ledCount ?? 0) / LIANLI_LEDS_PER_FAN)
                  : undefined
              }
              onOpenDeviceSettings={
                onNavigateToDevicePage && structure.hubComposition.hubKind === 'lianli'
                  ? handleOpenHubDeviceSettings
                  : undefined
              }
            />
          )}
          <div className={styles.layout}>
          <div className={styles.sidebar}>
          {/* The zone list is also the port's wiring: on a chainable port each
              row picks what sits at that position, so there is no separate
              assign row or LED count field. */}
          <ZoneChainList
            rows={chainRows}
            chainable={chainable}
            selectedZoneId={selectedZoneId}
            markedIds={zoneMultiSel}
            disabled={saving || chainBusy}
            onSelect={handleZoneRowClick}
            onChange={(i, entry) => {
              // Retyping a count leaves the same device in the slot, so its
              // rename stays; picking a different product replaces it.
              const entries = chainEntries();
              const prev = entries[i];
              entries[i] = prev?.key === entry.key ? { ...entry, fromOrdinal: prev.fromOrdinal } : entry;
              confirmChainEdit(() => { void applyChain(entries); });
            }}
            onAdd={entry => confirmChainEdit(() => { void applyChain([...chainEntries(), entry]); })}
            onRemove={i => confirmChainEdit(() => { void applyChain(chainEntries().filter((_, j) => j !== i)); })}
            onResize={handleZoneResize}
            maxLedCount={structure?.segments?.[0]?.maxLedCount ?? 0}
            onReorder={handleChainReorder}
            actions={showZoneTools ? (
              <>
                {/* Partition tools stay off a chainable port: the chain is its
                    partition. */}
                {!chainable && (
                  <>
                    <HoverTooltip body={mergeTooltip} side="top">
                      <button
                        type="button"
                        className={styles.iconBtn}
                        disabled={!mergeCheck.ok || saving}
                        aria-label={t('lighting.ledMap.zoneMerge')}
                        onClick={handleMergeClick}
                      >
                        <Merge size={13} />
                      </button>
                    </HoverTooltip>
                    <HoverTooltip
                      body={splitParts ? t('lighting.ledMap.zoneSplit') : t('lighting.ledMap.zoneSplitHint')}
                      side="top"
                    >
                      <button
                        type="button"
                        className={styles.iconBtn}
                        disabled={!splitParts}
                        aria-label={t('lighting.ledMap.zoneSplit')}
                        onClick={handleSplitClick}
                      >
                        <Scissors size={13} />
                      </button>
                    </HoverTooltip>
                    {canResetPartition && (
                      <HoverTooltip body={t('lighting.ledMap.zoneResetPartition')} side="top">
                        <button
                          type="button"
                          className={styles.iconBtn}
                          disabled={saving}
                          aria-label={t('lighting.ledMap.zoneResetPartition')}
                          onClick={() => setResetPartitionConfirm(true)}
                        >
                          <ListRestart size={13} />
                        </button>
                      </HoverTooltip>
                    )}
                  </>
                )}
                {/* Community layouts for the selected zone, in a modal stacked
                    on the editor. Zones without a deviceKey (custom partitions,
                    staged temp zones) cannot be fingerprinted, so the button
                    disables with an explanatory tooltip for them. */}
                {COMMUNITY_BUTTON && (
                  <>
                    <div className={styles.separator} />
                    <HoverTooltip
                      body={communityEnabled ? t('lighting.ledMap.community') : t('lighting.ledMap.communityUnavailable')}
                      side="top"
                    >
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.communityBtn}`}
                        disabled={!communityEnabled || saving}
                        aria-label={t('lighting.ledMap.community')}
                        onClick={() => setCommunityRequested(true)}
                      >
                        <Users size={13} aria-hidden />
                        {t('lighting.ledMap.community')}
                      </button>
                    </HoverTooltip>
                  </>
                )}
              </>
            ) : undefined}
          />
          </div>
          <div className={styles.canvasColumn}>
          {/* Preview + selection tooling above the canvas, as two compact
              grouped sections: test pattern toggles (plus a smart light's own
              colour) on the left, select all / clear selection on the right.
              Brightness and the colour trims live in the Color tuning modal,
              which can act on several devices at once. */}
          <div className={styles.controlsRow}>
            <div className={styles.controlGroup}>
              <div className={styles.modeBtns}>
                <span className={styles.modeBtnsLabel}>{t('lighting.ledMap.testSection')}</span>
                {modes.map(m => (
                  <button
                    key={m.key}
                    type="button"
                    className={`${styles.modeBtn} ${editorMode === m.key ? styles.modeBtnActive : ''}`}
                    onClick={() => setEditorMode(m.key)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              {isSmartLightId(selectedZoneId) && (
                <>
                  <div className={styles.separator} />
                  <div className={styles.brightnessField}>
                    <Palette size={14} strokeWidth={1.7} className={styles.brightnessIcon} aria-hidden />
                    <Slider
                      value={hueDeg}
                      min={0}
                      max={360}
                      step={1}
                      // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
                      orientation="bare"
                      onChange={handleHueChange}
                      onCommit={handleHueChange}
                      trackFill
                      disabled={!zoneCard}
                      ariaLabel={t('lighting.devices.hue')}
                      className={styles.brightnessTrack}
                    />
                    <span className={styles.brightnessValue}>{hueDeg}°</span>
                  </div>
                  <div className={styles.brightnessField}>
                    <Droplet size={14} strokeWidth={1.7} className={styles.brightnessIcon} aria-hidden />
                    <Slider
                      value={satPct}
                      min={0}
                      max={100}
                      step={1}
                      // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
                      orientation="bare"
                      onChange={handleSaturationChange}
                      onCommit={handleSaturationChange}
                      trackFill
                      disabled={!zoneCard}
                      ariaLabel={t('lighting.devices.saturation')}
                      className={styles.brightnessTrack}
                    />
                    <span className={styles.brightnessValue}>{satPct}%</span>
                  </div>
                </>
              )}
            </div>
            <div className={styles.spacer} />
            <div className={styles.controlGroup}>
              {/* Off by default: a mapping traced from a photo puts LEDs where
                  the hardware has them, not on grid points. */}
              <HoverTooltip body={t('lighting.ledMap.snapToGridHint')} side="bottom">
                <button
                  type="button"
                  className={`${styles.iconBtn} ${snapGrid ? styles.iconBtnActive : ''}`}
                  onClick={() => setSnapGrid(v => !v)}
                  aria-pressed={snapGrid}
                  aria-label={t('lighting.ledMap.snapToGrid')}
                >
                  <Grid3x3 size={15} />
                </button>
              </HoverTooltip>
              <div className={styles.separator} />
              {/* eslint-disable-next-line i18next/no-literal-string -- keyboard modifier key label */}
              <HoverTooltip body={`${t('lighting.ledMap.selectAll')} (${isMac ? 'Cmd' : 'Ctrl'}+A)`} side="bottom">
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={handleSelectAll}
                  aria-label={t('lighting.ledMap.selectAll')}
                >
                  <CheckSquare size={15} />
                </button>
              </HoverTooltip>
              <HoverTooltip body={`${t('lighting.ledMap.selectNone')} (Esc)`} side="bottom">
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => setSelected(new Set())}
                  disabled={selected.size === 0}
                  aria-label={t('lighting.ledMap.selectNone')}
                >
                  <Square size={15} />
                </button>
              </HoverTooltip>
              <div className={styles.separator} />
              {/* Reset, then history: the same order the lighting presets use. */}
              <HoverTooltip body={t('lighting.ledMap.reset')} side="bottom">
                <button
                  type="button"
                  className={styles.iconBtn}
                  onClick={() => setResetMapConfirm(true)}
                  disabled={resetBusy}
                  aria-label={t('lighting.ledMap.reset')}
                >
                  <RotateCcw size={15} />
                </button>
              </HoverTooltip>
              <div className={styles.separator} />
              {/* eslint-disable-next-line i18next/no-literal-string -- keyboard modifier key label */}
              <HoverTooltip body={`${t('lighting.ledMap.undo')} (${isMac ? 'Cmd' : 'Ctrl'}+Z)`} side="bottom">
                <button type="button" className={styles.iconBtn} onClick={handleUndo} disabled={undoLen === 0 || chainBusy} aria-label={t('lighting.ledMap.undo')}>
                  <Undo2 size={15} />
                </button>
              </HoverTooltip>
              {/* eslint-disable-next-line i18next/no-literal-string -- keyboard modifier key label */}
              <HoverTooltip body={`${t('lighting.ledMap.redo')} (${isMac ? 'Cmd' : 'Ctrl'}+Shift+Z)`} side="bottom">
                <button type="button" className={styles.iconBtn} onClick={handleRedo} disabled={redoLen === 0 || chainBusy} aria-label={t('lighting.ledMap.redo')}>
                  <Redo2 size={15} />
                </button>
              </HoverTooltip>
            </div>
          </div>

          <div
            ref={canvasRef}
            className={styles.canvas}
            style={{ aspectRatio: String(CANVAS_RATIO), ['--grid-cols' as string]: GRID_COLS, ['--grid-rows' as string]: GRID_ROWS }}
            onPointerDown={mappingUnavailable ? undefined : handleCanvasPointerDown}
            onPointerMove={mappingUnavailable ? undefined : handlePointerMove}
            onPointerUp={mappingUnavailable ? undefined : (e => handlePointerUp(e))}
            onPointerLeave={mappingUnavailable ? undefined : (() => handlePointerUp())}
          >
            {mappingUnavailable && (
              <div className={styles.mappingUnavailable} role="status">
                <span className={styles.mappingUnavailableTitle}>
                  {t('lighting.ledMap.unavailableTitle')}
                </span>
                <span className={styles.mappingUnavailableBody}>
                  {t('lighting.ledMap.unavailableBody', { max: MAX_MAPPABLE_LEDS })}
                </span>
              </div>
            )}
            {!mappingUnavailable && (
            <>
            {/* The frame's centre, which is what a layout gets centred on. */}
            <div
              className={styles.centerGuideV}
              style={{
                left: `${devRect.x + devRect.w / 2}%`,
                top: `${devRect.y}%`,
                height: `${devRect.h}%`,
              }}
            />
            <div
              className={styles.centerGuideH}
              style={{
                top: `${devRect.y + devRect.h / 2}%`,
                left: `${devRect.x}%`,
                width: `${devRect.w}%`,
              }}
            />
            <div
              className={styles.deviceRect}
              style={{
                left: `${devRect.x}%`,
                top: `${devRect.y}%`,
                width: `${devRect.w}%`,
                height: `${devRect.h}%`,
              }}
            >
            </div>

            {(() => {
              const rendered = new Set<number>();
              const elements: React.ReactElement[] = [];
              for (const led of leds) {
                const enabled = isLedEnabled(led);
                const members = ledGroups.get(led.index);
                if (enabled && !led.disabled && members && members.length > 1) {
                  const repIdx = Math.min(...members);
                  if (rendered.has(repIdx)) continue;
                  rendered.add(repIdx);
                  const repLed = leds.find(l => l.index === repIdx)!;
                  const repPos = getLedPosition(repLed);
                  if (!repPos) continue;
                  const { cx, cy } = repPos;
                  const isSelected = members.every(m => selected.has(m));
                  const isDraggingGroup = dragging && members.some(m => selected.has(m));
                  const isUnsaved = members.some(m => unsavedLedSet.has(m));
                  elements.push(
                    <div
                      key={repIdx}
                      data-led="1"
                      className={[
                        styles.led,
                        styles.ledGroup,
                        ledTypeClass(repLed),
                        isUnsaved ? styles.ledCustom : '',
                        isSelected ? styles.ledSelected : '',
                        isDraggingGroup ? styles.ledDragging : '',
                      ].filter(Boolean).join(' ')}
                      style={{ left: `${cx}%`, top: `${cy}%` }}
                      onPointerDown={e => handleLedPointerDown(e, repIdx)}
                      onPointerEnter={() => setHoveredLed(repIdx)}
                      onPointerLeave={() => setHoveredLed(null)}
                      aria-label={t('lighting.ledMap.groupCount', { count: members.length })}
                    >
                      <Lightbulb size={14} aria-hidden className={styles.ledGroupIcon} />
                      <span className={styles.ledGroupBadge} aria-hidden>{members.length}</span>
                    </div>
                  );
                  continue;
                }
                const ledPos = getLedPosition(led);
                if (!ledPos) continue;
                const { cx, cy } = ledPos;
                const isSelected = selected.has(led.index);
                const beingParkedDragged = parkedDrag?.index === led.index;
                elements.push(
                  <div
                    key={led.index}
                    data-led="1"
                    className={[
                      styles.led,
                      ledTypeClass(led),
                      unsavedLedSet.has(led.index) ? styles.ledCustom : '',
                      isSelected ? styles.ledSelected : '',
                      (dragging && isSelected) || beingParkedDragged ? styles.ledDragging : '',
                      led.disabled ? styles.ledParked : '',
                      !enabled ? styles.ledDisabled : '',
                    ].filter(Boolean).join(' ')}
                    style={{ left: `${cx}%`, top: `${cy}%` }}
                    onPointerDown={e => handleLedPointerDown(e, led.index)}
                    onPointerEnter={() => setHoveredLed(led.index)}
                    onPointerLeave={() => setHoveredLed(null)}
                  >
                    <span className={styles.ledIndex} aria-hidden>
                      {(zoneLocalByDevice.get(led.index) ?? led.index) + 1}
                    </span>
                  </div>
                );
              }
              return elements;
            })()}
            </>
            )}

            {!mappingUnavailable && selectionCanvasBounds && (
              /* Selection bbox outline + 4 corner resize handles. Dragging a
                 handle proportionally stretches every selected LED toward
                 the opposite (anchored) corner. Only shown for multi-LED
                 in-frame selections where stretching makes sense. */
              <div
                className={styles.selectionBox}
                style={{
                  left: `${selectionCanvasBounds.minX}%`,
                  top: `${selectionCanvasBounds.minY}%`,
                  width: `${selectionCanvasBounds.maxX - selectionCanvasBounds.minX}%`,
                  height: `${selectionCanvasBounds.maxY - selectionCanvasBounds.minY}%`,
                }}
              >
                {(['nw', 'ne', 'sw', 'se'] as const).map(c => (
                  <div
                    key={c}
                    data-selection-handle="1"
                    className={`${styles.selectionHandle} ${SELECTION_HANDLE_CLASS[c]}`}
                    onPointerDown={e => handleSelectionCornerDown(e, c)}
                  />
                ))}
              </div>
            )}
            {selectionToolbarAnchor && (
              <div
                className={styles.selectionToolbar}
                style={{
                  left: `${selectionToolbarAnchor.cx}%`,
                  top: `${selectionToolbarAnchor.cy}%`,
                  // The canvas clips, so a selection near an edge anchors from
                  // the other side instead of hanging off it. Thresholds are
                  // the toolbar's own footprint as a share of the canvas.
                  ['--sel-toolbar-x' as string]: selectionToolbarAnchor.cx < TOOLBAR_FLIP_X_PCT ? '0%' : '-100%',
                  ['--sel-toolbar-y' as string]: selectionToolbarAnchor.cy < TOOLBAR_FLIP_Y_PCT ? '0%' : '-100%',
                }}
                onPointerDown={e => e.stopPropagation()}
              >
                {selectionCanvasBounds && (
                  <>
                    <HoverTooltip body={t('lighting.ledMap.alignHorizontal')} side="top">
                      <button
                        type="button"
                        className={styles.selectionBtn}
                        onClick={handleAlignHorizontal}
                        aria-label={t('lighting.ledMap.alignHorizontal')}
                      >
                        <AlignHorizontalDistributeCenter size={14} />
                      </button>
                    </HoverTooltip>
                    <HoverTooltip body={t('lighting.ledMap.alignGrid')} side="top">
                      <button
                        type="button"
                        className={styles.selectionBtn}
                        onClick={handleAlignGrid}
                        aria-label={t('lighting.ledMap.alignGrid')}
                      >
                        <Grid3x3 size={14} />
                      </button>
                    </HoverTooltip>
                    <HoverTooltip body={t('lighting.ledMap.alignCircle')} side="top">
                      <button
                        type="button"
                        className={styles.selectionBtn}
                        onClick={handleAlignCircle}
                        aria-label={t('lighting.ledMap.alignCircle')}
                      >
                        <CircleDot size={14} />
                      </button>
                    </HoverTooltip>
                    <HoverTooltip body={t('lighting.ledMap.rotate90')} side="top">
                      <button
                        type="button"
                        className={styles.selectionBtn}
                        onClick={handleRotate90}
                        aria-label={t('lighting.ledMap.rotate90')}
                      >
                        <RotateCw size={14} />
                      </button>
                    </HoverTooltip>
                    <HoverTooltip body={t('lighting.ledMap.flipH')} side="top">
                      <button
                        type="button"
                        className={styles.selectionBtn}
                        onClick={handleFlipH}
                        aria-label={t('lighting.ledMap.flipH')}
                      >
                        <FlipHorizontal2 size={14} />
                      </button>
                    </HoverTooltip>
                    <HoverTooltip body={t('lighting.ledMap.flipV')} side="top">
                      <button
                        type="button"
                        className={styles.selectionBtn}
                        onClick={handleFlipV}
                        aria-label={t('lighting.ledMap.flipV')}
                      >
                        <FlipVertical2 size={14} />
                      </button>
                    </HoverTooltip>
                    <HoverTooltip body={t('lighting.ledMap.resetSelected')} side="top">
                      <button
                        type="button"
                        className={styles.selectionBtn}
                        onClick={handleResetSelected}
                        aria-label={t('lighting.ledMap.resetSelected')}
                      >
                        <RotateCcw size={14} />
                      </button>
                    </HoverTooltip>
                    <div className={styles.selectionBtnSeparator} />
                    {(() => {
                      const selArr = Array.from(selected);
                      const members = ledGroupsRef.current.get(selArr[0]);
                      const isAlreadyGroup = !!(
                        selArr.length >= 2 &&
                        members &&
                        members.length >= 2 &&
                        selArr.length === members.length &&
                        selArr.every(idx => members.includes(idx))
                      );
                      const showGroup = selectionCanvasBounds != null && !isAlreadyGroup;
                      const showUngroup = isAlreadyGroup;
                      return (
                        <>
                          {showGroup && (
                            <HoverTooltip body={t('lighting.ledMap.group')} side="top">
                              <button
                                type="button"
                                className={styles.selectionBtn}
                                onClick={handleGroupSelected}
                                aria-label={t('lighting.ledMap.group')}
                              >
                                <Merge size={14} />
                              </button>
                            </HoverTooltip>
                          )}
                          {showUngroup && (() => {
                            const repLed = leds.find(l => l.index === Math.min(...(members ?? [])));
                            if (!repLed || !members) return null;
                            return (
                              <HoverTooltip body={t('lighting.ledMap.ungroup')} side="top">
                                <button
                                  type="button"
                                  className={styles.selectionBtn}
                                  onClick={() => handleGroupSplit(members, repLed.u, repLed.v)}
                                  aria-label={t('lighting.ledMap.ungroup')}
                                >
                                  <Scissors size={14} />
                                </button>
                              </HoverTooltip>
                            );
                          })()}
                        </>
                      );
                    })()}
                  </>
                )}
                {hasEnabledSelected && (
                  <HoverTooltip body={`${t('lighting.ledMap.delete')} (Del)`} side="top">
                    <button
                      type="button"
                      className={`${styles.selectionBtn} ${styles.selectionBtnDanger}`}
                      onClick={handleDeleteSelected}
                      aria-label={t('lighting.ledMap.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </HoverTooltip>
                )}
                {hasDisabledSelected && (
                  <HoverTooltip body={t('lighting.ledMap.restore')} side="top">
                    <button
                      type="button"
                      className={styles.selectionBtn}
                      onClick={handleRestoreSelected}
                      aria-label={t('lighting.ledMap.restore')}
                    >
                      <RotateCcw size={14} />
                    </button>
                  </HoverTooltip>
                )}
              </div>
            )}

            {/* Sweep line overlay - visual indicator synced to the hardware pattern */}
            {(editorMode === 'horizontal' || editorMode === 'vertical') && selected.size === 0 && sweepPhase > 0 && (() => {
              const pad = canvasRef.current ? {
                px: (RECT_PAD_PX / canvasRef.current.getBoundingClientRect().width) * 100,
                py: (RECT_PAD_PX / canvasRef.current.getBoundingClientRect().height) * 100,
              } : { px: 0, py: 0 };
              const innerX = devRect.x + pad.px;
              const innerY = devRect.y + pad.py;
              const innerW = devRect.w - 2 * pad.px;
              const innerH = devRect.h - 2 * pad.py;

              if (editorMode === 'horizontal') {
                const x = innerX + sweepPhase * innerW;
                return <div className={styles.sweepLine} style={{ left: `${x}%`, top: `${innerY}%`, width: '2px', height: `${innerH}%` }} />;
              }
              if (editorMode === 'vertical') {
                const y = innerY + sweepPhase * innerH;
                return <div className={styles.sweepLine} style={{ left: `${innerX}%`, top: `${y}%`, width: `${innerW}%`, height: '2px' }} />;
              }
              return null;
            })()}

            {marquee && (
              <div
                className={styles.marquee}
                style={{
                  left: `${Math.min(marquee.x1, marquee.x2)}%`,
                  top: `${Math.min(marquee.y1, marquee.y2)}%`,
                  width: `${Math.abs(marquee.x2 - marquee.x1)}%`,
                  height: `${Math.abs(marquee.y2 - marquee.y1)}%`,
                }}
              />
            )}

            {ringVfx.map(r => {
              const { cx, cy } = uvToCanvas(r.u, r.v);
              return (
                <div
                  key={r.id}
                  className={`${styles.ringVfx} ${r.kind === 'merge' ? styles.ringVfxMerge : styles.ringVfxSplit}`}
                  style={{ left: `${cx}%`, top: `${cy}%` }}
                  onAnimationEnd={() => setRingVfx(prev => prev.filter(x => x.id !== r.id))}
                />
              );
            })}

            {hoveredEntry && !dragging && !parkedDrag && (() => {
              const hoverPos = getLedPosition(hoveredEntry);
              if (!hoverPos) return null;
              const { cx, cy } = hoverPos;
              const zoneName = zoneNameById.get(hoveredEntry.zoneId);
              const local = (zoneLocalByDevice.get(hoveredEntry.index) ?? hoveredEntry.index) + 1;
              const groupMembers = ledGroups.get(hoveredEntry.index);
              const isGroup = groupMembers && groupMembers.length > 1;
              return (
                <div
                  className={styles.tooltip}
                  style={{ left: `${cx}%`, top: `${cy}%` }}
                >
                  {zoneName ? `${zoneName} #${local}` : `#${local}`}
                  {isGroup && (
                    <span className={styles.tooltipMeta}> +{groupMembers.length - 1}</span>
                  )}
                  {hoveredEntry.disabled && (
                    <span className={styles.tooltipMeta}> - {t('lighting.ledMap.parkedTooltip')}</span>
                  )}
                </div>
              );
            })()}
            {selectionAnchor && (() => {
              const ax = devRect.x + selectionAnchor.u * devRect.w;
              const ay = devRect.y + selectionAnchor.v * devRect.h;
              return (
                <div
                  className={styles.selectionAnchor}
                  style={{ left: `${ax}%`, top: `${ay}%` }}
                />
              );
            })()}
          </div>
          {/* Under the canvas: what was removed on the left, Save on the
              right. Fixed height so the restore button appearing does not
              grow the modal under the pointer. */}
          <div className={styles.hintRow}>
            {removedCount > 0 ? (
              <button
                type="button"
                className={styles.modeBtn}
                onClick={handleRestoreAll}
              >
                <ListRestart size={13} aria-hidden />
                {t(pluralKey('lighting.ledMap.restoreRemovedCount', language, removedCount), { count: removedCount })}
              </button>
            ) : <span />}
            <button
              type="button"
              className={`${styles.btn} ${styles.btnPrimary}`}
              onClick={handleSave}
              disabled={!dirty || saving || chainBusy}
            >
              {t('lighting.ledMap.save')}
            </button>
          </div>
          </div>
          </div>
          {/* Instructions run the full width under both columns, away from the
              map they describe, with the long-form version a click away. */}
          <div className={styles.modalFoot}>
            <div className={styles.hint}>
              {t('lighting.ledMap.hint', {
                drag: t('lighting.ledMap.dragHint'),
                mod: isMac ? 'Cmd' : 'Ctrl',
                multi: t('lighting.ledMap.clickMulti'),
                del: t('lighting.ledMap.deleteHint'),
              })}
            </div>
            <a
              className={styles.hintLink}
              href={LED_MAP_DOCS_URL}
              target="_blank"
              rel="noreferrer noopener"
            >
              {t('lighting.ledMap.docsLink')}
              <ExternalLink size={12} aria-hidden />
            </a>
          </div>
        </div>
      )}
      {/* Community layouts, stacked on the editor modal. The dialogs the
          panel raises (publish confirm, discard-edits confirm) mount later
          and therefore stack above it in turn. */}
      {!loading && communityModalOpen && (
        <DeviceModal
          open
          onClose={handleCommunityClose}
          title={`${zoneCard?.name ?? structure?.name ?? ''} - ${t('lighting.ledMap.community')}`}
          large
        >
          <CommunityMappingsPanel
            deviceId={selectedZoneId}
            deviceName={zoneCard?.name ?? structure?.name ?? ''}
            onLedMapChanged={() => { void load(); }}
            onDialogOpenChange={setCommunityDialogOpen}
            confirmDiscardEdits={confirmDiscardEdits}
          />
        </DeviceModal>
      )}
      <ConfirmModal
        open={showUnsavedConfirm}
        title={t('lighting.ledMap.unsavedTitle')}
        message={t('lighting.ledMap.unsavedMessage')}
        confirmLabel={t('lighting.ledMap.discard')}
        cancelLabel={t('lighting.ledMap.keepEditing')}
        // Leaving with the work done is the likeliest intent, so it is offered
        // here rather than making the user cancel out and find Save.
        primaryAction={{
          label: t('lighting.ledMap.save'),
          onSelect: handleSaveAndClose,
          disabled: saving || chainBusy,
        }}
        onConfirm={handleDiscardAndClose}
        onCancel={() => setShowUnsavedConfirm(false)}
      />
      <ConfirmModal
        open={pendingDiscardAction !== null}
        title={t('lighting.ledMap.unsavedTitle')}
        message={t('lighting.mappings.discardEditsMessage')}
        confirmLabel={t('lighting.ledMap.discard')}
        cancelLabel={t('lighting.ledMap.keepEditing')}
        // Same way out as the close prompt: keep the work and carry on,
        // rather than making the user cancel and find Save first.
        primaryAction={pendingDiscardSaveable ? {
          label: t('lighting.ledMap.save'),
          onSelect: handleSaveThenPending,
          disabled: saving || chainBusy,
        } : undefined}
        destructive
        onConfirm={handlePendingDiscardConfirm}
        onCancel={() => setPendingDiscardAction(null)}
      />
      <ConfirmModal
        open={resetPartitionConfirm}
        title={t('lighting.ledMap.zoneResetTitle')}
        message={`${t('lighting.ledMap.zoneResetMessage')} ${t('lighting.ledMap.appliesOnSave')}`}
        confirmLabel={t('lighting.ledMap.zoneResetPartition')}
        cancelLabel={t('lighting.ledMap.keepEditing')}
        destructive
        onConfirm={handleResetPartitionConfirm}
        onCancel={() => setResetPartitionConfirm(false)}
      />
      <ConfirmModal
        open={compositionConfirm}
        title={t('lighting.ledMap.hubCompositionConfirmTitle')}
        message={t('lighting.ledMap.hubCompositionConfirmMessage')}
        confirmLabel={t('lighting.ledMap.hubCompositionConfirmApply')}
        cancelLabel={t('lighting.ledMap.keepEditing')}
        destructive
        onConfirm={() => { void handleCompositionConfirm(); }}
        onCancel={() => { setCompositionConfirm(false); setPendingCompositionPatch(null); }}
      />
      <ConfirmModal
        open={resetMapConfirm}
        title={t('lighting.ledMap.resetTitle')}
        message={t('lighting.ledMap.resetMessage')}
        confirmLabel={t('lighting.ledMap.reset')}
        cancelLabel={t('lighting.ledMap.keepEditing')}
        destructive
        onConfirm={handleResetMapConfirm}
        onCancel={() => setResetMapConfirm(false)}
      />
      <PromptModal
        open={zonePrompt !== null}
        title={t('lighting.ledMap.zoneSplitTitle')}
        message={t('lighting.ledMap.zoneNameMessage')}
        placeholder={t('lighting.ledMap.zoneNamePlaceholder')}
        initialValue=""
        maxLength={MAX_ZONE_NAME_LENGTH}
        onConfirm={handleZonePromptConfirm}
        onCancel={() => setZonePrompt(null)}
      />
    </DeviceModal>
  );
}
