import { useCallback, useMemo } from 'react';
import { Camera, SwitchCamera, Video, VideoOff } from 'lucide-react';
import { isTunnelActive } from '../../../api/service';
import { isNativeApp } from '../../device/panelNativeBridge';
import { useTranslation } from '../../../lib/i18n';
import { PanelWidgetEmpty } from '../common/PanelWidgetChrome';
import { usePanelPreview } from '../common/PanelPreviewContext';
import type { WidgetProps } from '../types';
import { readCameraConfig } from './cameraConfig';
import {
  CAMERA_IDLE_STATE,
  useCameraCapture,
  type CameraErrorReason,
} from './useCameraCapture';
import styles from './CameraWidget.module.scss';

const ERROR_KEYS: Record<CameraErrorReason, string> = {
  permission: 'panel.widget.camera.error.permission',
  noCamera: 'panel.widget.camera.error.noCamera',
  unsupported: 'panel.widget.camera.unsupported',
  start: 'panel.widget.camera.error.start',
  connection: 'panel.widget.camera.error.connection',
};

/**
 * Phone-side capture tile for phone-as-webcam: live muted preview while the
 * camera runs, an explicit start/stop toggle (capture NEVER autostarts), and
 * a red in-use indicator whenever the camera is held. LAN/direct only - over
 * the relay tunnel the tile explains itself instead of offering start.
 */
export function CameraWidget({ widget, immersive = false }: WidgetProps & { immersive?: boolean }) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const config = useMemo(() => readCameraConfig(widget.config), [widget.config]);
  const { state: liveState, start, stop, flip } = useCameraCapture(config);
  // The catalog preview tile must stay static even while a real session runs.
  const state = preview ? CAMERA_IDLE_STATE : liveState;

  const attachPreview = useCallback((el: HTMLVideoElement | null) => {
    if (!el || el.srcObject === state.stream) return;
    el.srcObject = state.stream;
    try {
      const playing = el.play();
      if (playing) void playing.catch(() => { /* autoplay covers it */ });
    } catch { /* non-media test envs */ }
  }, [state.stream]);

  if (!preview && isTunnelActive()) {
    return (
      <PanelWidgetEmpty
        icon={<Camera size={22} />}
        title={t('panel.widget.camera')}
        text={t('panel.widget.camera.notLan')}
      />
    );
  }

  // Capture is wrapper-app only: phone browsers either lack a secure context
  // (Android http panel) or have an unsupported lifecycle. The app injects
  // the native bridge at document start.
  if (!preview && !isNativeApp()) {
    return (
      <PanelWidgetEmpty
        icon={<Camera size={22} />}
        title={t('panel.widget.camera')}
        text={t('panel.widget.camera.openInApp')}
      />
    );
  }

  const capturing = state.phase === 'starting' || state.phase === 'streaming';
  const statusLine =
    state.phase === 'streaming'
      ? (state.cameraName
        ? t('panel.widget.camera.streamingAs', { name: state.cameraName })
        : t('panel.widget.camera.streaming'))
      : state.phase === 'starting'
        ? t('panel.widget.camera.connecting')
        : state.phase === 'error' && state.error
          ? t(ERROR_KEYS[state.error])
          : '';

  const handleToggle = () => {
    if (preview) return;
    if (capturing) stop();
    else start();
  };

  return (
    <div className={styles.container} data-size={widget.size} data-live={capturing ? 'true' : 'false'}>
      {capturing && state.stream && (
        <video
          ref={attachPreview}
          className={styles.video}
          data-fit={immersive ? 'contain' : 'cover'}
          autoPlay
          muted
          playsInline
        />
      )}
      {capturing && (
        <div className={styles.inUse}>
          <span className={styles.inUseDot} aria-hidden="true" />
          <span>{t('panel.widget.camera.inUse')}</span>
        </div>
      )}
      <div className={styles.hud}>
        <div className={styles.status} data-phase={state.phase}>
          {statusLine && <span>{statusLine}</span>}
        </div>
        <button
          type="button"
          className={`panel-chip ${styles.actionBtn}`}
          data-live={capturing ? 'true' : 'false'}
          onClick={handleToggle}
        >
          {capturing ? <VideoOff size={16} /> : <Video size={16} />}
          <span>{capturing ? t('panel.widget.camera.stop') : t('panel.widget.camera.start')}</span>
        </button>
        {!config.deviceId && (
          <button
            type="button"
            className={`panel-chip ${styles.actionBtn}`}
            aria-label={t('panel.widget.camera.flip')}
            onClick={() => { if (!preview) flip(); }}
          >
            <SwitchCamera size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

export default CameraWidget;
