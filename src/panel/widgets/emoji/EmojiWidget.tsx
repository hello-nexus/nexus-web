import { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { EmojiPicker } from '../common/EmojiPicker';
import type { WidgetProps } from '../types';
import styles from './EmojiWidget.module.scss';

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- signature must match WidgetProps for the registry
export function EmojiWidget(_props: WidgetProps) {
  const { t } = useTranslation();
  const [toast, setToast] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const handleEmojiClick = useCallback((emoji: string) => {
    navigator.clipboard.writeText(emoji).catch(() => {});
    setToast(true);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(false), 1200);
  }, []);

  return (
    <div className={styles.container}>
      <EmojiPicker className={styles.picker} onSelect={handleEmojiClick} />
      {toast && <div className={styles.toast}>{t('emoji.copied')}</div>}
    </div>
  );
}

export default EmojiWidget;
