import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '../Button/Button';
import styles from './Toast.module.scss';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastInput {
  title: string;
  body?: string;
  action?: ToastAction;
  durationMs?: number;
}

interface ToastItem extends ToastInput {
  id: number;
}

const DEFAULT_DURATION_MS = 6000;

interface ToastContextValue {
  push: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast requires a ToastProvider ancestor');
  return ctx;
}

const NOOP_TOAST: ToastContextValue = { push: () => {} };

// Provider-optional variant: without a ToastProvider ancestor the push is a
// no-op instead of a render crash (see context-provider-coverage rule).
export function useToastSafe(): ToastContextValue {
  return useContext(ToastContext) ?? NOOP_TOAST;
}

// Transient notifications stacked bottom-right. Auto-dismiss after
// DEFAULT_DURATION_MS; click or Enter/Space on the toast dismisses it; the
// optional action button runs its handler and dismisses.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts(curr => curr.filter(toast => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    setToasts(curr => [...curr, { ...toast, id }]);
    timers.current.set(id, setTimeout(() => dismiss(id), toast.durationMs ?? DEFAULT_DURATION_MS));
  }, [dismiss]);

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ push }), [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div className={styles.container}>
          {toasts.map(toast => (
            <div
              key={toast.id}
              className={styles.toast}
              role="status"
              tabIndex={0}
              onClick={() => dismiss(toast.id)}
              onKeyDown={(e) => {
                // Ignore keys bubbling from the action button: dismissing
                // here unmounts the button before its synthesized click runs.
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  dismiss(toast.id);
                }
              }}
            >
              <div className={styles.title}>{toast.title}</div>
              {toast.body && <div className={styles.body}>{toast.body}</div>}
              {toast.action && (
                <Button
                  size="sm"
                  tone="accent"
                  className={styles.action}
                  onClick={(e) => {
                    e.stopPropagation();
                    toast.action?.onClick();
                    dismiss(toast.id);
                  }}
                >
                  {toast.action.label}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </ToastContext.Provider>
  );
}
