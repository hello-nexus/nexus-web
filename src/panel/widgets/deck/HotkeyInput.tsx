import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { Select, type SelectOption } from '../../../components/common/Select/Select';
import { HOTKEY_PRESET_CATEGORIES, findHotkeyPreset, hotkeyPresetId } from './hotkeyPresets';
import styles from './HotkeyInput.module.scss';

interface HotkeyInputProps {
  value: string;
  onChange: (keys: string) => void;
  disabled?: boolean;
  /** Text shown for `value` while not capturing, e.g. platform glyphs; defaults to the raw value. */
  display?: string;
  /** Drops the deck preset dropdown, for callers that only want a recorded chord. */
  hidePresets?: boolean;
  /** Fires when recording starts and ends (including blur), so a caller can pause what the chord would trigger. */
  onCaptureChange?: (capturing: boolean) => void;
  /** A bare Esc while recording abandons it, keeping the old value, instead of being recorded. */
  cancelOnEscape?: boolean;
}

const MOD_CODES = new Set([
  'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
  'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
]);

// Only keys the executors (touch /system/input/keys and the physical
// DeckActionExecutor) can actually inject are capturable; capturing a key that
// no injector maps would store a chord that silently does nothing. The named
// punctuation here mirrors DeckActionExecutor.CanonicalKey (nexus-service) and
// deckExecutor.ts's own canonicalKey, so a captured token always resolves on
// both the physical and widget dispatch paths.
const NAMED: Record<string, string> = {
  Space: 'space', Enter: 'enter', NumpadEnter: 'enter', Tab: 'tab', Escape: 'escape',
  Backspace: 'backspace', Delete: 'delete', Insert: 'insert', Home: 'home', End: 'end',
  PageUp: 'pageup', PageDown: 'pagedown',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  PrintScreen: 'printscreen', Period: '.',
  Comma: ',', Slash: '/', Semicolon: ';', Quote: "'",
  BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
};

function codeToToken(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code.toLowerCase();
  return NAMED[code] ?? '';
}

/**
 * Captures a key chord and emits a "ctrl+shift+m"-style string the executor
 * parses. Rendered as a text-input-styled field that still records on
 * click/focus; a "Preset actions" dropdown above it fills the field from a
 * categorized preset list (mirrors Stream Deck's own hotkey picker) without
 * requiring a capture at all.
 */
export function HotkeyInput({ value, onChange, disabled = false, display, hidePresets = false, onCaptureChange, cancelOnEscape = false }: HotkeyInputProps) {
  const { t } = useTranslation();
  const [capturing, setCapturing] = useState(false);
  const captureCb = useRef(onCaptureChange);
  useEffect(() => { captureCb.current = onCaptureChange; }, [onCaptureChange]);
  const wasCapturing = useRef(false);
  useEffect(() => {
    if (wasCapturing.current === capturing) return;
    wasCapturing.current = capturing;
    captureCb.current?.(capturing);
  }, [capturing]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (cancelOnEscape && e.code === 'Escape' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      setCapturing(false);
      return;
    }
    if (MOD_CODES.has(e.code)) return; // wait for a non-modifier key
    const token = codeToToken(e.code);
    if (!token) return;
    const parts: string[] = [];
    if (e.ctrlKey) parts.push('ctrl');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    if (e.metaKey) parts.push('meta');
    parts.push(token);
    onChange(parts.join('+'));
    setCapturing(false);
  };

  const presetOptions = useMemo<SelectOption[]>(() => {
    const opts: SelectOption[] = [];
    HOTKEY_PRESET_CATEGORIES.forEach((category, categoryIndex) => {
      if (categoryIndex > 0) opts.push({ value: `sep-${category.key}`, label: '', divider: true });
      opts.push({ value: `header-${category.key}`, label: t(category.labelKey), disabled: true });
      category.presets.forEach((preset, presetIndex) => {
        opts.push({ value: hotkeyPresetId(category.key, presetIndex), label: t(preset.labelKey) });
      });
    });
    return opts;
  }, [t]);

  const applyPreset = (id: string) => {
    const preset = findHotkeyPreset(id);
    if (preset) onChange(preset.keys);
  };

  return (
    <div className={styles.root}>
      {!hidePresets && (
      <Select
        className={styles.presetSelect}
        value=""
        onChange={applyPreset}
        options={presetOptions}
        placeholder={t('panel.settings.deck.hotkeyPreset.placeholder')}
        ariaLabel={t('panel.settings.deck.hotkeyPreset.placeholder')}
        disabled={disabled}
      />
      )}
      <button
        type="button"
        className={styles.field}
        disabled={disabled}
        onClick={() => setCapturing(true)}
        onBlur={() => setCapturing(false)}
        onKeyDown={capturing ? onKeyDown : undefined}
      >
        {capturing ? (
          <>
            {t('panel.settings.deck.hotkeyCapture')}
            {cancelOnEscape && <span className={styles.hint}>{t('hotkeys.cancelHint')}</span>}
          </>
        ) : (display || value || t('panel.settings.deck.hotkeySet'))}
      </button>
    </div>
  );
}
