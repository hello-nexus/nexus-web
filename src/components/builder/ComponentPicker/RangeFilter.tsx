import styles from './ComponentPicker.module.scss';

interface RangeFilterProps {
  min: string;
  max: string;
  onChange: (min: string, max: string) => void;
  unit?: string;
  placeholder?: { min?: string; max?: string };
}

export function RangeFilter({ min, max, onChange, unit, placeholder }: RangeFilterProps) {
  return (
    <div className={styles.rangeFilter}>
      <div className={styles.rangeInputWrap}>
        <input
          type="number"
          className={styles.rangeInput}
          placeholder={placeholder?.min ?? 'Min'}
          value={min}
          onChange={e => onChange(e.target.value, max)}
        />
        {unit && <span className={styles.rangeUnit}>{unit}</span>}
      </div>
      <span className={styles.rangeSep}>&ndash;</span>
      <div className={styles.rangeInputWrap}>
        <input
          type="number"
          className={styles.rangeInput}
          placeholder={placeholder?.max ?? 'Max'}
          value={max}
          onChange={e => onChange(min, e.target.value)}
        />
        {unit && <span className={styles.rangeUnit}>{unit}</span>}
      </div>
    </div>
  );
}
