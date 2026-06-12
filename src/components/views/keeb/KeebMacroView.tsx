import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, ListVideo, RefreshCw, Square as StopIcon } from 'lucide-react';
import {
  getKeebMacro,
  setKeebMacro,
  type KeebMacro,
  type MacroKey,
} from '../../../api/keeb';
import { Button } from '../../common/Button/Button';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { IconLabelButton } from '../../common/IconLabelButton/IconLabelButton';
import { Tabs, type TabDef } from '../../common/Tabs/Tabs';
import { useToast } from '../../common/Toast/Toast';
import { useTranslation } from '../../../lib/i18n';
import styles from './KeebMacroView.module.scss';

const MACRO_COUNT = 16;
type DelayMode = 'record' | 'custom';

const normalize = (ms: number) => Math.max(10, Math.round(ms / 10) * 10);

export interface KeebMacroViewProps {
  /** Whether the modal is currently open — used to gate the recorder. */
  open: boolean;
}

/// Macro tab body. Slot list on the left (1–16), editor on the right.
/// Recording attaches window key listeners and pushes Make/Break pairs;
/// durations snap to 10 ms multiples.
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- props (open gate) kept for signature stability
export function KeebMacroView(_: KeebMacroViewProps) {
  const { t } = useTranslation();
  const { push } = useToast();
  const [index, setIndex] = useState(0);
  const [macro, setMacro] = useState<KeebMacro | null>(null);
  const [delayMode, setDelayMode] = useState<DelayMode>('record');

  const delayModeTabs: readonly TabDef[] = useMemo(() => [
    { key: 'record', label: t('keeb.macro.recordDelay') },
    { key: 'custom', label: t('keeb.macro.customDelay') },
  ], [t]);
  const [customDelay, setCustomDelay] = useState(50);
  const [recordings, setRecordings] = useState<MacroKey[]>([]);
  const [isRecording, setIsRecording] = useState(false);

  // Recorder state. `times` tracks the last keydown timestamp per code so
  // we can compute the inter-press gap on keyup; `tailTimer` updates the
  // most-recent Break entry while no further keys are held.
  const times = useRef<Record<string, { keyDown: number; keyUp: number }>>({});
  const tailTimer = useRef<number | null>(null);
  const delayModeRef = useRef<DelayMode>(delayMode);
  const customDelayRef = useRef<number>(customDelay);
  useEffect(() => { delayModeRef.current = delayMode; }, [delayMode]);
  useEffect(() => { customDelayRef.current = customDelay; }, [customDelay]);

  // Slot fetch on selection change.
  useEffect(() => {
    let cancelled = false;
    void getKeebMacro(index).then(m => {
      if (cancelled) return;
      setMacro(m);
      setRecordings(m?.keys ?? []);
    });
    return () => { cancelled = true; };
  }, [index]);

  const record = useCallback((event: KeyboardEvent) => {
    if (tailTimer.current !== null) {
      window.clearInterval(tailTimer.current);
      tailTimer.current = null;
    }

    const key = event.code;
    const now = Date.now();
    const prev = times.current[key];

    if (event.type === 'keydown') {
      if (event.repeat) {
        // While the key is held, keep extending the duration of its last Make.
        if (!prev) return;
        const pressedMs = now - prev.keyDown;
        setRecordings(list => {
          const next = [...list];
          for (let i = next.length - 1; i >= 0; i--) {
            if (next[i]?.key === key && next[i]?.type === 'Make') {
              next[i] = { ...next[i], duration: normalize(pressedMs) };
              break;
            }
          }
          return next;
        });
        return;
      }
      // First press — push Make (10ms) + Break (configured delay).
      const breakDuration = delayModeRef.current === 'record' ? 10 : customDelayRef.current;
      setRecordings(list => [
        ...list,
        { key, duration: 10, type: 'Make', category: 'StandardKey' },
        { key, duration: normalize(breakDuration), type: 'Break', category: 'StandardKey' },
      ]);
      times.current[key] = { keyDown: now, keyUp: prev?.keyUp ?? 0 };
      return;
    }

    if (event.type === 'keyup') {
      times.current[key] = { keyDown: prev?.keyDown ?? now, keyUp: now };
      // In 'record' mode, grow the most recent Break's duration with
      // wall time until another key is pressed or recording stops.
      if (delayModeRef.current === 'record') {
        const start = now;
        tailTimer.current = window.setInterval(() => {
          const elapsed = Date.now() - start;
          setRecordings(list => {
            if (list.length === 0) return list;
            const next = [...list];
            for (let i = next.length - 1; i >= 0; i--) {
              if (next[i]?.type === 'Break') {
                next[i] = { ...next[i], duration: normalize(elapsed) };
                break;
              }
            }
            return next;
          });
        }, 100);
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    window.removeEventListener('keydown', record);
    window.removeEventListener('keyup', record);
    if (tailTimer.current !== null) {
      window.clearInterval(tailTimer.current);
      tailTimer.current = null;
    }
  }, [record]);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  /// Persist a recording set. On failure, roll the editor back to the last
  /// server-acknowledged macro and tell the user - the keyboard never got it.
  /// One toast per failure burst (an outage fails every save in a sequence
  /// like stop-recording + duration edits).
  const lastFailToastRef = useRef(0);
  const save = useCallback(async (keys: MacroKey[]) => {
    const saved = await setKeebMacro(index, keys);
    if (saved) {
      setMacro(saved);
      setRecordings(saved.keys);
      return;
    }
    setRecordings(macro?.keys ?? []);
    const now = Date.now();
    if (now - lastFailToastRef.current > 4000) {
      lastFailToastRef.current = now;
      push({ title: t('keeb.write.failedTitle'), body: t('keeb.write.failedBody') });
    }
  }, [index, macro, push, t]);

  const onToggleRecord = async () => {
    if (!isRecording) {
      window.addEventListener('keydown', record);
      window.addEventListener('keyup', record);
      setIsRecording(true);
      return;
    }
    stopListening();
    times.current = {};
    setIsRecording(false);
    await save(recordings);
  };

  const onClear = async () => {
    setRecordings([]);
    await save([]);
  };

  const onDurationEdit = (i: number, raw: string) => {
    const value = Number(raw);
    setRecordings(list => {
      const next = [...list];
      if (!next[i]) return next;
      next[i] = { ...next[i], duration: Number.isFinite(value) ? value : next[i].duration };
      return next;
    });
  };

  const onDurationCommit = async (i: number) => {
    const next = [...recordings];
    if (!next[i]) return;
    next[i] = { ...next[i], duration: normalize(next[i].duration) };
    setRecordings(next);
    await save(next);
  };

  const visibleKeys = isRecording ? recordings : (macro?.keys ?? recordings);

  return (
    <div className={styles.container}>
      <aside className={styles.slots} aria-label={t('keeb.macro.slotsAria')}>
        {Array.from({ length: MACRO_COUNT }, (_, i) => (
          <IconLabelButton
            key={i}
            label={t('keeb.macro.slotN', { n: i + 1 })}
            active={index === i}
            ariaLabel={t('keeb.macro.slotAriaN', { n: i + 1 })}
            className={styles.slotBtn}
            onPress={() => setIndex(i)}
          />
        ))}
      </aside>

      <section className={styles.editor}>
        <header className={styles.editorHeader}>
          <div className={styles.delayBlock}>
            <Tabs
              tabs={delayModeTabs}
              activeKey={delayMode}
              onChange={k => setDelayMode(k as DelayMode)}
              variant="pill"
              ariaLabel={t('keeb.macro.delayModeAria')}
            />
            {delayMode === 'custom' && (
              <div className={styles.delayRow}>
                <input
                  type="number"
                  min={10}
                  step={10}
                  value={customDelay}
                  onChange={e => setCustomDelay(Math.max(10, Number(e.target.value) || 10))}
                  className={styles.customInput}
                  aria-label={t('keeb.macro.customDelayAria')}
                />
                <span className={styles.unit}>{t('keeb.macro.ms')}</span>
              </div>
            )}
          </div>

          <div className={styles.actions}>
            {recordings.length > 0 && !isRecording && (
              <Button
                size="sm"
                tone="neutral"
                icon={<RefreshCw size={14} aria-hidden="true" />}
                onClick={() => void onClear()}
              >
                {t('keeb.macro.clear')}
              </Button>
            )}
            <Button
              size="sm"
              tone={isRecording ? 'danger' : 'accent'}
              icon={isRecording ? <StopIcon size={14} aria-hidden="true" /> : <Circle size={14} aria-hidden="true" />}
              onClick={() => void onToggleRecord()}
            >
              {isRecording ? t('keeb.macro.stop') : t('keeb.macro.start')}
            </Button>
          </div>
        </header>

        <div className={styles.recordingList} role="list" aria-live="polite">
          {visibleKeys.length === 0 && (
            <EmptyState
              icon={<ListVideo size={24} aria-hidden="true" />}
              title={t('keeb.macro.emptyTitle')}
              hint={t('keeb.macro.emptyHint')}
              compact
            />
          )}
          {visibleKeys.map((k, i) => (
            <div key={`${k.key}-${k.type}-${i}`} className={styles.recordRow} role="listitem">
              <span className={styles.recordKey}>{k.key}</span>
              <span className={styles.recordType}>{k.type}</span>
              <input
                type="number"
                min={10}
                step={10}
                value={k.duration}
                onChange={e => onDurationEdit(i, e.target.value)}
                onBlur={() => void onDurationCommit(i)}
                className={styles.recordDuration}
                aria-label={t('keeb.macro.durationAria', { key: k.key, type: k.type })}
              />
              <span className={styles.unit}>{t('keeb.macro.ms')}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
