import { useState, type KeyboardEvent } from 'react';
import { useTranslation } from '../../../lib/i18n';

interface HotkeyInputProps {
  value: string;
  onChange: (keys: string) => void;
}

const MOD_CODES = new Set([
  'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight',
  'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight',
]);

const NAMED: Record<string, string> = {
  Space: 'space', Enter: 'enter', NumpadEnter: 'enter', Tab: 'tab', Escape: 'escape',
  Backspace: 'backspace', Delete: 'delete', Insert: 'insert', Home: 'home', End: 'end',
  PageUp: 'pageup', PageDown: 'pagedown',
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
};

function codeToToken(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3).toLowerCase();
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code.toLowerCase();
  return NAMED[code] ?? '';
}

/** Captures a key chord and emits a "ctrl+shift+m"-style string the executor parses. */
export function HotkeyInput({ value, onChange }: HotkeyInputProps) {
  const { t } = useTranslation();
  const [capturing, setCapturing] = useState(false);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    e.preventDefault();
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

  return (
    <button
      type="button"
      onClick={() => setCapturing(true)}
      onBlur={() => setCapturing(false)}
      onKeyDown={capturing ? onKeyDown : undefined}
    >
      {capturing ? t('panel.settings.deck.hotkeyCapture') : (value || t('panel.settings.deck.hotkeySet'))}
    </button>
  );
}
