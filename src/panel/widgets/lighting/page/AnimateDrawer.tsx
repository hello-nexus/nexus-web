import { useRef } from 'react';
import { useTranslation } from '../../../../lib/i18n';
import { useModalA11y } from '../../../../components/common/Overlay/useModalA11y';
import { EFFECTS, type EffectState, type EffectTemplateBundle } from '../../../../types/lighting';
import { EffectControls } from './EffectControls';
import styles from '../LightingPage.module.scss';

/**
 * Slide-animated wrapper FullscreenShader uses to overlay the animate
 * effect controls on the fullscreen canvas. (The right-pane variant
 * renders EffectControls directly in a tab, no drawer shell.)
 *
 * Rendered inline rather than via Overlay: the parent (FullscreenShader)
 * owns the open/closing animation lifecycle and drives unmount via
 * onAnimationEnd, which doesn't compose through Overlay's surface wrapper.
 * Still registers with the shared modal stack (useModalA11y) so Escape and
 * Tab are arbitrated against whatever else is stacked on top of it.
 */
export function AnimateDrawer({
  effect, state, bundle,
  onTemplateSelect, canReset,
  onChange, onCommit, onReset, onClose, closing, onAnimationEnd, panelSlots,
}: {
  effect: string;
  state: EffectState;
  bundle: EffectTemplateBundle;
  onTemplateSelect: (idx: number) => void;
  canReset: boolean;
  onChange: (patch: Partial<EffectState>, commit?: boolean) => void;
  onCommit: () => void;
  onReset: () => void;
  onClose: () => void;
  closing: boolean;
  onAnimationEnd: () => void;
  /** Preset slots used as a background by ≥1 panel (panel badge). */
  panelSlots?: Set<number> | null;
}) {
  const { t } = useTranslation();
  const def = EFFECTS.find(e => e.key === effect);
  const containerRef = useRef<HTMLElement>(null);

  useModalA11y({
    open: true,
    onClose,
    containerRef,
    lockBackground: false,
    restoreFocus: false,
  });

  if (!def) return null;
  return (
    <aside
      ref={containerRef}
      className={`${styles.drawer} ${closing ? styles.drawerClosing : ''}`}
      role="dialog"
      aria-label={t(def.labelKey)}
      onAnimationEnd={e => {
        if (closing && e.animationName && e.animationName.indexOf('Out') !== -1) {
          onAnimationEnd();
        }
      }}
    >
      <div className={styles.drawerHeader}>
        <h3 className={styles.drawerTitle}>{t(def.labelKey)}</h3>
        <button type="button" className={styles.drawerClose} onClick={onClose} aria-label={t('app.window.close')}>×</button>
      </div>
      <EffectControls
        effect={effect}
        state={state}
        bundle={bundle}
        onTemplateSelect={onTemplateSelect}
        canReset={canReset}
        onChange={onChange}
        onCommit={onCommit}
        onReset={onReset}
        panelSlots={panelSlots}
      />
    </aside>
  );
}
