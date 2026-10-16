import { useSyncExternalStore } from 'react';
import { ArrowLeft, RotateCw, X } from 'lucide-react';
import { Button } from '../../../components/common/Button/Button';
import { useTranslation } from '../../../lib/i18n';
import { useImmersiveExit } from '../../overlays/immersiveExit';
import { webViewHost } from '../../webview/webViewHost';
import type { WidgetProps } from '../types';
import { WebViewSurface } from './WebViewSurface';
import styles from './WebViewWidget.module.scss';

/**
 * Fullscreen view. The strip above the surface keeps the overlay's close notch
 * and swipe reachable and the strip below carries the controls, so neither
 * needs a touch on the native area.
 */
export function WebViewImmersive({ widget, surface, editorPreview }: WidgetProps) {
  const { t } = useTranslation();
  const exit = useImmersiveExit();
  const snapshot = useSyncExternalStore(webViewHost.subscribe, webViewHost.getSnapshot);
  const canGoBack = snapshot.status === 'supported' && snapshot.views[widget.id]?.canGoBack === true;
  const controlsLive = snapshot.status === 'supported';

  return (
    <div className={styles.immersive}>
      <div className={styles.topStrip} aria-hidden="true" />
      <WebViewSurface widget={widget} surface={surface} editorPreview={editorPreview} immersive />
      <div className={styles.toolbar} role="toolbar" aria-label={t('panel.widget.web-view.toolbar')}>
        <Button
          icon={<X size={18} />}
          aria-label={t('panel.widget.web-view.close')}
          title={t('panel.widget.web-view.close')}
          onClick={() => exit?.()}
        />
        <Button
          icon={<ArrowLeft size={18} />}
          aria-label={t('panel.widget.web-view.back')}
          title={t('panel.widget.web-view.back')}
          disabled={!canGoBack}
          onClick={() => webViewHost.sendCommand(widget.id, 'back')}
        />
        <Button
          icon={<RotateCw size={18} />}
          aria-label={t('panel.widget.web-view.reload')}
          title={t('panel.widget.web-view.reload')}
          disabled={!controlsLive}
          onClick={() => webViewHost.sendCommand(widget.id, 'reload')}
        />
      </div>
    </div>
  );
}
