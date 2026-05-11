import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  label?: string;
}
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error('[ErrorBoundary] caught:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', color: 'var(--bad)', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          <h3 style={{ color: 'var(--bad)' }}>{this.props.label ? `${this.props.label} crashed` : 'Render error'}</h3>
          <div>{this.state.error.message}</div>
          <div style={{ fontSize: '0.8rem', opacity: 0.7, marginTop: '1rem' }}>{this.state.error.stack}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
