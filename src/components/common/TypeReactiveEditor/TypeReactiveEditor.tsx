import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CircleDot, Crosshair, Flame, MoveHorizontal, MoveVertical, Radio, Route, Sparkles, Sun, Zap,
} from 'lucide-react';
import { Slider } from '../Slider/Slider';
import { SettingToggle } from '../SettingRow/SettingRow';
import { IconLabelButton } from '../IconLabelButton/IconLabelButton';
import { ChipGroup } from '../ChipGroup/ChipGroup';
import { ColorPickerWithPresets } from '../ColorPickerWithPresets/ColorPickerWithPresets';
import { useTranslation } from '../../../lib/i18n';
import { isTunnelActive } from '../../../api/service';
import { subscribeLedFrame } from '../../../lib/ledFrameStore';
import type { LightingFrameState } from '../../../hooks/useLightingFrames';
import {
  fetchKeyReactionPreview,
  pressKeyReaction,
  putKeyReaction,
  type KeyReaction,
  type KeyReactionBackground,
  type KeyReactionColorMode,
  type KeyReactionEffect,
  type KeyReactionPreview,
} from '../../../api/keyReactive';
import {
  KEY_REACTION_BACKGROUNDS,
  KEY_REACTION_COLOR_MODES,
  KEY_REACTION_EFFECTS,
  KEY_REACTION_PRESETS,
  MULTIPLIER_STEP,
  SIZE_RANGE,
  SPEED_RANGE,
  formatMultiplier,
  liveLedBytes,
  snapMultiplier,
} from './keyReactionsUtils';
import { TypeReactiveBoard } from './TypeReactiveBoard';
import styles from './TypeReactiveEditor.module.scss';

/** One keyboard's config with optimistic, debounced write-back; see {@link useTypeReactiveConfig}. */
export interface TypeReactiveConfig {
  config: KeyReaction;
  update: (patch: Partial<KeyReaction>) => void;
  /** Writes any pending edit now. */
  flushSave: () => Promise<void>;
  /** The latest config, including an edit not yet rendered. */
  current: () => KeyReaction;
}

export interface TypeReactiveEditorProps {
  /** Lighting-device card id of the per-key keyboard (press / preview routes). */
  cardId: string;
  /** Config state from {@link useTypeReactiveConfig}; the host owns it so the config outlives a remount of the editor. */
  controller: TypeReactiveConfig;
  /** False when no real key source is live, so typing is not detected. */
  inputAvailable: boolean;
  /** The device reports its own key presses and ignores OS keystrokes. */
  hardwareKeys: boolean;
  /** The card's device index byte in the lighting output stream. */
  frameIndex: number;
  /** Lighting output socket state; frames themselves arrive through ledFrameStore. */
  stream: LightingFrameState;
  /** 'split' puts the options left and a compact board right (the modal); 'stacked' is one column (the keyboard page). */
  layout?: 'split' | 'stacked';
}

const EFFECT_ICONS: Record<KeyReactionEffect, ReactNode> = {
  fade: <CircleDot size={18} />,
  rowSweep: <MoveHorizontal size={18} />,
  columnSweep: <MoveVertical size={18} />,
  ripple: <Radio size={18} />,
  crosshair: <Crosshair size={18} />,
  starburst: <Sun size={18} />,
  heatmap: <Flame size={18} />,
  sparks: <Sparkles size={18} />,
  lightning: <Zap size={18} />,
  trace: <Route size={18} />,
};

const SAVE_DEBOUNCE_MS = 250;

/**
 * Config state for one keyboard's Type reactive editor. Every edit is
 * optimistic and written back debounced; the service's sanitised config
 * replaces ours only when no newer edit is waiting, so a drag is never rewound
 * by an older response. A pending edit is flushed on unmount.
 */
export function useTypeReactiveConfig(cardId: string, initialConfig: KeyReaction): TypeReactiveConfig {
  const [config, setConfig] = useState<KeyReaction>(initialConfig);
  const configRef = useRef(config);
  const editSeqRef = useRef(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirtyRef = useRef(false);

  const flushSave = useCallback((): Promise<void> => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (!dirtyRef.current) return Promise.resolve();
    dirtyRef.current = false;
    const seq = editSeqRef.current;
    // A failed write resolves null; while it is still the newest edit it stays
    // pending, so the next save or the unmount flush retries it.
    const keepPending = () => { if (seq === editSeqRef.current) dirtyRef.current = true; };
    return putKeyReaction(cardId, configRef.current).then(saved => {
      if (!saved) { keepPending(); return; }
      if (seq === editSeqRef.current) {
        configRef.current = saved;
        setConfig(saved);
      }
    }).catch(keepPending);
  }, [cardId]);

  const update = useCallback((patch: Partial<KeyReaction>) => {
    const next = { ...configRef.current, ...patch };
    configRef.current = next;
    editSeqRef.current += 1;
    dirtyRef.current = true;
    setConfig(next);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => { void flushSave(); }, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  useEffect(() => () => { void flushSave(); }, [flushSave]);

  const current = useCallback(() => configRef.current, []);
  return { config, update, flushSave, current };
}

/**
 * Type reactive editor for one keyboard: how a key press lights the board.
 * Shared by the lighting page modal and the keyboard page, so both read and
 * write the same stored config through the same routes.
 *
 * The board's layout comes from the service's preview route; its colours are
 * the card's real output from the lighting stream, so typing and clicking keys
 * appear exactly as on the hardware. Without a stream the keys show unlit.
 */
export function TypeReactiveEditor({
  cardId, controller, inputAvailable, hardwareKeys, frameIndex, stream, layout = 'stacked',
}: TypeReactiveEditorProps) {
  const { t } = useTranslation();
  const { config, update, flushSave, current } = controller;

  // The preview supplies the board's layout. Fetched once per card: the LED
  // colours always come from the output stream, on or off.
  const [preview, setPreview] = useState<KeyReactionPreview | null>(null);
  const initialRef = useRef(config);
  useEffect(() => {
    const ctl = new AbortController();
    fetchKeyReactionPreview(cardId, { ...initialRef.current, enabled: true }, ctl.signal)
      .then(res => { if (!ctl.signal.aborted && res) setPreview(res); })
      .catch(() => { /* aborted or unreachable: the board stays empty */ });
    return () => ctl.abort();
  }, [cardId]);

  // Live needs an open stream (never over relay) and the card's section in
  // the frames; without them the board shows unlit keys.
  const streamUsable = stream.connected && !isTunnelActive();
  const ledCount = preview?.x.length ?? 0;
  const [live, setLive] = useState(false);
  useEffect(() => {
    if (!streamUsable || ledCount === 0) {
      setLive(false);
      return;
    }
    const unsubscribe = subscribeLedFrame(f => {
      const present = liveLedBytes(f.devices, frameIndex, ledCount) !== null;
      setLive(prev => (prev === present ? prev : present));
    });
    return () => { unsubscribe(); setLive(false); };
  }, [streamUsable, ledCount, frameIndex]);

  const pressRandom = useCallback(() => {
    pressKeyReaction(cardId, {}).catch(() => { /* best-effort */ });
  }, [cardId]);
  const handlePressLed = useCallback((led: number) => {
    pressKeyReaction(cardId, { led }).catch(() => { /* best-effort */ });
  }, [cardId]);

  // Picking an effect on a live board fires one press so the change shows on
  // the hardware at once. The press runs on the stored config, so the edit is
  // written first.
  const handlePickEffect = useCallback((key: KeyReactionEffect) => {
    update({ effect: key });
    if (!current().enabled) return;
    void flushSave().then(pressRandom);
  }, [update, flushSave, current, pressRandom]);

  const colorOptions = KEY_REACTION_COLOR_MODES.map(key => ({ key, label: t(`lighting.keyReactions.color.${key}`) }));
  const backgroundOptions = KEY_REACTION_BACKGROUNDS.map(key => ({ key, label: t(`lighting.keyReactions.background.${key}`) }));

  // Typing reaches the board when it reports its own keys or the OS source is live.
  const typingWorks = hardwareKeys || inputAvailable;

  return (
    <div className={`${styles.body} ${layout === 'split' ? styles.split : ''}`}>
      <div className={styles.toggleArea}>
        <SettingToggle
          label={t('lighting.keyReactions.title')}
          description={t('lighting.keyReactions.description')}
          checked={config.enabled}
          onChange={enabled => update({ enabled })}
        />
      </div>

      <section className={styles.boardArea}>
        <TypeReactiveBoard
          preview={preview}
          label={t('lighting.keyReactions.previewLabel')}
          disabled={!config.enabled}
          live={live}
          frameIndex={frameIndex}
          onPressLed={handlePressLed}
          onPressRandom={pressRandom}
        />
        <span className={styles.hint}>
          {t(typingWorks ? 'lighting.keyReactions.previewHint' : 'lighting.keyReactions.previewHintClick')}
        </span>
      </section>

      <div className={styles.optionsArea}>
        <section className={styles.section}>
          <span className={styles.sectionTitle}>{t('lighting.keyReactions.effect')}</span>
          <div className={styles.gallery} role="group" aria-label={t('lighting.keyReactions.effect')}>
            {KEY_REACTION_EFFECTS.map(key => (
              <IconLabelButton
                key={key}
                icon={EFFECT_ICONS[key]}
                label={t(`lighting.keyReactions.effects.${key}.name`)}
                active={key === config.effect}
                onPress={() => handlePickEffect(key)}
              />
            ))}
          </div>
        </section>

        <section className={styles.section} data-testid="key-reactions-color">
          {config.effect === 'heatmap' ? (
            <p className={styles.hint}>{t('lighting.keyReactions.heatNote')}</p>
          ) : (
            <>
              <span className={styles.sectionTitle}>{t('lighting.keyReactions.color.title')}</span>
              <ChipGroup
                options={colorOptions}
                ariaLabel={t('lighting.keyReactions.color.title')}
                activeKey={config.colorMode}
                onChange={key => update({ colorMode: key as KeyReactionColorMode })}
              />
              {config.colorMode === 'custom' && (
                <ColorPickerWithPresets
                  value={config.color}
                  presets={KEY_REACTION_PRESETS}
                  allowCustom
                  pickerPortal
                  onCommit={hex => update({ color: hex })}
                />
              )}
            </>
          )}
        </section>

        <section className={styles.section}>
          <span className={styles.sectionTitle}>{t('lighting.keyReactions.background.title')}</span>
          <ChipGroup
            options={backgroundOptions}
            ariaLabel={t('lighting.keyReactions.background.title')}
            activeKey={config.background}
            onChange={key => update({ background: key as KeyReactionBackground })}
          />
          <p className={styles.hint}>{t(`lighting.keyReactions.background.${config.background}Hint`)}</p>
        </section>

        <section className={styles.sliders}>
          <Slider
            // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
            orientation="stacked"
            editable
            trackFill
            label={t('lighting.keyReactions.speed')}
            ariaLabel={t('lighting.keyReactions.speed')}
            value={config.speed}
            min={SPEED_RANGE.min}
            max={SPEED_RANGE.max}
            step={MULTIPLIER_STEP}
            formatValue={formatMultiplier}
            onChange={v => update({ speed: snapMultiplier(v) })}
          />
          <Slider
            // eslint-disable-next-line i18next/no-literal-string -- slider layout enum
            orientation="stacked"
            editable
            trackFill
            label={t('lighting.keyReactions.size')}
            ariaLabel={t('lighting.keyReactions.size')}
            value={config.size}
            min={SIZE_RANGE.min}
            max={SIZE_RANGE.max}
            step={MULTIPLIER_STEP}
            formatValue={formatMultiplier}
            onChange={v => update({ size: snapMultiplier(v) })}
          />
        </section>
      </div>
    </div>
  );
}
