import { useEffect, useMemo, useRef } from 'react';
import { caselessLayout, type CaselessParts } from './caselessParts';
import { createCaselessSceneRenderer, type CaselessSceneRenderer } from './caselessSceneRenderer';
import type { SceneLayout } from '../../../lib/scene/pcScene';
import styles from './BuildWidget.module.scss';

interface Props {
  layout: SceneLayout;
  parts: CaselessParts;
  label: string;
}

/** The detected parts in Build's own wireframe, inside a dashed outline of an empty case. */
export function BuildCaselessScene({ layout, parts, label }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CaselessSceneRenderer | null>(null);
  const shown = useMemo(() => caselessLayout(layout, parts), [layout, parts]);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    // A canvas per mount: a renderer's teardown ends its context, so a remount must not reuse the element.
    const canvas = document.createElement('canvas');
    canvas.className = styles.sceneCanvas;
    host.appendChild(canvas);
    const renderer = createCaselessSceneRenderer(canvas);
    rendererRef.current = renderer;
    renderer.setLayout(shownRef.current);
    renderer.resize();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => renderer.resize());
    resizeObserver?.observe(canvas);
    // The scene reads its colors from the theme tokens, so a theme or accent change redraws it.
    const themeObserver = new MutationObserver(() => renderer.refreshPalette());
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
    return () => {
      themeObserver.disconnect();
      resizeObserver?.disconnect();
      renderer.dispose();
      canvas.remove();
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    rendererRef.current?.setLayout(shown);
  }, [shown]);

  return <div ref={hostRef} className={styles.scene} role="img" aria-label={label} />;
}
