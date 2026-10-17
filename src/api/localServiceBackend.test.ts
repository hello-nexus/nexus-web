import { describe, expect, it, vi } from 'vitest';

const cloudLogin = vi.fn();
vi.mock('./cloud', () => ({
  cloudLogin: (...args: unknown[]) => cloudLogin(...args),
}));

import { localServiceBackend } from './localServiceBackend';

describe('localServiceBackend.login', () => {
  it('passes the service email_unverified body, including the email, through', async () => {
    const body = { error: true, msg: 'email_unverified', email: 'alpha@example.com' };
    cloudLogin.mockResolvedValueOnce({ status: 403, body });

    const result = await localServiceBackend.login('alpha', 'pw');

    expect(result).toEqual({ status: 403, body });
  });
});
