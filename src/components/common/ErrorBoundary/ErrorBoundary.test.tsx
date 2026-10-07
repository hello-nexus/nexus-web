import { describe, expect, it, vi } from 'vitest';

const reportMock = vi.fn();
vi.mock('../../../telemetry/errorReporting', () => ({
  reportError: (...a: unknown[]) => reportMock(...a),
}));

import { ErrorBoundary } from './ErrorBoundary';

describe('ErrorBoundary', () => {
  it('reports a caught render error with the leading component frames', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const boundary = new ErrorBoundary({ children: null });
    const err = new Error('render boom');
    boundary.componentDidCatch(err, { componentStack: '\n    at A\n    at B\n    at C\n    at D' });
    expect(reportMock).toHaveBeenCalledWith(err, 'render', expect.stringContaining('at A'));
    expect(reportMock.mock.calls[0][2]).not.toContain('at D');
    spy.mockRestore();
  });
});
