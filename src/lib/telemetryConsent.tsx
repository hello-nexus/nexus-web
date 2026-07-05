import type { ReactNode } from 'react';

const PRIVACY_POLICY_URL = 'https://hellonexus.com/privacy';

type TFunction = (key: string, params?: Record<string, string | number>) => string;

/**
 * The telemetry consent row description, shared by the welcome screen and
 * Settings so both read identically. Splits the translated sentence on the
 * literal {privacy} token and injects the link there, so each locale's word
 * order is preserved instead of always appending the link at the end.
 */
export function buildTelemetryConsentDescription(t: TFunction): ReactNode {
  const [before, after] = t('settings.telemetry.description').split('{privacy}');
  return (
    <>
      {before}
      <a href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
        {t('settings.telemetry.privacyLink')}
      </a>
      {after}
    </>
  );
}
