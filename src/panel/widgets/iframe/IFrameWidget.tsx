// getSafeEmbedUrl is the URL allowlist the iframe widget enforces. Lives in
// the same file as the widget itself because it's the only consumer, and the
// security check is easier to audit when it sits next to the iframe markup.
 
import { Globe } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetProps } from '../types';
import styles from './IFrameWidget.module.scss';

export function IFrameWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const url = getSafeEmbedUrl(widget.config?.url as string | undefined);

  if (!url) {
    return (
      <div className={styles.container}>
        <div className={styles.placeholder}>
          <Globe size={28} strokeWidth={1.5} />
          <span>{t('panel.settings.setUrl')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <iframe
        className={styles.frame}
        src={url}
        sandbox="allow-scripts allow-popups"
        allow="autoplay"
        title="Embedded content"
      />
    </div>
  );
}

export function getSafeEmbedUrl(raw: string | undefined): string | null {
  if (!raw)
    return null;

  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export default IFrameWidget;
