// `ui-button` tone mapping: `bad` is the bordered danger button, and the filled
// one when the app asks for `variant="solid"`.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('../../api/auth', () => ({ getToken: async () => 'tok', getTokenSync: () => 'tok' }));
vi.mock('../../api/service', () => ({ postService: vi.fn(async () => ({ error: false })) }));

import { Button } from '../ui/components';

afterEach(() => cleanup());

const className = (props: Record<string, unknown>) =>
  render(<Button label="Go" {...props} />).container.querySelector('button')?.className ?? '';

describe('ui-button tone', () => {
  it('maps tone bad to the bordered danger button, and to the filled one when solid', () => {
    expect(className({ tone: 'bad' })).toMatch(/tone-danger(?!-solid)/);
    cleanup();
    expect(className({ tone: 'bad', variant: 'solid' })).toMatch(/tone-danger-solid/);
    cleanup();
    expect(className({ tone: 'bad', variant: 'ghost' })).toMatch(/tone-ghost/);
  });
});
