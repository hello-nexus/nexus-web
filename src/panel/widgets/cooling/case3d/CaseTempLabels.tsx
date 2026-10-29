import { useEffect, useMemo, useRef } from 'react';
import { useUnitPrefs } from '../../../../hooks/useUiSettings';
import { useTranslation } from '../../../../lib/i18n';
import { convertTemperature, localizeNumbers, tempUnitSymbol } from '../../../../lib/units';
import { heatAnchors, type ComponentTemps } from '../../../../lib/cooling/flow/heatModel';
import type { CaseLayout } from '../../../../lib/cooling/caseLayout';
import type { CaseSceneRenderer } from './coolingCaseRenderer';
import styles from './CaseTempLabels.module.scss';

export interface CaseTempLabelsProps {
  renderer: CaseSceneRenderer | null;
  layout: CaseLayout;
  temps: ComponentTemps;
}

const LABEL_KEYS = { cpu: 'cooling.label.cpu', gpu: 'cooling.label.gpu' } as const;

/** One small label per component with a live temperature, riding on the component in the canvas. The renderer reports screen positions each frame and they are written straight to the elements, so a camera move re-renders nothing here. */
export function CaseTempLabels({ renderer, layout, temps }: CaseTempLabelsProps) {
  const { t } = useTranslation();
  const { monitoringTempUnit, numberFormat } = useUnitPrefs();
  const anchors = useMemo(() => heatAnchors(layout), [layout]);
  const shown = anchors.filter(a => temps[a.key] !== null);
  const els = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    if (!renderer) return undefined;
    renderer.setAnchors(anchors, positions => {
      for (const [key, el] of els.current) {
        const p = positions[key];
        if (!p || !p.visible) { el.style.visibility = 'hidden'; continue; }
        el.style.visibility = 'visible';
        el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
      }
    });
    return () => renderer.setAnchors([], () => {});
  }, [renderer, anchors]);

  return (
    <>
      {shown.map(a => (
        <div
          key={a.key}
          ref={el => { if (el) els.current.set(a.key, el); else els.current.delete(a.key); }}
          className={styles.label}
          data-testid={`temp-label-${a.key}`}
        >
          <span className={styles.name}>{t(LABEL_KEYS[a.key])}</span>
          <span className={styles.value}>{localizeNumbers(`${Math.round(convertTemperature(temps[a.key]!, monitoringTempUnit))}${tempUnitSymbol(monitoringTempUnit)}`, numberFormat)}</span>
        </div>
      ))}
    </>
  );
}
