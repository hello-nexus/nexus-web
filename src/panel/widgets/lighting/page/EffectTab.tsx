import { useTranslation } from '../../../../lib/i18n';
import { EFFECTS, type EffectDef, type EffectState, type EffectTemplateBundle, type LightingMode } from '../../../../types/lighting';
import { EffectControls } from './EffectControls';
import { PostProcessControls } from '../effecteditor/PostProcessControls';
import type { PostProcessState } from '../effecteditor/types';
import styles from '../LightingPage.module.scss';

export type { PostProcessState };

/**
 * Right-pane Effect tab content. Routes to the right controls per mode:
 * animate and static reuse EffectControls (static drops the speed slider and
 * adds a hex colour entry for patterns); media + screen render
 * PostProcessControls; off shows the empty-state hint.
 */
export function EffectTab({
  mode,
  // animate props
  effect, state, bundle, canReset,
  onTemplateSelect, onAnimateChange, onAnimateCommit, onAnimateReset,
  panelSlots, customDef, customTitle,
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
  /** A custom (Shader Studio) effect's definition and name; built-ins come from EFFECTS. */
  customDef?: EffectDef;
  customTitle?: string;
  postProcess: PostProcessState;
  onPostProcessChange: (patch: Partial<PostProcessState>, commit: boolean) => void;
  onPostProcessCommit: () => void;
  onPostProcessReset: () => void;
}) {
  const { t } = useTranslation();

  if (mode === 'animate' || mode === 'static') {
    if (!state || !bundle) {
      return <p className={styles.effectTabEmpty}>{t('lighting.rightPane.effectAnimateHint')}</p>;
    }
    const def = EFFECTS.find(e => e.key === effect);
    const title = customTitle ?? (def ? t(def.labelKey) : null);
    return (
      <>
        {title && <h3 className={styles.effectTabTitle}>{title}</h3>}
        <EffectControls
          effect={effect}
          customDef={customDef}
          state={state}
          bundle={bundle}
          canReset={canReset}
          onTemplateSelect={onTemplateSelect}
          onChange={onAnimateChange}
          onCommit={onAnimateCommit}
          onReset={onAnimateReset}
          panelSlots={panelSlots}
          staticMode={mode === 'static'}
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
