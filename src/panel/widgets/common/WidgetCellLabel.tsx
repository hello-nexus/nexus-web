import styles from './WidgetCellLabel.module.scss';

interface WidgetCellLabelProps {
  label: string;
}

// iOS-style centered text label rendered immediately below a widget cell or
// catalog preview tile. The strip height is owned by the panel root via the
// `--panel-widget-label-strip` CSS variable so the cell card and the label
// stay vertically aligned across both surfaces.
export function WidgetCellLabel({ label }: WidgetCellLabelProps) {
  return (
    <div className={styles.label}>
      {label}
    </div>
  );
}

export default WidgetCellLabel;
