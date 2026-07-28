import { Fragment } from 'react';
import styles from './StableDigits.module.scss';

// Lexend ships no tabular-figures feature, so font-variant-numeric cannot keep
// ticking digits from reflowing; each ASCII digit gets a fixed-width cell
// instead. Everything else (separators, AM/PM, non-ASCII numbering systems
// from Intl output) deliberately falls through at natural width.
export function StableDigits({ text }: { text: string }) {
  return (
    <>
      {Array.from(text).map((ch, i) =>
        ch >= '0' && ch <= '9' ? (
          <span key={i} className={styles.digit}>
            {ch}
          </span>
        ) : (
          <Fragment key={i}>{ch}</Fragment>
        ),
      )}
    </>
  );
}
