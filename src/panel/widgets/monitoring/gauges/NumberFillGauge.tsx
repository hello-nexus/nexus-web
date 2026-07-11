import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './NumberFillGauge.module.scss';

// Linear fill: the bright water line sits at value% of the glyph height, so
// the max value fills to the top of the number and intermediate values read
// proportionally.
export function NumberFillGauge({ value, formatted, label }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const clipTop = 100 - clamped;
  const parts = splitFormatted(formatted);
  const renderText = () => (
    <>
      {parts.value}
      {parts.unit && <span className="panel-gauge-unit">{parts.unit}</span>}
    </>
  );

  return (
    <div className={styles.numberFill}>
      <div className={styles.textWrap}>
        <span className={styles.textDim} aria-hidden="true">{renderText()}</span>
        <span
          className={styles.textBright}
          style={{ clipPath: `inset(${clipTop}% 0 0 0)` }}
        >
          {renderText()}
        </span>
      </div>
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}

export default NumberFillGauge;
