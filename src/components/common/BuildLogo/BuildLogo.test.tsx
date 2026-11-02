import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BuildLogo, logoCutFor, SMALL_CAP_HEIGHT_PX } from './BuildLogo';
import { LOGO_FULL, LOGO_SMALL } from './logoPaths';

vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

describe('BuildLogo', () => {
  it('draws the small cut under the cap-height threshold and the full one at and above it', () => {
    const threshold = SMALL_CAP_HEIGHT_PX * 1.6;
    expect(logoCutFor(threshold - 0.5)).toBe('small');
    expect(logoCutFor(threshold + 0.5)).toBe('full');
  });

  it('renders the matching path data and viewBox for each cut', () => {
    const small = render(<BuildLogo height={18} />).container.querySelector('svg')!;
    expect(small.getAttribute('viewBox')).toBe(LOGO_SMALL.viewBox);
    expect(small.querySelectorAll('path')).toHaveLength(LOGO_SMALL.paths.length);
    const full = render(<BuildLogo height={40} />).container.querySelector('svg')!;
    expect(full.getAttribute('viewBox')).toBe(LOGO_FULL.viewBox);
  });

  it('keeps the logo proportions and the name for assistive tech', () => {
    const svg = render(<BuildLogo height={40} />).container.querySelector('svg')!;
    const [, , w, h] = LOGO_FULL.viewBox.split(' ').map(Number);
    expect(Number(svg.getAttribute('width'))).toBeCloseTo((40 * w) / h, 6);
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('panel.widget.build.badge');
  });

  it('takes its accessible name from the host when it passes one', () => {
    const svg = render(<BuildLogo label="Build" />).container.querySelector('svg')!;
    expect(svg.getAttribute('aria-label')).toBe('Build');
  });

  it('defaults to the pure white or black contrast tone', () => {
    const svg = render(<BuildLogo />).container.querySelector('svg')!;
    expect(svg.getAttribute('class')).toMatch(/contrast/);
  });

  it('uses currentColor ink from a neutral token, never the accent', () => {
    const svg = render(<BuildLogo />).container.querySelector('svg')!;
    expect(svg.getAttribute('fill')).toBe('currentColor');
    expect(svg.outerHTML).not.toMatch(/accent/);
  });
});
