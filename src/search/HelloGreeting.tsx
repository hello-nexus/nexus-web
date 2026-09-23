import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../lib/i18n';
import styles from './HelloGreeting.module.scss';

const TYPE_MS_PER_CHAR = 40;

/**
 * Renders a greeting string in the top search bar's resting title slot,
 * typed out one character at a time then left resting at baseline.
 * `textKey` drives a fresh mount per greeting (the caller keys this
 * component so a repeated random pick still replays).
 */
export function HelloGreeting({ textKey }: { textKey: string }) {
  const { t } = useTranslation();
  const text = t(textKey);
  const chars = useMemo(() => Array.from(text), [text]);

  const [typedCount, setTypedCount] = useState(0);

  useEffect(() => {
    if (chars.length === 0) {
      setTypedCount(chars.length);
      return;
    }
    setTypedCount(0);
    let cancelled = false;
    let i = 0;
    let timeoutId: ReturnType<typeof window.setTimeout>;
    const tick = () => {
      if (cancelled) return;
      i += 1;
      setTypedCount(i);
      if (i < chars.length) timeoutId = window.setTimeout(tick, TYPE_MS_PER_CHAR);
    };
    timeoutId = window.setTimeout(tick, TYPE_MS_PER_CHAR);
    return () => { cancelled = true; window.clearTimeout(timeoutId); };
  }, [chars.length]);

  return (
    <h1 className={styles.greeting} aria-label={text}>
      {chars.slice(0, typedCount).join('')}
    </h1>
  );
}
