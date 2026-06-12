import { useTranslation } from '../../../../lib/i18n';
import { EFFECTS, type EffectState, type EffectTemplateBundle, type LightingMode } from '../../../../types/lighting';
import { EffectControls } from './EffectControls';
import { PostProcessControls } from '../effecteditor/PostProcessControls';
import type { PostProcessState } from '../effecteditor/types';
import styles from '../LightingPage.module.scss';

export type { PostProcessState };

/**
 * Right-pane Effect tab content. Routes to the right controls per mode:
 * animate reuses EffectControls; media + screen render PostProcessControls
 * (palette ring + saturation / contrast); static and off show the empty-state
 * hint since neither mode has anything to tweak in the effect tab.
 */
export function EffectTab({
  mode,
  // animate props
  effect, state, bundle, canReset,
  onTemplateSelect, onAnimateChange, onAnimateCommit, onAnimateReset,
  panelSlots,
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
  /** Preset slots used as a background by ≥1 panel (panel badge). */
  panelSlots?: Set<number> | null;
  postProcess: PostProcessState;
  onPostProcessChange: (patch: Partial<PostProcessState>, commit: boolean) => void;
  onPostProcessCommit: () => void;
  onPostProcessReset: () => void;
}) {
  const { t } = useTranslation();

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
          panelSlots={panelSlots}
        />
      </>
    );
  }

  if (mode === 'gif' || mode === 'screen') {
    return (
      <PostProcessControls
        value={postProcess}
        onChange={onPostProcessChange}
        onCommit={onPostProcessCommit}
        onReset={onPostProcessReset}
      />
    );
  }

  return <p className={styles.effectTabEmpty}>{t('lighting.rightPane.effectEmpty')}</p>;
}
