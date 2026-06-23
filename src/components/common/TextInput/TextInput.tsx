import { useEffect, useRef, type CSSProperties } from 'react';
import styles from './TextInput.module.scss';

export interface TextInputProps {
  value?: string;
  placeholder?: string;
  type?: 'text' | 'number' | 'search' | 'password';
  disabled?: boolean;
  maxLength?: number;
  size?: 'sm' | 'md';
  mono?: boolean;
  align?: 'left' | 'center' | 'right';
  color?: string;
  onInput?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onBlur?: (value: string) => void;
}

export function TextInput({
  value = '',
  placeholder,
  type = 'text',
  disabled = false,
  maxLength,
  size = 'md',
  mono = false,
  align,
  color,
  onInput,
  onSubmit,
  onBlur,
}: TextInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  const lastSet = useRef<string | null>(null);
  // Only push value changes to DOM when the prop changes, not on re-renders,
  // so in-flight cursor position is not disrupted.
  useEffect(() => {
    if (lastSet.current !== value && ref.current) ref.current.value = value;
    lastSet.current = value;
  }, [value]);

  const sizeClass = size === 'sm' ? styles.sm : styles.md;
  const classNames = [styles.input, sizeClass, mono ? styles.mono : ''].filter(Boolean).join(' ');

  return (
    <input
      ref={ref}
      type={type}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={maxLength}
      defaultValue={value}
      className={classNames}
      style={{
        textAlign: align,
        '--text-input-color': color,
      } as CSSProperties}
      onInput={(e) => onInput?.(e.currentTarget.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') onSubmit?.((e.currentTarget as HTMLInputElement).value); }}
      onBlur={(e) => onBlur?.(e.currentTarget.value)}
    />
  );
}
