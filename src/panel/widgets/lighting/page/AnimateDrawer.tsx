import { useEffect } from 'react';
import { useTranslation } from '../../../../lib/i18n';
import { EFFECTS, type EffectState, type EffectTemplateBundle } from '../../../../types/lighting';
import { EffectControls } from './EffectControls';
import styles from '../LightingPage.module.scss';

/**
 * Slide-animated wrapper used by FullscreenShader to overlay the animate
 * effect controls on top of the fullscreen canvas. The right-pane variant
 * renders EffectControls directly inside a tab - no drawer shell, no slide
 * animation. Keeping the wrapper here means the fullscreen overlay stays
 * dismissible and mirrors the drawer behaviour the user is already used to.
 *
 * Esc-to-close is wired inline rather than through Overlay because the
 * parent (FullscreenShader) owns the open / closing animation
 * lifecycle and uses onAnimationEnd to drive unmount, which doesn't
 * compose cleanly through Overlay's surface wrapper.
 */
export function AnimateDrawer({
  effect, state, bundle,
  onTemplateSelect, canReset,
  onChange, onCommit, onReset, onClose, closing, onAnimationEnd,
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
}) {
  const { t } = useTranslation();
  const def = EFFECTS.find(e => e.key === effect);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!def) return null;
  return (
    <aside
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
        <button type="button" className={styles.drawerClose} onClick={onClose} aria-label="Close">×</button>
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
      />
    </aside>
  );
}
