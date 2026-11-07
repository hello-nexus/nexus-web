import { useEffect, useRef } from 'react';
import { useTranslation } from '../../../../lib/i18n';
import { declutterPills } from '../../../../lib/cooling/slotProduct';
import type { CaseSceneRenderer, PointAnchor } from './coolingCaseRenderer';
import styles from './FanCfmPills.module.scss';

export interface FanCfmPillsProps {
  renderer: CaseSceneRenderer | null;
  /** One anchor per fan that has its own product: the fan's center in layout mm. */
  fans: readonly PointAnchor[];
  /** Current airflow of each fan, CFM, by slot key. */
  cfm: Readonly<Record<string, number>>;
}

const OWNER = 'fan-cfm';
// Roughly one pill's size on screen, so neighbours closer than this are pushed apart.
const PILL_WIDTH_PX = 72;
const PILL_HEIGHT_PX = 22;

/** A small airflow pill on each fan that has its own product, riding on the fan in the canvas like the temperature labels. Positions are written straight to the elements each frame, and the pills take no pointer input, so fans stay pickable through them. */
export function FanCfmPills({ renderer, fans, cfm }: FanCfmPillsProps) {
  const { t } = useTranslation();
  const els = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!renderer || fans.length === 0) return undefined;
    renderer.setAnchors(fans, positions => {
      const shown = [...els.current.keys()].filter(key => positions[key]?.visible).map(key => ({ key, x: positions[key].x, y: positions[key].y }));
      const offsets = declutterPills(shown, PILL_WIDTH_PX, PILL_HEIGHT_PX);
      for (const [key, el] of els.current) {
        const p = positions[key];
        if (!p || !p.visible) { el.style.visibility = 'hidden'; continue; }
        el.style.visibility = 'visible';
        el.style.transform = `translate(${p.x}px, ${p.y + (offsets[key] ?? 0)}px) translate(-50%, -50%)`;
      }
    }, OWNER);
    return () => renderer.setAnchors([], () => {}, OWNER);
  }, [renderer, fans]);

  return (
    <>
      {fans.map(a => (
        <div
          key={a.key}
          ref={el => { if (el) els.current.set(a.key, el); else els.current.delete(a.key); }}
          className={styles.pill}
          data-testid={`fan-cfm-${a.key}`}
          data-cfm={Math.round(cfm[a.key] ?? 0)}
        >
          {t('cooling.case3d.cfm', { value: String(Math.round(cfm[a.key] ?? 0)) })}
        </div>
      ))}
    </>
  );
}
