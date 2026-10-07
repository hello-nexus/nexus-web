import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { fetchRecoveryRows, recoverFirmware } from '../api/firmwareRecovery';
import { ConfirmModal } from '../components/common/ConfirmModal/ConfirmModal';
import { useToastSafe } from '../components/common/Toast/Toast';
import { useTranslation } from '../lib/i18n';
import { findRecoveryRow } from '../lib/firmwareRecovery';
import { useFlashStatus, type FlashStatus } from './useFlashStatus';
import type { FirmwareStatusItem } from './useFirmwareStatus';

const RECOVERY_POLL_MS = 10_000;

/** Polls the lightweight recovery endpoint on mount, then on an interval while enabled; cleared while disabled. */
export function useRecoveryRow(enabled: boolean) {
  const [item, setItem] = useState<FirmwareStatusItem | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const rows = await fetchRecoveryRows();
    if (!mountedRef.current || !rows) return;
    setItem(findRecoveryRow(rows));
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      setItem(null);
      return;
    }
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, RECOVERY_POLL_MS);
    return () => {
      window.clearInterval(id);
      mountedRef.current = false;
    };
  }, [enabled, refresh]);

  return { item, refresh };
}

interface PendingRecover {
  item: FirmwareStatusItem;
  deviceType: string;
  version: string;
}

/**
 * Confirm dialog plus the start call for a recovery flash. `request` opens the dialog.
 * Success is announced with a toast: the recovery row is gone by then (the device left update mode).
 */
export function useRecoverConfirm(onStarted: () => void, status: FlashStatus | null, onFinished?: () => void) {
  const { t } = useTranslation();
  const { push } = useToastSafe();
  const [pending, setPending] = useState<PendingRecover | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // Set once the started flash has been seen active, so a stale "done" from an earlier flash never toasts.
  const startedRef = useRef<{ deviceType: string; name: string; sawActive: boolean } | null>(null);

  useEffect(() => {
    const started = startedRef.current;
    if (!started || !status || status.deviceType !== started.deviceType) return;
    if (status.active) {
      started.sawActive = true;
      return;
    }
    if (!started.sawActive || (status.phase !== 'done' && status.phase !== 'failed')) return;
    startedRef.current = null;
    onFinished?.();
    if (status.phase === 'done' && status.success) push({ title: t('devices.firmware.recovery.restored', { name: started.name }) });
  }, [status, push, t, onFinished]);

  const request = useCallback((item: FirmwareStatusItem, pick?: { firmwareType: string; version: string }) => {
    setError('');
    setPending({
      item,
      deviceType: pick?.firmwareType ?? item.firmwareType,
      version: pick?.version ?? item.availableVersion,
    });
  }, []);

  const confirm = useCallback(async () => {
    if (!pending || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    let res: Awaited<ReturnType<typeof recoverFirmware>> | null = null;
    try {
      res = await recoverFirmware(pending.deviceType, pending.version);
    } catch {
      res = null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    if (res?.started) {
      startedRef.current = { deviceType: pending.deviceType, name: pending.item.name, sawActive: false };
      setPending(null);
      onStarted();
      return;
    }
    setError(res?.msg || t('devices.firmware.recovery.startFailed'));
  }, [pending, onStarted, t]);

  const modal: ReactNode = (
    <ConfirmModal
      open={pending != null}
      title={t('devices.firmware.recovery.confirmTitle', { name: pending?.item.name ?? '' })}
      message={t('devices.firmware.recovery.confirmMessage', { name: pending?.item.name ?? '', version: pending?.version ?? '' })}
      note={error || undefined}
      // eslint-disable-next-line i18next/no-literal-string -- enum tone value, not user-facing text
      noteTone={error ? 'critical' : 'info'}
      confirmLabel={t('devices.firmware.recovery.action')}
      destructive={false}
      confirmDisabled={busy}
      onConfirm={() => { void confirm(); }}
      onCancel={() => setPending(null)}
    />
  );

  return { request, modal };
}

/** Everything a page needs to show the recovery banner and act on it. */
export function useFirmwareRecoveryFlow(enabled: boolean) {
  const { item, refresh } = useRecoveryRow(enabled);
  // Keeps the flash poll alive after the row drops mid-flash, so the finish (and its toast) is still seen.
  const [armed, setArmed] = useState(false);
  const { status, refresh: refreshFlash } = useFlashStatus(enabled && (item != null || armed));
  const onStarted = useCallback(() => {
    setArmed(true);
    void refreshFlash();
  }, [refreshFlash]);
  const onFinished = useCallback(() => setArmed(false), []);
  const { request, modal } = useRecoverConfirm(onStarted, status, onFinished);

  const phase = status?.phase;
  const active = !!status?.active;
  useEffect(() => {
    if (!active && (phase === 'done' || phase === 'failed')) void refresh();
  }, [active, phase, refresh]);

  // A run whose active window the poll missed never reports finished; stop once nothing is left to watch.
  useEffect(() => {
    if (armed && item == null && !active) setArmed(false);
  }, [armed, item, active]);

  return { item, status, request, modal };
}
