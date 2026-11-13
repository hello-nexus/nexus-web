import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BuildLogo } from './BuildLogo';

vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const logoOf = (el: JSX.Element) => render(el).container.querySelector('[role="img"]')!;

describe('BuildLogo', () => {
  it('draws the wordmark as vector artwork, so no panel or skin font can reach it', () => {
    const logo = logoOf(<BuildLogo />);
    expect(logo.textContent).toBe('');
    expect(logo.querySelector('text')).toBeNull();
    const svg = logo.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.querySelector('path')!.getAttribute('d')!.length).toBeGreaterThan(500);
    expect(logo.outerHTML).not.toMatch(/font-family/);
  });

  it('paints the outline and the letters in the current color, so the tone drives them', () => {
    const svg = logoOf(<BuildLogo />).querySelector('svg')!;
    expect(svg.querySelector('rect')!.getAttribute('stroke')).toBe('currentColor');
    expect(svg.querySelector('path')!.getAttribute('fill')).toBe('currentColor');
  });

  it('is named for assistive tech, by the host when it passes a name', () => {
    expect(logoOf(<BuildLogo />).getAttribute('aria-label')).toBe('panel.widget.build.badge');
    expect(logoOf(<BuildLogo label="Build" />).getAttribute('aria-label')).toBe('Build');
  });

  it('defaults to the primary tone and takes contrast or muted, never the accent', () => {
    expect(logoOf(<BuildLogo />).getAttribute('class')).toMatch(/primary/);
    expect(logoOf(<BuildLogo tone="contrast" />).getAttribute('class')).toMatch(/contrast/);
    expect(logoOf(<BuildLogo tone="muted" />).getAttribute('class')).toMatch(/muted/);
    expect(logoOf(<BuildLogo />).outerHTML).not.toMatch(/accent/);
  });

  it('keeps one shape at every size: the geometry is in viewBox units, never a fixed length', () => {
    const shapes = [undefined, 8, 16, 40].map((size) => {
      const svg = logoOf(<BuildLogo fontSize={size} />).querySelector('svg')!;
      return [svg.getAttribute('viewBox'), svg.querySelector('rect')!.getAttribute('rx'), svg.querySelector('path')!.getAttribute('d')].join('|');
    });
    expect(new Set(shapes).size).toBe(1);
    expect(shapes[0]).not.toMatch(/px/);
  });

  it('sizes the logo only when the host asks', () => {
    const sized = logoOf(<BuildLogo fontSize={10} />) as HTMLElement;
    expect(sized.style.fontSize).toBe('10px');
    expect((logoOf(<BuildLogo />) as HTMLElement).style.fontSize).toBe('');
  });
});
