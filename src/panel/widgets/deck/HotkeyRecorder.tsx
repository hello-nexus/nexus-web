import { useCallback, useEffect, useRef } from 'react';
import { setHotkeysSuspended } from '../../../api/hotkeys';
import { HotkeyInput } from './HotkeyInput';

// The service resumes on its own after a while; repeating the suspend restarts that clock.
const SUSPEND_REFRESH_MS = 20_000;

interface HotkeyRecorderProps {
  value: string;
  display?: string;
  onChange: (keys: string) => void;
  disabled?: boolean;
  onClear?: () => void;
  showClear?: boolean;
}

/**
 * HotkeyInput for a GLOBAL hotkey: while it records, every OS hotkey is
 * unregistered so the chord being pressed reaches the page instead of firing
 * its current owner. Always resumes when recording ends or the field unmounts.
 */
export function HotkeyRecorder({ value, display, onChange, disabled, onClear, showClear }: HotkeyRecorderProps) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const suspended = useRef(false);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (suspended.current) {
      suspended.current = false;
      void setHotkeysSuspended(false);
    }
  }, []);

  const onCaptureChange = useCallback((capturing: boolean) => {
    if (!capturing) {
      stop();
      return;
    }
    suspended.current = true;
    void setHotkeysSuspended(true);
    timer.current = setInterval(() => { void setHotkeysSuspended(true); }, SUSPEND_REFRESH_MS);
  }, [stop]);

  useEffect(() => stop, [stop]);

  return (
    <HotkeyInput
      value={value}
      display={display}
      onChange={onChange}
      disabled={disabled}
      hidePresets
      cancelOnEscape
      onClear={onClear}
      showClear={showClear}
      onCaptureChange={onCaptureChange}
    />
  );
}
