import { memo, useEffect, useRef, useState } from 'react';
import { Fan, Plus } from 'lucide-react';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { useTranslation } from '../../../../lib/i18n';
import { MAX_CURVES, type CurveDef } from '../../../../types/cooling';
import { presetIconFor } from './coolingPresets';
import styles from '../CoolingPage.module.scss';

/**
 * Curve-selector chip row: one chip-action pill per curve (Silent/Balanced/
 * Turbo first, then custom curves) with a fan-count caption beneath each, and
 * the dashed add chip at the end. Shared by the desktop CoolingPage and the
 * immersive editor, nested inside the pinned CurveCard on both.
 */
export const CurveSelector = memo(function CurveSelector({
  curves, selectedCurveId, curveFanCounts, onSelect, onAdd,
}: {
  curves: CurveDef[];
  selectedCurveId: string | null;
  /** Number of connected fans bound to each curve, shown under its chip. */
  curveFanCounts: Map<string, number>;
  onSelect: (id: string) => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation();

  // Spin the curve's fan-count icon once whenever a fan is newly bound to it
  // (count goes up). The class is cleared on animationEnd, not a timer.
  const [spinningCurves, setSpinningCurves] = useState<Set<string>>(() => new Set());
  const prevFanCounts = useRef<Map<string, number>>(new Map());
  const didInitFanCounts = useRef(false);
  useEffect(() => {
    if (didInitFanCounts.current) {
      const added: string[] = [];
      curveFanCounts.forEach((count, id) => {
        if (count > (prevFanCounts.current.get(id) ?? 0)) added.push(id);
      });
      if (added.length) {
        setSpinningCurves(s => {
          const n = new Set(s);
          added.forEach(id => n.add(id));
          return n;
        });
      }
    }
    prevFanCounts.current = new Map(curveFanCounts);
    didInitFanCounts.current = true;
  }, [curveFanCounts]);

  const presetOrder = ['silent', 'balanced', 'turbo'] as const;
  const ordered = [
    ...presetOrder.map(p => curves.find(c => c.preset === p)).filter((c): c is CurveDef => !!c),
    ...curves.filter(c => !c.preset),
  ];

  return (
    <div className={styles.curveSelector}>
      <span className={styles.curveFieldHeader}>{t('cooling.sections.curves')}</span>
      <div className={styles.curveButtons} role="group" aria-label={t('cooling.sections.curves')}>
        {ordered.map(c => {
          const PresetIcon = presetIconFor(c.preset);
          const viewing = c.id === selectedCurveId;
          const fanCount = curveFanCounts.get(c.id) ?? 0;
          return (
            <div key={c.id} className={styles.curveBtnCell}>
              <button
                type="button"
                aria-current={viewing || undefined}
                className={`chip-action${viewing ? ' chip-active' : ''}`}
                onClick={() => onSelect(c.id)}
              >
                {PresetIcon && <PresetIcon size={14} aria-hidden />}
                <span className={styles.curveBtnName}>{c.name}</span>
              </button>
              {fanCount > 0 && (
                <span
                  className={styles.curveBtnCount}
                  data-spinning={spinningCurves.has(c.id) || undefined}
                  onAnimationEnd={() => setSpinningCurves(s => {
                    if (!s.has(c.id)) return s;
                    const n = new Set(s);
                    n.delete(c.id);
                    return n;
                  })}
                >
                  <Fan size={12} aria-hidden /> {fanCount}
                </span>
              )}
            </div>
          );
        })}
        {curves.length >= MAX_CURVES ? (
          <div className={styles.curveBtnCell}>
            <HoverTooltip body={t('cooling.curves.maxReached')} side="top">
              <button type="button" className={`chip-action ${styles.curveAddBtn}`} disabled>
                <Plus size={14} aria-hidden />
                <span className={styles.curveBtnName}>{t('cooling.curves.add')}</span>
              </button>
            </HoverTooltip>
          </div>
        ) : (
          <div className={styles.curveBtnCell}>
            <button type="button" className={`chip-action ${styles.curveAddBtn}`} onClick={onAdd}>
              <Plus size={14} aria-hidden />
              <span className={styles.curveBtnName}>{t('cooling.curves.add')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
