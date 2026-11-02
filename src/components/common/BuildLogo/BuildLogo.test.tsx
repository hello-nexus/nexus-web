import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BuildLogo } from './BuildLogo';

vi.mock('../../../lib/i18n', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

const logoOf = (el: JSX.Element) => render(el).container.querySelector('[role="img"]')!;

describe('BuildLogo', () => {
  it('draws the BUILD string as text, so one artwork serves every host', () => {
    expect(logoOf(<BuildLogo />).textContent).toBe('panel.widget.build.badge');
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

  it('sizes the type only when the host asks', () => {
    const sized = logoOf(<BuildLogo fontSize={10} />) as HTMLElement;
    expect(sized.style.fontSize).toBe('10px');
    expect((logoOf(<BuildLogo />) as HTMLElement).style.fontSize).toBe('');
  });
});
