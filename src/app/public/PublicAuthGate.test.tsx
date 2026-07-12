import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const resolvePostAuthPathMock = vi.fn(() => '/u/alpha');
vi.mock('./postAuthRedirect', () => ({
  resolvePostAuthPath: () => resolvePostAuthPathMock(),
}));

import { PublicAuthGate } from './PublicAuthGate';

const realLocation = window.location;
function stubReplace(): () => string | undefined {
  let captured: string | undefined;
  Object.defineProperty(window, 'location', {
    value: { ...realLocation, replace: (v: string) => { captured = v; } },
    configurable: true,
  });
  return () => captured;
}

beforeEach(() => {
  resolvePostAuthPathMock.mockClear();
});

afterEach(() => {
  Object.defineProperty(window, 'location', { value: realLocation, configurable: true });
});

describe('PublicAuthGate', () => {
  it('renders the signed-out children once account resolves to null', () => {
    render(<PublicAuthGate account={null}><div>form</div></PublicAuthGate>);

    expect(screen.getByText('form')).toBeInTheDocument();
    expect(resolvePostAuthPathMock).not.toHaveBeenCalled();
  });

  it('shows a spinner and never redirects while the account is still loading (undefined)', () => {
    const getReplaced = stubReplace();
    render(<PublicAuthGate account={undefined}><div>form</div></PublicAuthGate>);

    expect(screen.queryByText('form')).not.toBeInTheDocument();
    expect(getReplaced()).toBeUndefined();
  });

  it('redirects to the resolved post-auth path when already signed in', () => {
    const getReplaced = stubReplace();
    render(<PublicAuthGate account={{ accountId: 'a1', email: 'a@b.com', username: 'alpha', avatar: null, isPrivate: false, emailVerified: true }}><div>form</div></PublicAuthGate>);

    expect(getReplaced()).toBe('/u/alpha');
  });
});
