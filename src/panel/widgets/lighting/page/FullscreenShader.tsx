import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { AudioSnapshot } from '../../../../hooks/useAudioState';
import type { EffectState, EffectTemplateBundle } from '../../../../types/lighting';
import { useShaderRenderer } from '../../../../hooks/useShaderRenderer';
import { AnimateDrawer } from './AnimateDrawer';
import styles from './FullscreenShader.module.scss';

interface FullscreenShaderProps {
  effect: string;
  state: EffectState;
  bundle: EffectTemplateBundle;
  canReset: boolean;
  audioRef?: React.RefObject<AudioSnapshot | null>;
  onTemplateSelect: (idx: number) => void;
  onChange: (patch: Partial<EffectState>, commit?: boolean) => void;
  onCommit: () => void;
  onReset: () => void;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  /** Preset slots used as a background by ≥1 panel (panel badge). */
  panelSlots?: Set<number> | null;
}

export function FullscreenShader({
  effect, state, bundle, canReset, audioRef,
  onTemplateSelect, onChange, onCommit, onReset, onClose, onPrev, onNext, panelSlots,
}: FullscreenShaderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef(state);
  const onCloseRef = useRef(onClose);
  // Sync mutable refs synchronously (pre-paint) so the WebGL render loop and
  // fullscreenchange handler always read the latest props without re-creating
  // the renderer subscription on every state tick.
  useLayoutEffect(() => {
    stateRef.current = state;
    onCloseRef.current = onClose;
  });

  const { loading, error } = useShaderRenderer(canvasRef, effect, stateRef, audioRef);

  const [closeVisible, setCloseVisible] = useState(false);
  const hideTimerRef = useRef(0);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerClosing, setDrawerClosing] = useState(false);
  const closeDrawer = useCallback(() => {
    if (drawerOpen) setDrawerClosing(true);
  }, [drawerOpen]);
  const finishDrawerClose = () => { setDrawerClosing(false); setDrawerOpen(false); };

  const handleMouseMove = useCallback(() => {
    setCloseVisible(true);
    window.clearTimeout(hideTimerRef.current);
    hideTimerRef.current = window.setTimeout(() => setCloseVisible(false), 2000);
  }, []);

  const handleCanvasClick = useCallback(() => {
    if (drawerOpen && !drawerClosing) {
      closeDrawer();
    } else if (!drawerOpen) {
      setDrawerClosing(false);
      setDrawerOpen(true);
    }
  }, [drawerOpen, drawerClosing, closeDrawer]);

  useEffect(() => {
    containerRef.current?.requestFullscreen?.().catch(() => {});
    const handleFsChange = () => {
      if (!document.fullscreenElement) onCloseRef.current();
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => {
      window.clearTimeout(hideTimerRef.current);
      document.removeEventListener('fullscreenchange', handleFsChange);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, []);

  return (
    <div ref={containerRef} className={styles.container} onMouseMove={handleMouseMove}>
      <canvas ref={canvasRef} className={styles.canvas} onClick={handleCanvasClick} />
      {loading && <div className={styles.overlay}>Loading shader...</div>}
      {error && <div className={styles.overlay}>{error}</div>}
      <button type="button" aria-label="Previous effect" className={`${styles.navZone} ${styles.navZoneLeft}`} onClick={onPrev}>
        <svg className={styles.navArrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15,18 9,12 15,6" />
        </svg>
      </button>
      <button type="button" aria-label="Next effect" className={`${styles.navZone} ${styles.navZoneRight}`} onClick={onNext}>
        <svg className={styles.navArrow} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9,18 15,12 9,6" />
        </svg>
      </button>
      <button
        type="button"
        aria-label="Exit fullscreen"
        className={`${styles.closeBtn} ${closeVisible ? styles.closeBtnVisible : ''}`}
        onClick={() => document.exitFullscreen?.().catch(() => onClose())}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1,5 5,5 5,1" /><polyline points="13,9 9,9 9,13" />
          <line x1="5" y1="5" x2="0.5" y2="0.5" /><line x1="9" y1="9" x2="13.5" y2="13.5" />
        </svg>
      </button>
      {drawerOpen && (
        <AnimateDrawer
          effect={effect}
          state={state}
          bundle={bundle}
          onTemplateSelect={onTemplateSelect}
          canReset={canReset}
          onChange={onChange}
          onCommit={onCommit}
          onReset={onReset}
          onClose={closeDrawer}
          closing={drawerClosing}
          onAnimationEnd={finishDrawerClose}
          panelSlots={panelSlots}
        />
      )}
    </div>
  );
}
