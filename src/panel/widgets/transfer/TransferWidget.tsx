import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { Check, ClipboardCopy, Image as ImageIcon, X } from 'lucide-react';
import { pingService } from '../../../api/service';
import { sendTransferClipboard, uploadTransferItems } from '../../../api/transfer';
import { useNativeTransferBridge, type NativeTransferState } from '../../device/panelNativeBridge';
import { useTranslation } from '../../../lib/i18n';
import { usePanelPreview } from '../common/PanelPreviewContext';
import type { WidgetProps } from '../types';
import { TRANSFER_PREVIEW } from './transferPreviewData';
import styles from './TransferWidget.module.scss';

type TransferStatus = 'idle' | 'sending' | 'sent' | 'failed';

const STATUS_RESET_MS = 3000;

// Send-to-PC tile for paired phones. With the native app bridge the app picks
// and uploads itself (status driven by its progress events); in a plain
// mobile browser a hidden file input / clipboard read uploads via the
// authenticated REST helpers.
export function TransferWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const preview = usePanelPreview();
  const [status, setStatus] = useState<TransferStatus>('idle');
  const [machineName, setMachineName] = useState(preview ? TRANSFER_PREVIEW.machineName : '');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const settle = useCallback((next: 'sent' | 'failed') => {
    setStatus(next);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setStatus('idle'), STATUS_RESET_MS);
  }, []);

  // A pending settle() reset from a prior send would flip the new send back
  // to idle mid-upload.
  const begin = useCallback(() => {
    clearTimeout(resetTimer.current);
    setStatus('sending');
  }, []);

  useEffect(() => () => clearTimeout(resetTimer.current), []);

  const handleBridgeState = useCallback((state: NativeTransferState) => {
    // 'picking' keeps the current status — the native picker is open.
    if (state.phase === 'uploading') {
      begin();
    } else if (state.phase === 'done') {
      settle('sent');
    } else if (state.phase === 'error') {
      settle('failed');
    } else if (state.phase === 'cancelled') {
      clearTimeout(resetTimer.current);
      setStatus('idle');
    }
  }, [begin, settle]);

  const bridge = useNativeTransferBridge(!preview, handleBridgeState);

  useEffect(() => {
    if (preview) return;
    let cancelled = false;
    void pingService().then(res => {
      if (!cancelled && res?.machineName) setMachineName(res.machineName);
    });
    return () => { cancelled = true; };
  }, [preview]);

  const sendFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;
    begin();
    const res = await uploadTransferItems(files);
    settle(res && !res.error ? 'sent' : 'failed');
  }, [begin, settle]);

  const sendText = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    begin();
    const res = await sendTransferClipboard(trimmed);
    settle(res && !res.error ? 'sent' : 'failed');
  }, [begin, settle]);

  const handlePhoto = useCallback(() => {
    if (preview) return;
    if (bridge.canTransferFiles) {
      bridge.transferFiles();
      return;
    }
    fileInputRef.current?.click();
  }, [preview, bridge]);

  const handleClipboard = useCallback(() => {
    if (preview) return;
    if (bridge.canSendClipboard) {
      bridge.sendClipboard();
      return;
    }
    // readText needs a secure context + permission; on any failure fall back
    // to the manual paste box.
    if (typeof navigator.clipboard?.readText === 'function') {
      navigator.clipboard.readText()
        .then(text => {
          if (text.trim()) void sendText(text);
          else setPasteOpen(true);
        })
        .catch(() => setPasteOpen(true));
      return;
    }
    setPasteOpen(true);
  }, [preview, bridge, sendText]);

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files ? Array.from(e.currentTarget.files) : [];
    // Reset so re-picking the same file fires change again.
    e.currentTarget.value = '';
    void sendFiles(files);
  }, [sendFiles]);

  const handlePasteSend = useCallback(() => {
    void sendText(pasteText);
    setPasteText('');
    setPasteOpen(false);
  }, [sendText, pasteText]);

  const statusLine = status === 'sending' ? t('transfer.sending')
    : status === 'sent' ? t('transfer.sent')
    : status === 'failed' ? t('transfer.failed')
    : machineName ? t('transfer.sendTo', { name: machineName }) : '';

  return (
    <div className={styles.container} data-size={widget.size}>
      <div className={styles.status} data-state={status}>
        {status === 'sent' && <Check size={13} />}
        <span>{statusLine}</span>
      </div>
      {pasteOpen ? (
        <div className={styles.pasteRow}>
          <textarea
            className={styles.pasteInput}
            value={pasteText}
            placeholder={t('transfer.pasteText')}
            aria-label={t('transfer.pasteText')}
            rows={2}
            onChange={e => setPasteText(e.target.value)}
          />
          <div className={styles.pasteActions}>
            <button
              type="button"
              className={`panel-chip ${styles.actionBtn}`}
              aria-label={t('transfer.cancel')}
              onClick={() => { setPasteOpen(false); setPasteText(''); }}
            >
              <X size={16} />
            </button>
            <button
              type="button"
              className={`panel-chip ${styles.actionBtn} ${styles.sendBtn}`}
              disabled={!pasteText.trim() || status === 'sending'}
              onClick={handlePasteSend}
            >
              {t('transfer.send')}
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.controls}>
          <button
            type="button"
            className={`panel-chip ${styles.actionBtn}`}
            disabled={status === 'sending'}
            onClick={handlePhoto}
          >
            <ImageIcon size={16} />
            <span>{t('transfer.photo')}</span>
          </button>
          <button
            type="button"
            className={`panel-chip ${styles.actionBtn}`}
            disabled={status === 'sending'}
            onClick={handleClipboard}
          >
            <ClipboardCopy size={16} />
            <span>{t('transfer.clipboard')}</span>
          </button>
        </div>
      )}
      {!preview && !bridge.canTransferFiles && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className={styles.hiddenInput}
          aria-hidden="true"
          tabIndex={-1}
          onChange={handleFileChange}
        />
      )}
    </div>
  );
}

export default TransferWidget;
