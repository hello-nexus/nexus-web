import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  widgetId: string;
  /** Identity that, when it changes, clears a caught error (e.g. the receiver:
   *  a re-mount / edit-reload is a fresh render attempt that should recover). */
  resetKey: unknown;
  children: ReactNode;
}

interface State {
  error: Error | null;
  key: unknown;
}

/**
 * Per-widget render error boundary. A sandboxed app's render error is contained
 * to its own cell — it renders a small fallback and is logged with the app id,
 * instead of propagating up to blank the dashboard (React unmounts the whole
 * subtree on an uncaught render throw) or only reaching the console.
 *
 * Resets via `resetKey` (not `children`, which is a fresh element every render):
 * when the host hands the cell a new receiver, the boundary clears so a fixed
 * app recovers without a manual reload.
 */
export class SdkErrorBoundary extends Component<Props, State> {
  state: State = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.key) return { error: null, key: props.resetKey };
    return null;
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[sdk:${this.props.widgetId}] render error`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            minWidth: 0,
            minHeight: 0,
            padding: 12,
            boxSizing: 'border-box',
            color: 'var(--text-dim, #888)',
            fontSize: 12,
            textAlign: 'center',
          }}
        >
          This app hit an error.
        </div>
      );
    }
    return this.props.children;
  }
}
