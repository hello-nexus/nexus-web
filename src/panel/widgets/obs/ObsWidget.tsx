import { useCallback, useEffect, useState } from 'react';
import { Clapperboard, Radio, RadioTower, RefreshCw, Video } from 'lucide-react';
import {
  connectObs,
  fetchObsStatus,
  launchObs,
  setObsScene,
  toggleObsRecording,
  toggleObsStreaming,
  type ObsStatusResponse,
} from '../../../api/obs';
import type { WidgetProps } from '../types';
import { usePanelPreview } from '../common/PanelPreviewContext';
import { OBS_PREVIEW } from './obsPreviewData';
import styles from './ObsWidget.module.scss';

export function ObsWidget({ widget }: WidgetProps) {
  const preview = usePanelPreview();
  const [status, setStatus] = useState<ObsStatusResponse | null>(preview ? OBS_PREVIEW : null);
  const [busy, setBusy] = useState(false);
  const connected = Boolean(status?.connected && !status.error);
  const compact = widget.size === '2x2';

  const refresh = useCallback(async () => {
    const next = await fetchObsStatus();
    if (next) setStatus(next);
  }, []);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    const tick = async () => {
      const next = await fetchObsStatus();
      if (!cancelled && next) setStatus(next);
    };
    tick();
    const timer = window.setInterval(tick, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [preview]);

  const run = useCallback(async (action: () => Promise<ObsStatusResponse | unknown | null>) => {
    setBusy(true);
    try {
      const next = await action();
      if (next && typeof next === 'object' && 'connected' in next) {
        setStatus(next as ObsStatusResponse);
      } else {
        await refresh();
      }
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  return (
    <div className={styles.obs} data-size={widget.size} data-connected={connected ? 'true' : 'false'}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <RadioTower size={compact ? 17 : 19} />
          <div>
            <div className={styles.statusLine}>
              <span className={styles.dot} />
              <span>{connected ? 'Connected' : status?.msg || 'Disconnected'}</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          className={styles.iconButton}
          onClick={() => run(connectObs)}
          disabled={busy}
          aria-label="Reconnect OBS"
        >
          <RefreshCw size={15} />
        </button>
      </header>

      {connected ? (
        <div className={styles.body}>
          <section className={styles.controlPanel}>
            <div className={styles.sceneNow}>
              <Clapperboard size={15} />
              <span>{status?.activeScene || 'No scene'}</span>
            </div>
            <div className={styles.actionGrid}>
              <button
                type="button"
                className={styles.action}
                data-active={status?.streaming ? 'true' : 'false'}
                onClick={() => run(toggleObsStreaming)}
                disabled={busy}
              >
                <Radio size={15} />
                <span>{status?.streaming ? 'Live' : 'Stream'}</span>
                {status?.streaming && <em>{formatDuration(status.streamingDurationMs)}</em>}
              </button>
              <button
                type="button"
                className={styles.action}
                data-active={status?.recording ? 'true' : 'false'}
                onClick={() => run(toggleObsRecording)}
                disabled={busy}
              >
                <Video size={15} />
                <span>{status?.recording ? 'Rec' : 'Record'}</span>
                {status?.recording && <em>{formatDuration(status.recordingDurationMs)}</em>}
              </button>
            </div>
          </section>

          {!compact && (
            <section className={styles.scenes} aria-label="OBS scenes">
              {(status?.scenes ?? []).map(scene => {
                const active = scene.name === status?.activeScene;
                return (
                  <button
                    key={scene.uuid || scene.name}
                    type="button"
                    className={styles.scene}
                    data-active={active ? 'true' : 'false'}
                    onClick={() => run(() => setObsScene(scene.name))}
                    disabled={busy || active}
                  >
                    {scene.name}
                  </button>
                );
              })}
            </section>
          )}
        </div>
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyText}>{status?.msg || 'OBS WebSocket is not connected'}</div>
          <div className={styles.emptyActions}>
            <button type="button" className="panel-chip" onClick={() => run(connectObs)} disabled={busy}>
              Connect
            </button>
            <button type="button" className="panel-chip" onClick={() => run(launchObs)} disabled={busy}>
              Launch
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '00:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default ObsWidget;
