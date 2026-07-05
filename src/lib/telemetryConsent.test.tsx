import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildTelemetryConsentDescription } from './telemetryConsent';

const STRINGS: Record<string, string> = {
  'settings.telemetry.description': 'Before the link. {privacy} After the link.',
  'settings.telemetry.privacyLink': 'Privacy Policy',
  'settings.telemetry.infoTooltip': 'Info body.',
};

const t = (key: string) => STRINGS[key] ?? key;

describe('buildTelemetryConsentDescription', () => {
  it('splits the description around the {privacy} token and inserts a link there', () => {
    render(<div>{buildTelemetryConsentDescription(t)}</div>);
    expect(screen.getByText(/Before the link\./)).toBeInTheDocument();
    expect(screen.getByText(/After the link\./)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Privacy Policy' });
    expect(link).toHaveAttribute('href', 'https://hellonexus.com/privacy');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('preserves locale word order either side of the token', () => {
    const { container } = render(<div>{buildTelemetryConsentDescription(t)}</div>);
    const text = container.textContent ?? '';
    expect(text.indexOf('Before the link.')).toBeLessThan(text.indexOf('Privacy Policy'));
    expect(text.indexOf('Privacy Policy')).toBeLessThan(text.indexOf('After the link.'));
  });
});
