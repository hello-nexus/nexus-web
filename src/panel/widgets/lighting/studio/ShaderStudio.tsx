import { lazy, Suspense, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Dices, Dna, Link2, Redo2, Save, Undo2, SprayCan, Upload } from 'lucide-react';
import { DeviceModal } from '../../../../components/common/DeviceModal/DeviceModal';
import { Button } from '../../../../components/common/Button/Button';
import { Card } from '../../../../components/common/Card/Card';
import { Select } from '../../../../components/common/Select/Select';
import { PaletteRing } from '../../../../components/common/PaletteRing/PaletteRing';
import { Slider } from '../../../../components/common/Slider/Slider';
import { Badge } from '../../../../components/common/Badge/Badge';
import { SearchInput } from '../../../../components/common/SearchInput/SearchInput';
import { SettingsSection } from '../../../../components/common/SettingsSection/SettingsSection';
import { InlineError } from '../../../../components/common/InlineError/InlineError';
import { Notice } from '../../../../components/common/Notice/Notice';
import { Toggle } from '../../../../components/common/Toggle/Toggle';
import { PromptModal } from '../../../../components/common/PromptModal/PromptModal';
import { ConfirmModal } from '../../../../components/common/ConfirmModal/ConfirmModal';
import { SortableList, type SortableRowArgs } from '../../../../components/common/SortableList/SortableList';
import { forgetShaderSource, primeShaderSource, startStudioLive, stopStudioLive } from '../../../../api/lighting';
import { customEffectId, customEffectKey, customEffectsLoaded } from '../../../../api/customEffects';
import { useAudioState } from '../../../../hooks/useAudioState';
import { SensorSignalProvider } from '../../../../hooks/SensorSignalProvider';
import { useTranslation } from '../../../../lib/i18n';
import { recipeUsesWheel } from '../../../../lib/studioWheel';
import { isApplePlatform } from '../../../../lib/platform';
import type { EffectState } from '../../../../types/lighting';
import {
  PATTERN_BLEND_PARAMS, STUDIO_COST_BUDGET, STUDIO_STAGES, STUDIO_STAGE_LIMIT, blocksForStage, studioBlock,
  type StudioStage,
} from './studioBlocks';
import {
  compileStudio, makeBlock, recipeCost, recipeUsesAudio, recipeUsesSensors, stageCount, staleParamsBetween,
  type CompiledStudio, type StudioBlock, type StudioRecipe,
} from './studioCompiler';
import { STUDIO_STARTERS, mutateRecipe, randomRecipe } from './studioRecipes';
import { EFFECT_NAME_MAX, getSavedEffects, isDownloaded, lastCreatedEffect, newEffectId, saveEffect, useSavedEffects, type MarketLink, type SavedEffect } from './studioLibrary';
import { marketEffectUrl } from '../../../../lib/marketLinks';
import { copyText } from '../../../../lib/clipboard';
import { StarterPicker } from './StarterPicker';
import { StudioBlockCard } from './StudioBlockCard';
import { StudioPreview } from './StudioPreview';
import { useStudioAudio } from './syntheticAudio';
import { GALLERY_FPS } from './recipePreview';
import { CustomEffectsGrid } from './CustomEffectsGrid';
import pageStyles from '../LightingPage.module.scss';
import mapStyles from '../page/LedMapEditor.module.scss';
import styles from './ShaderStudio.module.scss';

const STACKED = 'stacked' as const;

const HISTORY_LIMIT = 50;
const NEW_EFFECT_STARTER = 'breathing';
const VARIATION_COUNT = 6;
const COPIED_MS = 2000;
// Live on devices: slider drags reach the LEDs at most this often. An idle
// session is re-sent at a third of the lease the service last reported.
const LIVE_SEND_MS = 100;
const LIVE_LEASE_FALLBACK_MS = 15000;
const NON_TEXT_INPUTS = new Set(['range', 'checkbox', 'radio', 'button']);

// Keys this editor primed; evicted on close so the module-level shader cache stays bounded.
const primedKeys = new Set<string>();

function primed(recipe: StudioRecipe): CompiledStudio {
  const compiled = compileStudio(recipe);
  primeShaderSource(compiled.key, compiled.frag);
  primedKeys.add(compiled.key);
  return compiled;
}

function stateFor(recipe: StudioRecipe, compiled: CompiledStudio): EffectState {
  return {
    speed: recipe.speed, intensity: 1, hue: recipe.hue, colorize: recipeUsesWheel(recipe) ? recipe.colorize ?? 0 : 0,
    saturation: recipe.saturation, contrast: recipe.contrast, params: compiled.params,
  };
}

const stageOf = (b: StudioBlock): StudioStage | undefined => studioBlock(b.type)?.stage;

function VariationTile({ recipe, label, onPick }: { recipe: StudioRecipe; label: string; onPick: () => void }) {
  const compiled = useMemo(() => primed(recipe), [recipe]);
  const stateRef = useRef<EffectState | null>(stateFor(recipe, compiled));
  // Tiles are reused across rounds, so the renderer must see each new recipe's values.
  useLayoutEffect(() => {
    stateRef.current = stateFor(recipe, compiled);
  }, [recipe, compiled]);
  return (
    <button type="button" className={styles.variationTile} onClick={onPick} aria-label={label}>
      <StudioPreview effectKey={compiled.key} stateRef={stateRef} maxFps={GALLERY_FPS} />
    </button>
  );
}

// Publishing and listing links: raw defines, not DEV_TOOLS, so the literal folds far enough to drop the import() from production.
const PublishEffectModal = (import.meta.env.DEV || __DEV_TOOLS__)
  ? lazy(() => import('./PublishEffectModal').then(m => ({ default: m.PublishEffectModal })))
  : null;

/** `effectId` opens that saved effect; null opens the most recently created one, or a new one when there is none. */
export function ShaderStudio({ open, effectId, username, gpuAvailable = true, onSaved, onViewListing, onClose }: {
  open: boolean;
  effectId: string | null;
  /** Signed-in account, which tells My effects' own effects from Marketplace downloads. */
  username?: string | null;
  /** False when the service renders without a GPU: My effects then skips rendered thumbnails. */
  gpuAvailable?: boolean;
  /** After a successful save: the effect id and the uniforms whose saved value changed or were unpinned. */
  onSaved?: (id: string, staleParams: string[]) => void;
  /** Opens a Marketplace listing this Studio just published. */
  onViewListing?: (listingId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const saved = useSavedEffects();
  const [initial] = useState(() => {
    const list = getSavedEffects();
    return effectId ? list.find(s => s.id === effectId) : lastCreatedEffect(list, username);
  });
  // Opened before the list loaded: the default pick is made once it arrives, unless the user acted first.
  const adoptOnLoad = useRef(!effectId && !customEffectsLoaded());
  const [currentId, setCurrentId] = useState<string | null>(initial?.id ?? null);
  const [recipe, setRecipe] = useState<StudioRecipe>(() => {
    const existing = initial;
    return existing ? structuredClone(existing.recipe) : (STUDIO_STARTERS.find(s => s.id === NEW_EFFECT_STARTER) ?? STUDIO_STARTERS[0]).build();
  });
  const [past, setPast] = useState<StudioRecipe[]>([]);
  const [future, setFuture] = useState<StudioRecipe[]>([]);
  const [variations, setVariations] = useState<StudioRecipe[] | null>(null);
  const [effectQuery, setEffectQuery] = useState('');
  // Off on every open; the session ends on toggle-off and on close (unmount).
  const [live, setLive] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);
  const [liveOff, setLiveOff] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // The recipe as last saved or loaded; null when nothing saved backs it. Any
  // difference counts as unsaved, so closing or loading another effect asks first.
  const [baseline, setBaseline] = useState<string | null>(() => JSON.stringify(recipe));
  // What runs once the user agrees to drop unsaved edits (close, or load another effect).
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  const current = saved.find(s => s.id === currentId);
  const currentName = current?.name;
  const currentLink = current?.marketId && current.marketAuthor ? { marketId: current.marketId, marketAuthor: current.marketAuthor } : null;
  // The user's own listing, which the toolbar can share; a download is someone else's.
  const sharedId = current?.marketId && !isDownloaded(current, username) ? current.marketId : null;
  const [linkCopied, setLinkCopied] = useState(false);
  const copiedTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(copiedTimer.current), []);
  const copyLink = (listingId: string) => {
    void copyText(marketEffectUrl(listingId)).then(ok => {
      if (!ok) return;
      setLinkCopied(true);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setLinkCopied(false), COPIED_MS);
    });
  };
  const committedRef = useRef(recipe);
  const recipeRef = useRef(recipe);

  const compiled = useMemo(() => primed(recipe), [recipe]);
  const stateRef = useRef<EffectState | null>(stateFor(recipe, compiled));
  useLayoutEffect(() => {
    stateRef.current = stateFor(recipe, compiled);
    recipeRef.current = recipe;
  }, [recipe, compiled]);

  const usesAudio = recipeUsesAudio(recipe);
  const [simulateMusic, setSimulateMusic] = useState(false);
  const simulateLabelId = useId();
  const liveAudioRef = useAudioState(open && usesAudio && !simulateMusic);
  const audioRef = useStudioAudio(liveAudioRef, usesAudio && simulateMusic);

  // Evicts on the explicit close, not an unmount cleanup: StrictMode re-runs cleanups
  // while the previews still need their keys.
  const finishClose = () => {
    primedKeys.forEach(forgetShaderSource);
    primedKeys.clear();
    onClose();
  };
  const unlessDirty = (action: () => void) => {
    const dirty = baseline === null || JSON.stringify(recipeRef.current) !== baseline;
    if (dirty) setPendingDiscard(() => action);
    else action();
  };
  const close = () => unlessDirty(finishClose);

  const apply = (next: StudioRecipe, commit: boolean) => {
    adoptOnLoad.current = false;
    setRecipe(next);
    recipeRef.current = next;
    if (!commit || next === committedRef.current) return;
    const prev = committedRef.current;
    setPast(p => [...p.slice(1 - HISTORY_LIMIT), prev]);
    setFuture([]);
    committedRef.current = next;
  };
  const commitCurrent = () => apply(recipeRef.current, true);

  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    setPast(past.slice(0, -1));
    setFuture([committedRef.current, ...future]);
    committedRef.current = prev;
    setRecipe(prev);
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    setFuture(future.slice(1));
    setPast([...past, committedRef.current]);
    committedRef.current = next;
    setRecipe(next);
  };

  const historyKeysRef = useRef({ undo, redo, blocked: false });
  historyKeysRef.current = { undo, redo, blocked: saving || publishing || !!pendingDiscard || !!variations };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyZ' || !(isApplePlatform() ? e.metaKey : e.ctrlKey)) return;
      const h = historyKeysRef.current;
      const target = e.target;
      // Text fields keep their own undo (sliders are range inputs and have none); the stacked dialogs edit no recipe.
      const typing = target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)
        || (target instanceof HTMLInputElement && !NON_TEXT_INPUTS.has(target.type));
      if (h.blocked || typing) return;
      e.preventDefault();
      if (e.shiftKey) h.redo();
      else h.undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const fragRef = useRef(compiled.frag);
  fragRef.current = compiled.frag;
  const liveSentAt = useRef(0);
  const liveLease = useRef(LIVE_LEASE_FALLBACK_MS);
  // Sends run one at a time, so a stop is never overtaken by an earlier send still in flight.
  const liveQueue = useRef<Promise<unknown>>(Promise.resolve());
  const enqueueLive = (job: () => Promise<unknown>) => {
    liveQueue.current = liveQueue.current.then(job).catch(() => {});
  };
  // Bumped when a session starts and ends; work queued for an ended session is dropped.
  const liveSession = useRef({ id: 0 });
  // At most one send waits behind the one in flight; it reads the latest state when it runs.
  const liveWaiting = useRef(false);
  // The service's id for the running session: set by the first answer, cleared by the stop.
  const liveServerId = useRef<string | null>(null);
  const sendLive = () => {
    liveSentAt.current = Date.now();
    if (liveWaiting.current) return;
    liveWaiting.current = true;
    const counter = liveSession.current;
    const session = counter.id;
    enqueueLive(async () => {
      liveWaiting.current = false;
      const state = stateRef.current;
      if (session !== counter.id || !state) return;
      const res = await startStudioLive(fragRef.current, state, liveServerId.current);
      // Kept even for an ended session: its stop, queued behind this send, needs the id.
      if (res?.sessionId) liveServerId.current = res.sessionId;
      if (session !== counter.id) return;
      if (res?.leaseMs) liveLease.current = res.leaseMs;
      setLiveOff(res?.lightingOff === true);
      // A refusal ends live mode: re-sending would retake devices another client just changed.
      if (!res || res.error === true || res.active === false) {
        setLiveFailed(true);
        setLive(false);
      }
    });
  };
  const sendLiveRef = useRef(sendLive);
  sendLiveRef.current = sendLive;
  useEffect(() => {
    if (!live) return;
    const timer = setTimeout(() => sendLiveRef.current(), Math.max(0, LIVE_SEND_MS - (Date.now() - liveSentAt.current)));
    return () => clearTimeout(timer);
  }, [live, compiled.frag, recipe]);
  useEffect(() => {
    if (!live) return;
    const counter = liveSession.current;
    const waiting = liveWaiting;
    counter.id++;
    let heartbeat = 0;
    const beat = () => {
      sendLiveRef.current();
      heartbeat = window.setTimeout(beat, liveLease.current / 3);
    };
    heartbeat = window.setTimeout(beat, liveLease.current / 3);
    return () => {
      clearTimeout(heartbeat);
      counter.id++;
      waiting.current = false;
      // No id means no session of ours ever started (or its lease will lapse);
      // an id-less stop would end another tab's session.
      enqueueLive(async () => {
        const id = liveServerId.current;
        liveServerId.current = null;
        if (id) await stopStudioLive(id);
      });
    };
  }, [live]);

  const cost = recipeCost(recipe);
  const fitsBudget = (delta: number) => cost + delta <= STUDIO_COST_BUDGET;
  const canAdd = (type: string) => {
    const def = studioBlock(type);
    return !!def && stageCount(recipe, def.stage) < STUDIO_STAGE_LIMIT[def.stage] && fitsBudget(def.cost);
  };

  const updateBlock = (uid: string, block: StudioBlock, commit: boolean) =>
    apply({ ...recipe, blocks: recipe.blocks.map(b => (b.uid === uid ? block : b)) }, commit);

  // The swapped block keeps its uid, so pins on params the new type also has survive.
  const changeType = (uid: string, type: string) => {
    const next = { ...makeBlock(type), uid };
    const old = recipe.blocks.find(b => b.uid === uid);
    if (old && studioBlock(type)?.stage === 'pattern') {
      for (const p of PATTERN_BLEND_PARAMS) next.params[p.key] = old.params[p.key] ?? p.def;
    }
    const knobs = recipe.knobs?.filter(k => k.uid !== uid || k.key in next.params);
    apply({ ...recipe, knobs, blocks: recipe.blocks.map(b => (b.uid === uid ? next : b)) }, true);
  };

  const reorder = (stage: StudioStage, ids: string[]) => {
    const byId = new Map(recipe.blocks.map(b => [b.uid, b]));
    const others = recipe.blocks.filter(b => stageOf(b) !== stage);
    apply({ ...recipe, blocks: [...others, ...ids.map(id => byId.get(id)!)] }, true);
  };

  const openVariations = (from: StudioRecipe) =>
    setVariations(Array.from({ length: VARIATION_COUNT }, () => mutateRecipe(from)));

  const pickVariation = (v: StudioRecipe) => {
    apply(v, true);
    openVariations(v);
  };

  const nameKey = (name: string) => name.trim().toLocaleLowerCase();
  // The open effect's own name stays savable even when another effect already shares it.
  const otherEffectNamed = (name: string) =>
    !(currentName && nameKey(currentName) === nameKey(name)) && saved.some(s => s.id !== currentId && nameKey(s.name) === nameKey(name));
  const nameUsed = (name: string) => saved.some(s => nameKey(s.name) === nameKey(name));

  // A returned string is shown in the prompt (the service refused the shader).
  const saveCurrent = async (name: string, id: string): Promise<string | undefined> => {
    const trimmed = name.trim();
    const snapshot = recipe;
    const previous = getSavedEffects().find(e => e.id === id)?.recipe;
    const error = await saveEffect(id, trimmed, snapshot);
    if (error) return t('lighting.studio.saveFailed', { error });
    setCurrentId(id);
    setSaving(false);
    setBaseline(JSON.stringify(snapshot));
    onSaved?.(id, previous ? staleParamsBetween(previous, snapshot) : []);
    return undefined;
  };

  // One id per publish: the dialog saves twice (plain, then linked) before currentId updates.
  const publishIdRef = useRef<string | null>(null);
  // Publishing renames the open effect rather than copying it, so its listing stays linked.
  const savePublished = async (name: string, link?: MarketLink): Promise<string | null> => {
    const id = publishIdRef.current ?? currentId ?? newEffectId();
    publishIdRef.current = id;
    const snapshot = recipe;
    const previous = getSavedEffects().find(e => e.id === id)?.recipe;
    const error = await saveEffect(id, name, snapshot, link);
    if (error) return t('lighting.studio.saveFailed', { error });
    setCurrentId(id);
    setBaseline(JSON.stringify(snapshot));
    onSaved?.(id, previous ? staleParamsBetween(previous, snapshot) : []);
    return null;
  };

  const togglePin = (uid: string, key: string) => {
    const knobs = recipe.knobs ?? [];
    const pinned = knobs.some(k => k.uid === uid && k.key === key);
    apply({ ...recipe, knobs: pinned ? knobs.filter(k => !(k.uid === uid && k.key === key)) : [...knobs, { uid, key }] }, true);
  };

  useEffect(() => {
    if (!adoptOnLoad.current || !customEffectsLoaded()) return;
    adoptOnLoad.current = false;
    const pick = lastCreatedEffect(saved, username);
    if (!pick || currentId !== null) return;
    const next = structuredClone(pick.recipe);
    setRecipe(next);
    recipeRef.current = next;
    committedRef.current = next;
    setCurrentId(pick.id);
    setBaseline(JSON.stringify(pick.recipe));
  }, [saved, username, currentId]);

  const openSaved = (s: SavedEffect) => {
    apply(structuredClone(s.recipe), true);
    setCurrentId(s.id);
    setBaseline(JSON.stringify(s.recipe));
  };
  const startNew = () => {
    const starter = (STUDIO_STARTERS.find(s => s.id === NEW_EFFECT_STARTER) ?? STUDIO_STARTERS[0]).build();
    apply(starter, true);
    setCurrentId(null);
    setBaseline(JSON.stringify(starter));
  };
  const loadSaved = (id: string) => unlessDirty(() => {
    const s = getSavedEffects().find(e => e.id === id);
    if (s) openSaved(s);
  });

  // Read at delete-resolve time: another effect may have been loaded while the delete was in flight.
  const currentIdRef = useRef(currentId);
  currentIdRef.current = currentId;
  // The open effect was deleted from My effects: open its neighbor, or a new effect when none is left.
  const forgetDeleted = (id: string, nextId: string | null) => {
    if (currentIdRef.current !== id) return;
    const next = nextId ? getSavedEffects().find(e => e.id === nextId) : undefined;
    if (next) openSaved(next);
    else startNew();
  };

  const newEffect = () => unlessDirty(startNew);

  const costLevel = cost <= 4 ? 'light' : cost <= 8 ? 'medium' : 'heavy';

  const varying = !!variations;
  const toolbar = (
    <div className={styles.toolbar}>
      <StarterPicker
        disabled={varying}
        onPick={id => {
          const starter = STUDIO_STARTERS.find(s => s.id === id);
          if (starter) apply(starter.build(), true);
        }}
      />
      <Button size="sm" icon={<Dices size={14} />} disabled={varying} onClick={() => apply(randomRecipe(), true)}>
        {t('lighting.studio.surprise')}
      </Button>
      {varying ? (
        <Button size="sm" tone="accent" onClick={() => setVariations(null)}>{t('lighting.studio.done')}</Button>
      ) : (
        <Button size="sm" icon={<Dna size={14} />} onClick={() => openVariations(recipe)}>{t('lighting.studio.variations')}</Button>
      )}
      {/* The LED map editor's mode buttons: a pressed state rather than a switch. */}
      <button
        type="button"
        className={`${mapStyles.modeBtn} ${live ? mapStyles.modeBtnActive : ''}`}
        aria-pressed={live}
        disabled={varying}
        onClick={() => {
          if (!live) {
            setLiveFailed(false);
            setLiveOff(false);
          }
          setLive(!live);
        }}
      >
        {t('lighting.studio.live')}
      </button>
      <div className={styles.toolbarEnd}>
        <div className={styles.historyBtns}>
          <Button size="sm" tone="ghost" icon={<Undo2 size={14} />} aria-label={t('lighting.studio.undo')} disabled={varying || !past.length} onClick={undo} />
          <Button size="sm" tone="ghost" icon={<Redo2 size={14} />} aria-label={t('lighting.studio.redo')} disabled={varying || !future.length} onClick={redo} />
        </div>
      {PublishEffectModal && sharedId && (
        <>
          <Badge label={t('lighting.studio.published')} color="var(--accent)" compact />
          <Button size="sm" tone="ghost" icon={<Link2 size={14} />} disabled={varying} onClick={() => copyLink(sharedId)}>
            {t(linkCopied ? 'lighting.studio.linkCopied' : 'lighting.studio.copyLink')}
          </Button>
        </>
      )}
      {PublishEffectModal && (
        <Button size="sm" icon={<Upload size={14} />} disabled={varying} onClick={() => { publishIdRef.current = null; setPublishing(true); }}>
          {t('lighting.studio.publish.button')}
        </Button>
      )}
      <Button size="sm" tone="accent" icon={<Save size={14} />} disabled={varying} onClick={() => setSaving(true)}>
        {t('lighting.studio.save')}
      </Button>
      </div>
    </div>
  );

  const renderStage = (stage: StudioStage) => {
    const blocks = recipe.blocks.filter(b => stageOf(b) === stage);
    const addOptions = blocksForStage(stage).map(d => ({
      value: d.type, label: t(`lighting.studio.block.${d.type}`), disabled: !canAdd(d.type),
    }));
    const removable = (b: StudioBlock) => stage !== 'color' && !(stage === 'pattern' && blocks.length === 1 && blocks[0] === b);
    const renderCard = (b: StudioBlock, drag?: SortableRowArgs) => {
      const def = studioBlock(b.type)!;
      return (
        <StudioBlockCard
          key={b.uid}
          audioRef={audioRef}
          block={b}
          def={def}
          firstPattern={stage === 'pattern' && blocks[0] === b}
          removable={removable(b)}
          canSwitchTo={type => fitsBudget((studioBlock(type)?.cost ?? 0) - def.cost)}
          drag={drag}
          onChange={(nb, commit) => updateBlock(b.uid, nb, commit)}
          onCommit={commitCurrent}
          onTypeChange={type => changeType(b.uid, type)}
          onRemove={() => apply({
            ...recipe,
            blocks: recipe.blocks.filter(x => x.uid !== b.uid),
            knobs: recipe.knobs?.filter(k => k.uid !== b.uid),
          }, true)}
          isPinned={key => !!recipe.knobs?.some(k => k.uid === b.uid && k.key === key)}
          onTogglePin={key => togglePin(b.uid, key)}
        />
      );
    };
    return (
      <SettingsSection
        key={stage}
        title={t(`lighting.studio.stage.${stage}`)}
        boxClassName={styles.stageBox}
        action={stage !== 'color' && blocks.length < STUDIO_STAGE_LIMIT[stage] ? (
          <Select
            className={styles.addSelect}
            ariaLabel={t('lighting.studio.add')}
            placeholder={t('lighting.studio.add')}
            value=""
            options={addOptions}
            onChange={type => apply({ ...recipe, blocks: [...recipe.blocks, makeBlock(type)] }, true)}
            height={28}
          />
        ) : undefined}
      >
        {blocks.length > 1 ? (
          <SortableList
            className={styles.blockList}
            ids={blocks.map(b => b.uid)}
            onReorder={ids => reorder(stage, ids)}
            renderRow={(id, args) => renderCard(blocks.find(b => b.uid === id)!, args)}
            ariaLabel={t(`lighting.studio.stage.${stage}`)}
          />
        ) : (
          <div className={styles.blockList}>{blocks.map(b => renderCard(b))}</div>
        )}
      </SettingsSection>
    );
  };

  return (
    <SensorSignalProvider enabled={open && recipeUsesSensors(recipe)}>
    <DeviceModal
      open={open}
      onClose={close}
      closable={!varying}
      fullscreen
      title={t('lighting.studio.title')}
      icon={<SprayCan size={18} />}
    >
      {toolbar}
      <div className={styles.layout}>
        <div className={styles.viewPane}>
          {variations ? (
            <SettingsSection title={t('lighting.studio.variations')} description={t('lighting.studio.variationsHint')}
              fill flush boxClassName={styles.bareBox}>
              <div className={styles.variationGrid}>
                {variations.map((v, i) => (
                  <VariationTile key={i} recipe={v} label={`${t('lighting.studio.variations')} ${i + 1}`} onPick={() => pickVariation(v)} />
                ))}
              </div>
            </SettingsSection>
          ) : (
            <>
              <SettingsSection title={t('lighting.studio.preview')} fill boxClassName={styles.bareBox}
                action={(
                  <span className={styles.previewActions}>
                    {usesAudio && (
                      <span className={styles.toggleItem} title={t('lighting.studio.simulateMusicHint')}>
                        <Toggle checked={simulateMusic} onChange={setSimulateMusic} ariaLabelledBy={simulateLabelId} />
                        <span id={simulateLabelId}>{t('lighting.studio.simulateMusic')}</span>
                      </span>
                    )}
                    <Badge label={`${t(`lighting.studio.cost.${costLevel}`)} ${cost}/${STUDIO_COST_BUDGET}`} compact />
                  </span>
                )}>
                <StudioPreview effectKey={compiled.key} stateRef={stateRef} audioRef={audioRef} />
                {liveFailed && <InlineError className={styles.liveError}>{t('lighting.studio.liveFailed')}</InlineError>}
                {live && liveOff && <Notice tone="info" role="status" className={styles.liveError}>{t('lighting.studio.liveOff')}</Notice>}
              </SettingsSection>
              <div className={styles.myEffects}>
                <div className={pageStyles.effectToolbar}>
                  <SearchInput
                    className={pageStyles.effectSearch}
                    value={effectQuery}
                    onChange={setEffectQuery}
                    placeholder={t('lighting.effects.search')}
                    ariaLabel={t('lighting.effects.search')}
                  />
                </div>
                <CustomEffectsGrid
                  effect={currentId ? customEffectKey(currentId) : null}
                  query={effectQuery}
                  username={username}
                  gpuAvailable={gpuAvailable}
                  draft={{ id: currentId, recipe }}
                  onSelect={key => loadSaved(customEffectId(key))}
                  onCreate={newEffect}
                  onDeleted={forgetDeleted}
                />
              </div>
            </>
          )}
        </div>
        <div className={`${styles.stackPane} ${varying ? styles.locked : ''}`} inert={varying || undefined}>
          <SettingsSection title={t('lighting.studio.stage.global')} boxClassName={styles.stageBox}>
          <Card compact className={styles.blockCard}>
            <div className={styles.blockParams}>
              {recipeUsesWheel(recipe) && (
                <div className={pageStyles.paletteRingWrap}>
                  <PaletteRing
                    hue={recipe.hue} colorize={recipe.colorize ?? 0}
                    onChange={(hue, colorize, commit) => apply({ ...recipe, hue, colorize }, commit)} onCommit={commitCurrent}
                    saturation={recipe.saturation} contrast={recipe.contrast}
                  />
                </div>
              )}
              <Slider orientation={STACKED} editable trackFill zeroMarker label={t('lighting.controls.speed')}
                value={recipe.speed} min={-100} max={100}
                onChange={(v, commit) => apply({ ...recipe, speed: v }, !!commit)} onCommit={commitCurrent} />
              {!recipeUsesWheel(recipe) && (
                <Slider orientation={STACKED} editable trackFill label={t('lighting.studio.param.hue')}
                  value={Math.round(recipe.hue * 100)} min={0} max={100}
                  onChange={(v, commit) => apply({ ...recipe, hue: v / 100 }, !!commit)} onCommit={commitCurrent} />
              )}
              <Slider orientation={STACKED} editable trackFill label={t('lighting.controls.saturation')}
                value={Math.round(recipe.saturation * 100)} min={0} max={200}
                onChange={(v, commit) => apply({ ...recipe, saturation: v / 100 }, !!commit)} onCommit={commitCurrent} />
              <Slider orientation={STACKED} editable trackFill label={t('lighting.controls.contrast')}
                value={Math.round(recipe.contrast * 100)} min={0} max={200}
                onChange={(v, commit) => apply({ ...recipe, contrast: v / 100 }, !!commit)} onCommit={commitCurrent} />
            </div>
          </Card>
          </SettingsSection>
          {STUDIO_STAGES.map(renderStage)}
        </div>
      </div>
      <ConfirmModal
        open={!!pendingDiscard}
        title={t('lighting.studio.discardTitle')}
        message={t('lighting.studio.discardMessage')}
        confirmLabel={t('lighting.studio.discard')}
        destructive
        onConfirm={() => { const action = pendingDiscard; setPendingDiscard(null); action?.(); }}
        onCancel={() => setPendingDiscard(null)}
      />
      <PromptModal
        open={saving}
        title={t('lighting.studio.saveTitle')}
        placeholder={t('lighting.studio.namePlaceholder')}
        initialValue={currentName ?? ''}
        maxLength={EFFECT_NAME_MAX}
        confirmLabel={t('lighting.studio.save')}
        validate={v => {
          if (!v.trim()) return t('lighting.studio.nameRequired');
          return otherEffectNamed(v) ? t('lighting.studio.nameTaken') : null;
        }}
        onConfirm={name => saveCurrent(name, currentId ?? newEffectId())}
        secondary={currentId ? {
          label: t('lighting.studio.saveAsNew'),
          onClick: name => saveCurrent(name, newEffectId()),
          disabled: nameUsed,
        } : undefined}
        onCancel={() => setSaving(false)}
      />
      {PublishEffectModal && (
        <Suspense fallback={null}>
          <PublishEffectModal
            open={publishing}
            initialName={currentName ?? ''}
            recipe={recipe}
            link={currentLink}
            save={savePublished}
            onViewListing={onViewListing}
            onClose={() => setPublishing(false)}
          />
        </Suspense>
      )}
    </DeviceModal>
    </SensorSignalProvider>
  );
}
