// getSafeEmbedUrl is the URL allowlist the iframe widget enforces.
 
import { Globe } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetProps } from '../types';
import { usePanelPreview } from '../common/PanelPreviewContext';
import styles from './IFrameWidget.module.scss';

export function IFrameWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();

  // Catalog preview: mock browser frame — no URL is built, no iframe mounts.
  if (preview) {
    return (
      <div className={styles.container}>
        <div className={styles.mock}>
          <div className={styles.chrome}>
            <span className={styles.chromeDot} />
            <span className={styles.chromeDot} />
            <span className={styles.chromeDot} />
            {/* eslint-disable-next-line i18next/no-literal-string -- mock preview domain */}
            <span className={styles.urlPill}>example.com</span>
          </div>
          <div className={styles.mockBody}>
            <span className={`${styles.skeletonLine} ${styles.w80}`} />
            <span className={`${styles.skeletonLine} ${styles.w60}`} />
            <span className={`${styles.skeletonLine} ${styles.w90}`} />
            <span className={`${styles.skeletonLine} ${styles.w40}`} />
          </div>
        </div>
      </div>
    );
  }

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
        title={t('iframe.frameTitle')}
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
