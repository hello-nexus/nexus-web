import { GaugeValue } from './GaugeValue';
import type { GaugeProps } from './types';
import { gaugeGradientCss } from '../../../theme/gaugeGradient';
import { gaugeBodyCss } from '../valueColor';
import styles from './NumberFillGauge.module.scss';

// Linear fill: the bright water line sits at value% of the glyph height, so
// the max value fills to the top of the number and intermediate values read
// proportionally.
export function NumberFillGauge({ value, formatted, label, gradient }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const clipTop = 100 - clamped;
  return (
    <div className={styles.numberFill}>
      <div className={styles.textWrap}>
        <span className={styles.textDim} aria-hidden="true">
          <GaugeValue formatted={formatted} textFill={gradient ? gaugeBodyCss(gradient, 0) : undefined} />
        </span>
        <span className={styles.textBright}>
          <GaugeValue
            formatted={formatted}
            clipTopPercent={clipTop}
            // The gradient spans the whole glyph height; the clip reveals it.
            textFill={gradient ? gaugeGradientCss(gradient.stops, 0) : undefined}
          />
        </span>
      </div>
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}

export default NumberFillGauge;
