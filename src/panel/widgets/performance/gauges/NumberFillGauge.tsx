import { splitFormatted } from './format';
import type { GaugeProps } from './types';
import styles from './NumberFillGauge.module.scss';

// Square-root mapping so single-digit changes produce visible fill deltas
// (1% -> ~10% bright, 2% -> ~14%, 5% -> ~22%) while 100% still maps to
// full. Linear mapping makes 1-12% indistinguishable from "nothing" since
// only the descenders of the glyphs sit in that band.
export function NumberFillGauge({ value, formatted, label }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const displayPct = clamped <= 0 ? 0 : Math.sqrt(clamped / 100) * 100;
  const clipTop = 100 - displayPct;
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
      <span className={styles.label}>{label}</span>
    </div>
  );
}

export default NumberFillGauge;
