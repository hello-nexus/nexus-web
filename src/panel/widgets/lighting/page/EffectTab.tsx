import { useTranslation } from '../../../../lib/i18n';
import { EFFECTS, type EffectState, type EffectTemplateBundle, type LightingMode } from '../../../../types/lighting';
import { PaletteRing } from '../../../../components/common/PaletteRing/PaletteRing';
import { Slider } from '../../../../components/common/Slider/Slider';
import { EffectControls } from './EffectControls';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import styles from '../LightingPage.module.scss';

/**
 * Post-process params shared by Mirror and Media modes: hue shift, colorize
 * (0 = pure hue rotate, 1 = grayscale + tint), saturation (0 = mono, 1 =
 * unchanged, up to 4 = oversaturated), contrast (same range), plus optional
 * X/Y flip flags used by the Mirror filter presets. Flip is geometric and
 * applied at the source on the service.
 */
export interface PostProcessState {
  hue: number;
  colorize: number;
  saturation: number;
  contrast: number;
  flipX?: boolean;
  flipY?: boolean;
}

/**
 * Right-pane Effect tab content. Routes to the right controls per mode:
 * animate reuses EffectControls; media + screen render the palette ring and
 * a saturation / contrast pair; static and off show the empty-state hint
 * since neither mode has anything to tweak in the effect tab.
 */
export function EffectTab({
  mode,
  // animate props
  effect, state, bundle, canReset,
  onTemplateSelect, onAnimateChange, onAnimateCommit, onAnimateReset,
  // media + screen props
  postProcess, onPostProcessChange, onPostProcessCommit, onPostProcessReset,
}: {
  mode: LightingMode;
  effect: string;
  state: EffectState | null;
  bundle: EffectTemplateBundle | null;
  canReset: boolean;
  onTemplateSelect: (idx: number) => void;
  onAnimateChange: (patch: Partial<EffectState>, commit?: boolean) => void;
  onAnimateCommit: () => void;
  onAnimateReset: () => void;
  postProcess: PostProcessState;
  onPostProcessChange: (patch: Partial<PostProcessState>, commit: boolean) => void;
  onPostProcessCommit: () => void;
  onPostProcessReset: () => void;
}) {
  const { t } = useTranslation();
  const ppIsIdentity = postProcess.hue === 0 && postProcess.colorize === 0
    && postProcess.saturation === 1 && postProcess.contrast === 1;

  if (mode === 'animate') {
    if (!state || !bundle) {
      return <p className={styles.effectTabEmpty}>{t('lighting.rightPane.effectAnimateHint')}</p>;
    }
    const def = EFFECTS.find(e => e.key === effect);
    return (
      <>
        {def && <h3 className={styles.effectTabTitle}>{t(def.labelKey)}</h3>}
        <EffectControls
          effect={effect}
          state={state}
          bundle={bundle}
          canReset={canReset}
          onTemplateSelect={onTemplateSelect}
          onChange={onAnimateChange}
          onCommit={onAnimateCommit}
          onReset={onAnimateReset}
        />
      </>
    );
  }

  if (mode === 'gif' || mode === 'screen') {
    return (
      <div className={styles.effectControls}>
        <div className={styles.drawerSliders}>
          <div className={styles.paletteRingWrap}>
            <PaletteRing
              hue={postProcess.hue}
              colorize={postProcess.colorize}
              onChange={(hue, colorize, commit) => onPostProcessChange({ hue, colorize }, commit)}
              onCommit={onPostProcessCommit}
            />
          </div>
          <Slider
            orientation="stacked"
            editable
            label={t('lighting.controls.saturation')}
            value={Math.round(postProcess.saturation * 100)}
            min={0}
            max={400}
            onChange={(v, commit) => onPostProcessChange({ saturation: v / 100 }, !!commit)}
            onCommit={onPostProcessCommit}
          />
          <Slider
            orientation="stacked"
            editable
            label={t('lighting.controls.contrast')}
            value={Math.round(postProcess.contrast * 100)}
            min={0}
            max={400}
            onChange={(v, commit) => onPostProcessChange({ contrast: v / 100 }, !!commit)}
            onCommit={onPostProcessCommit}
          />
        </div>
        <div className={styles.drawerFooter}>
          <HoverTooltip body={ppIsIdentity ? t('lighting.controls.resetAlready') : t('lighting.controls.reset')} side="top">
            <button
              type="button"
              className={styles.drawerReset}
              onClick={onPostProcessReset}
              disabled={ppIsIdentity}
            >{t('lighting.controls.reset')}</button>
          </HoverTooltip>
        </div>
      </div>
    );
  }

  return <p className={styles.effectTabEmpty}>{t('lighting.rightPane.effectEmpty')}</p>;
}
