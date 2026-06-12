import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  label?: string;
  /**
   * Opaque value that, when it changes between renders, clears any caught
   * error so the boundary re-renders its children fresh. Use this instead
   * of `<ErrorBoundary key={...}>` for route-driven resets: a `key` change
   * forces a hard remount of the whole subtree, which unmounts any Suspense
   * boundary inside and defeats `startTransition`'s "keep prior UI visible
   * during chunk load" behavior. `resetKey` updates props in place, so the
   * boundary instance is stable across navigations.
   */
  resetKey?: string | number | null;
}
interface State { error: Error | null; lastResetKey: string | number | null | undefined }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, lastResetKey: undefined };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  static getDerivedStateFromProps(nextProps: Props, prevState: State): Partial<State> | null {
    if (prevState.lastResetKey === undefined) {
      return { lastResetKey: nextProps.resetKey ?? null };
    }
    if (nextProps.resetKey !== prevState.lastResetKey) {
      return { error: null, lastResetKey: nextProps.resetKey ?? null };
    }
    return null;
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('[ErrorBoundary] caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', color: 'var(--bad)', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          {/* eslint-disable-next-line i18next/no-literal-string -- class component cannot use the t() hook; diagnostic crash fallback */}
          <h3 style={{ color: 'var(--bad)' }}>{this.props.label ? `${this.props.label} crashed` : 'Render error'}</h3>
          <div>{this.state.error.message}</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '1rem' }}>{this.state.error.stack}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
