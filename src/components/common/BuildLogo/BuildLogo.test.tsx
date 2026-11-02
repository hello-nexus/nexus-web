import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BuildLogo } from './BuildLogo';
import { LOGO } from './logoPaths';

vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('BuildLogo', () => {
  it('draws the one artwork at the height asked, the width following its proportions', () => {
    const svg = render(<BuildLogo height={20} />).container.querySelector('svg')!;
    const [, , w, h] = LOGO.viewBox.split(' ').map(Number);
    expect(svg.getAttribute('viewBox')).toBe(LOGO.viewBox);
    expect(Number(svg.getAttribute('height'))).toBe(20);
    expect(Number(svg.getAttribute('width'))).toBeCloseTo((20 * w) / h, 6);
    expect(svg.querySelectorAll('path')).toHaveLength(LOGO.paths.length);
  });

  it('is named for assistive tech, by the host when it passes a name', () => {
    expect(render(<BuildLogo />).container.querySelector('svg')!.getAttribute('aria-label')).toBe('panel.widget.build.badge');
    expect(render(<BuildLogo label="Build" />).container.querySelector('svg')!.getAttribute('aria-label')).toBe('Build');
    expect(render(<BuildLogo />).container.querySelector('svg')!.getAttribute('role')).toBe('img');
  });

  it('defaults to the contrast tone and takes a muted one, never the accent', () => {
    expect(render(<BuildLogo />).container.querySelector('svg')!.getAttribute('class')).toMatch(/contrast/);
    expect(render(<BuildLogo tone="muted" />).container.querySelector('svg')!.getAttribute('class')).toMatch(/muted/);
    const svg = render(<BuildLogo />).container.querySelector('svg')!;
    expect(svg.getAttribute('fill')).toBe('currentColor');
    expect(svg.outerHTML).not.toMatch(/accent/);
  });
});
