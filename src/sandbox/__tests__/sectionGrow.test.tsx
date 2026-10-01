// `ui-section` grow: the section and its box take the grow classes, so boxes in
// a stretched row match heights; without it the section keeps its natural size.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';

vi.mock('../../api/auth', () => ({ getToken: async () => 'tok', getTokenSync: () => 't k' }));
vi.mock('../../api/service', () => ({ postService: vi.fn(async () => ({ error: false })) }));

import { Section } from '../ui/richComponents';
import styles from '../ui/Section.module.scss';

afterEach(() => cleanup());

const section = (grow?: boolean) => {
  const el = render(<Section title="Identity" grow={grow}><span>x</span></Section>).container.querySelector('section') as HTMLElement;
  return { section: el, box: el.lastElementChild as HTMLElement };
};

describe('ui-section grow', () => {
  it('grows the section and its box', () => {
    const { section: s, box } = section(true);
    expect(s.className).toContain(styles.grow);
    expect(box.className).toContain(styles.growBox);
  });

  it('keeps the natural size by default', () => {
    const { section: s, box } = section();
    expect(s.className).not.toContain(styles.grow);
    expect(box.className).not.toContain(styles.growBox);
  });
});
