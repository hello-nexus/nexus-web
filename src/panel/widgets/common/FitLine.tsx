import { useFitWidth } from './useFitWidth';
import styles from './FitLine.module.scss';

// One line of text kept whole on one line: it scales down to its container's
// width instead of wrapping or ellipsizing (a clock's date, the calendar's
// month name in a narrow tile). `className` goes on the box, so font, colour
// and line-height rules apply to the text through inheritance.
export function FitLine({ text, className, align = 'center' }: {
  text: string;
  className?: string;
  align?: 'center' | 'start';
}) {
  const { boxRef, contentRef, scale } = useFitWidth();

  return (
    <div ref={boxRef} className={`${className ?? ''} ${styles.box} ${align === 'start' ? styles.start : ''}`}>
      <span ref={contentRef} className={styles.text} style={{ transform: `scale(${scale})` }}>
        {text}
      </span>
    </div>
  );
}
