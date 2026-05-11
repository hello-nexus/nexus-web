import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, AppWindow } from 'lucide-react';
import { postService } from '../../../api/service';
import { useAppIcon } from '../common/AppPicker';
import type { WidgetProps } from '../types';
import styles from './MacrosWidget.module.scss';

export function MacrosWidget({ widget }: WidgetProps) {
  const [pressed, setPressed] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => { clearTimeout(pressTimer.current); }, []);

  const title = widget.config?.title?.s;
  const action = widget.config?.action?.s;
  const url = widget.config?.url?.s;
  const shortcut = widget.config?.shortcut?.s;
  const icon = widget.config?.icon?.s;
  const appId = widget.config?.appId?.s;

  const isApp = action === 'app' && !!appId;
  const configured = !!(action && (title || isApp));
  const appIconUrl = useAppIcon(isApp ? appId : undefined);

  const handleClick = useCallback(async () => {
    if (!configured) return;

    setPressed(true);
    pressTimer.current = setTimeout(() => setPressed(false), 150);

    if (action === 'url' && url) {
      await postService('/panel/macros/open-url', { url });
    } else if (action === 'shortcut' && shortcut) {
      await postService('/panel/macros/shortcut', { keys: shortcut });
    } else if (action === 'app' && appId) {
      await postService(`/shortcuts/launch?targetId=${encodeURIComponent(appId)}`, {});
    }
  }, [configured, action, url, shortcut, appId]);

  return (
    <button
      type="button"
      className={`${styles.button} ${pressed ? styles.pressed : ''}`}
      onClick={handleClick}
      aria-label={title || 'Macro'}
    >
      {isApp && appIconUrl ? (
        <img src={appIconUrl} className={styles.appIcon} alt="" />
      ) : isApp ? (
        <AppWindow size={36} strokeWidth={1.5} className={styles.fallbackIcon} />
      ) : configured && icon ? (
        <span className={styles.emoji}>{icon}</span>
      ) : (
        <Plus size={28} strokeWidth={2} className={styles.fallbackIcon} />
      )}
    </button>
  );
}

export default MacrosWidget;
