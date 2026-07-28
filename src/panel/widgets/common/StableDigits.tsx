import { Fragment } from 'react';
import styles from './StableDigits.module.scss';

// Reference glyph that fixes every cell's width; Lexend's widest digit.
const SIZER = '0';

// Lexend ships no tabular-figures feature, so font-variant-numeric cannot keep
// ticking digits from reflowing; each ASCII digit is centered in a cell sized
// by a hidden reference digit rendered in the same inherited font. A CSS
// metric unit (ch) is not safe here: its basis font can disagree with the
// font that actually draws the glyphs, which renders overlapping digits.
// Everything else (separators, AM/PM, non-ASCII numbering systems from Intl
// output) deliberately falls through at natural width.
export function StableDigits({ text }: { text: string }) {
  return (
    <>
      {Array.from(text).map((ch, i) =>
        ch >= '0' && ch <= '9' ? (
          <span key={i} className={styles.digit}>
            <span className={styles.sizer} aria-hidden="true">
              {SIZER}
            </span>
            <span className={styles.glyph}>{ch}</span>
          </span>
        ) : (
          <Fragment key={i}>{ch}</Fragment>
        ),
      )}
    </>
  );
}
