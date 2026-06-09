import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SdkErrorBoundary } from '../SdkErrorBoundary';

function Boom(): never {
  throw new Error('app blew up');
}

describe('SdkErrorBoundary', () => {
  // React logs caught errors to console.error; silence it for clean test output.
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('contains a render throw to a fallback instead of propagating', () => {
    render(
      <SdkErrorBoundary widgetId="com.test.app" resetKey="r1">
        <Boom />
      </SdkErrorBoundary>,
    );
    expect(screen.getByText(/hit an error/i)).toBeTruthy();
  });

  it('logs the error with the app id', () => {
    const spy = vi.spyOn(console, 'error');
    render(
      <SdkErrorBoundary widgetId="com.test.app" resetKey="r1">
        <Boom />
      </SdkErrorBoundary>,
    );
    expect(spy.mock.calls.some((c) => String(c[0]).includes('[sdk:com.test.app]'))).toBe(true);
  });

  it('recovers when resetKey changes (a fresh render attempt)', () => {
    const { rerender } = render(
      <SdkErrorBoundary widgetId="com.test.app" resetKey="r1">
        <Boom />
      </SdkErrorBoundary>,
    );
    expect(screen.getByText(/hit an error/i)).toBeTruthy();

    // New receiver identity -> the boundary clears and renders the good child.
    rerender(
      <SdkErrorBoundary widgetId="com.test.app" resetKey="r2">
        <div>recovered</div>
      </SdkErrorBoundary>,
    );
    expect(screen.getByText('recovered')).toBeTruthy();
    expect(screen.queryByText(/hit an error/i)).toBeNull();
  });

  it('stays in the fallback while resetKey is unchanged (no flicker loop)', () => {
    const { rerender } = render(
      <SdkErrorBoundary widgetId="com.test.app" resetKey="r1">
        <Boom />
      </SdkErrorBoundary>,
    );
    rerender(
      <SdkErrorBoundary widgetId="com.test.app" resetKey="r1">
        <div>should-not-show</div>
      </SdkErrorBoundary>,
    );
    expect(screen.getByText(/hit an error/i)).toBeTruthy();
    expect(screen.queryByText('should-not-show')).toBeNull();
  });
});
