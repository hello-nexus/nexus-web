import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, ListVideo, Trash2, X, Square as StopIcon } from 'lucide-react';
import type { KeebMacro, MacroKey, SetMacroResponse } from '../../../api/keeb';
import { Button } from '../../common/Button/Button';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { IconLabelButton } from '../../common/IconLabelButton/IconLabelButton';
import { Tabs, type TabDef } from '../../common/Tabs/Tabs';
import { useTranslation } from '../../../lib/i18n';
import styles from './KeebMacroView.module.scss';

const MACRO_COUNT = 16;
type DelayMode = 'record' | 'custom';

const normalize = (ms: number) => Math.max(10, Math.round(ms / 10) * 10);

// Onboard stream budget: 256 bytes minus the 2-byte repeat header, the
// 2-byte terminator, and the firmware's 4-byte reserved tail (its factory
// sentinel). Entries cost 2 bytes (delay <= 1260 ms) or 4 (longer).
const BUDGET_BYTES = 248;
const entryBytes = (k: MacroKey) => (Math.max(1, Math.round(k.duration / 10)) <= 126 ? 2 : 4);
const usedBytes = (keys: MacroKey[]) => keys.reduce((sum, k) => sum + entryBytes(k), 0);

// Compact display names for KeyboardEvent.code values. Key names are scancode
// identifiers (like the printed legends), not translated copy.
const PRETTY_CODES: Record<string, string> = {
  ControlLeft: 'Ctrl', ControlRight: 'R Ctrl',
  ShiftLeft: 'Shift', ShiftRight: 'R Shift',
  AltLeft: 'Alt', AltRight: 'R Alt',
  MetaLeft: 'Meta', MetaRight: 'R Meta',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  IntlBackslash: 'ISO \\',
  Space: 'Space', Enter: 'Enter', Escape: 'Esc', Backspace: 'Bksp', Tab: 'Tab',
  CapsLock: 'Caps', ContextMenu: 'Menu', PrintScreen: 'PrtSc', ScrollLock: 'ScrLk',
  NumpadDivide: 'Num /', NumpadMultiply: 'Num *', NumpadSubtract: 'Num -',
  NumpadAdd: 'Num +', NumpadEnter: 'Num ⏎', NumpadDecimal: 'Num .',
};
function keyLabel(code: string): string {
  if (PRETTY_CODES[code]) return PRETTY_CODES[code];
  if (code.startsWith('Key') && code.length === 4) return code.slice(3);
  if (code.startsWith('Digit') && code.length === 6) return code.slice(5);
  if (code.startsWith('Numpad') && code.length === 7) return `Num ${code.slice(6)}`;
  return code;
}

export interface KeebMacroViewProps {
  loadMacro: (index: number) => Promise<KeebMacro | null>;
  saveMacro: (index: number, keys: MacroKey[]) => Promise<SetMacroResponse | null>;
}

/// Macro tab body. Slot list on the left, editor on the right.
///
/// The recorder captures the raw press/release stream: keydown appends a
/// Make, keyup appends its Break, so overlapping holds (Ctrl+C chords)
/// replay exactly as typed - each entry's duration is the time until the
/// NEXT action, which is the wire semantic the firmware plays back.
/// Recording REPLACES the slot's previous content; captured events are
/// preventDefault-ed so shortcuts don't fire while recording.
///
/// Persistence flows through the loadMacro/saveMacro props; the page owns
/// failure toasts, while save-side diagnostics (truncation, unplayable keys,
/// keyboard offline) render inline here.
export function KeebMacroView({ loadMacro, saveMacro }: KeebMacroViewProps) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [recordings, setRecordings] = useState<MacroKey[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [delayMode, setDelayMode] = useState<DelayMode>('record');
  const [customDelay, setCustomDelay] = useState(50);
  // Save-side diagnostics from the last ack, cleared on slot change.
  const [notice, setNotice] = useState<{ truncated: boolean; dropped: string[]; offline: boolean } | null>(null);

  const delayModeTabs: readonly TabDef[] = useMemo(() => [
    { key: 'record', label: t('keeb.macro.recordDelay') },
    { key: 'custom', label: t('keeb.macro.customDelay') },
  ], [t]);

  // Recorder state. `lastEventAt` timestamps the previous action so its
  // duration can be finalized when the next one arrives; `held` tracks
  // depressed keys so repeats and stray keyups are ignored and anything
  // still held on Stop gets a closing Break.
  const lastEventAtRef = useRef<number | null>(null);
  const heldRef = useRef<Set<string>>(new Set());
  // Last server-acked keys, the rollback target when a save fails.
  const ackedRef = useRef<MacroKey[]>([]);
  const delayModeRef = useRef<DelayMode>(delayMode);
  const customDelayRef = useRef<number>(customDelay);
  useEffect(() => { delayModeRef.current = delayMode; }, [delayMode]);
  useEffect(() => { customDelayRef.current = customDelay; }, [customDelay]);

  // Slot fetch on selection change.
  useEffect(() => {
    let cancelled = false;
    void loadMacro(index).then(m => {
      if (cancelled) return;
      ackedRef.current = m?.keys ?? [];
      setRecordings(m?.keys ?? []);
      setNotice(null);
    });
    return () => { cancelled = true; };
  }, [index, loadMacro]);

  const pushAction = useCallback((key: string, type: MacroKey['type']) => {
    const now = performance.now();
    const custom = delayModeRef.current === 'custom';
    // Capture the previous timestamp BEFORE scheduling the state update: the
    // updater runs later in the render, after the ref has already advanced
    // to this event, so reading it inside would measure a zero gap.
    const prevAt = lastEventAtRef.current;
    lastEventAtRef.current = now;
    setRecordings(list => {
      const next = [...list];
      // Finalize the previous action's duration with the measured gap. In
      // custom mode every action keeps the fixed delay instead.
      if (!custom && next.length > 0 && prevAt !== null) {
        next[next.length - 1] = { ...next[next.length - 1], duration: normalize(now - prevAt) };
      }
      next.push({ key, type, duration: custom ? normalize(customDelayRef.current) : 10 });
      return next;
    });
  }, []);

  const record = useCallback((event: KeyboardEvent) => {
    // Captured keys must not also act on the page (Tab moving focus, browser
    // shortcuts, Space scrolling).
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    const code = event.code;
    if (!code) return;
    if (event.type === 'keydown') {
      if (heldRef.current.has(code)) return;
      heldRef.current.add(code);
      pushAction(code, 'Make');
      return;
    }
    if (event.type === 'keyup') {
      if (!heldRef.current.has(code)) return; // pressed before recording began
      heldRef.current.delete(code);
      pushAction(code, 'Break');
    }
  }, [pushAction]);

  const stopListening = useCallback(() => {
    window.removeEventListener('keydown', record, true);
    window.removeEventListener('keyup', record, true);
  }, [record]);

  useEffect(() => () => { stopListening(); }, [stopListening]);

  /// Persist a working set. On failure, roll the editor back to the last
  /// server-acknowledged macro - the keyboard never got it. The page owns
  /// failure toasts; save diagnostics render inline.
  const save = useCallback(async (keys: MacroKey[]) => {
    const saved = await saveMacro(index, keys);
    if (saved) {
      ackedRef.current = saved.macro.keys;
      setRecordings(saved.macro.keys);
      setNotice(saved.truncated || saved.droppedKeys.length > 0 || !saved.wroteDevice
        ? { truncated: saved.truncated, dropped: saved.droppedKeys, offline: !saved.wroteDevice }
        : null);
      return;
    }
    setRecordings(ackedRef.current);
  }, [index, saveMacro]);

  const onToggleRecord = async () => {
    if (!isRecording) {
      // Recording replaces the slot's previous content.
      setRecordings([]);
      setNotice(null);
      heldRef.current.clear();
      lastEventAtRef.current = null;
      window.addEventListener('keydown', record, true);
      window.addEventListener('keyup', record, true);
      setIsRecording(true);
      return;
    }
    stopListening();
    setIsRecording(false);
    // Close any keys still held so playback never leaves one stuck down.
    const trailing: MacroKey[] = [...heldRef.current].map(code => ({
      key: code,
      type: 'Break' as const,
      duration: 10,
    }));
    heldRef.current.clear();
    lastEventAtRef.current = null;
    const finalKeys = [...recordings, ...trailing];
    setRecordings(finalKeys);
    await save(finalKeys);
  };

  const onClear = async () => {
    setRecordings([]);
    await save([]);
  };

  const onDeleteRow = async (i: number) => {
    const next = recordings.filter((_, idx) => idx !== i);
    setRecordings(next);
    await save(next);
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
    // Blur without an actual change must not rewrite onboard storage.
    if (next.length === ackedRef.current.length
      && next[i].duration === ackedRef.current[i]?.duration) {
      return;
    }
    await save(next);
  };

  const used = usedBytes(recordings);

  return (
    <div className={styles.container}>
      <aside className={styles.slots} aria-label={t('keeb.macro.slotsAria')}>
        {Array.from({ length: MACRO_COUNT }, (_, i) => (
          <IconLabelButton
            key={i}
            label={t('keeb.macro.slotN', { n: i + 1 })}
            active={index === i}
            disabled={isRecording}
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
              disabled={isRecording}
              onChange={k => setDelayMode(k as DelayMode)}
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
            <span
              className={`${styles.budget} ${used > BUDGET_BYTES ? styles.budgetOver : ''}`}
              title={used > BUDGET_BYTES ? t('keeb.macro.overBudget') : undefined}
            >
              {t('keeb.macro.budget', { used, max: BUDGET_BYTES })}
            </span>
            {recordings.length > 0 && !isRecording && (
              <Button
                size="sm"
                tone="neutral"
                icon={<Trash2 size={14} aria-hidden="true" />}
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

        {notice && (
          <div className={styles.notice} role="status">
            {notice.truncated && <span>{t('keeb.macro.truncatedWarn')}</span>}
            {notice.dropped.length > 0 && (
              <span>{t('keeb.macro.droppedWarn', { keys: notice.dropped.join(', ') })}</span>
            )}
            {notice.offline && <span>{t('keeb.macro.savedOffline')}</span>}
          </div>
        )}

        <div className={styles.recordingList} role="list" aria-live="polite">
          {recordings.length === 0 && (
            <EmptyState
              icon={<ListVideo size={24} aria-hidden="true" />}
              title={t('keeb.macro.emptyTitle')}
              hint={t('keeb.macro.emptyHint')}
              compact
            />
          )}
          {recordings.map((k, i) => (
            <div key={`${k.key}-${k.type}-${i}`} className={styles.recordRow} role="listitem">
              <span className={styles.recordKey}>{keyLabel(k.key)}</span>
              <span className={styles.recordType}>
                {k.type === 'Make' ? t('keeb.macro.press') : t('keeb.macro.release')}
              </span>
              <input
                type="number"
                min={10}
                step={10}
                value={k.duration}
                disabled={isRecording}
                onChange={e => onDurationEdit(i, e.target.value)}
                onBlur={() => void onDurationCommit(i)}
                className={styles.recordDuration}
                aria-label={t('keeb.macro.durationAria', { key: keyLabel(k.key), type: k.type })}
              />
              <span className={styles.unit}>{t('keeb.macro.ms')}</span>
              <button
                type="button"
                className={styles.rowDelete}
                disabled={isRecording}
                aria-label={t('keeb.macro.deleteEntryAria', { key: keyLabel(k.key), type: k.type })}
                onClick={() => void onDeleteRow(i)}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
