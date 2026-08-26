import type { ReactNode } from 'react';
import { Activity, Fan, Lightbulb, Stethoscope, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { NexusControlCard } from '../NexusControlCard/NexusControlCard';
import { useFeatureFlags, useUiSettingsUpdateSafe, type FeatureKey } from '../../../hooks/useUiSettings';
import styles from './FeatureDisabled.module.scss';

const FEATURE_ICON: Record<FeatureKey, LucideIcon> = {
  lighting: Lightbulb,
  cooling: Fan,
  monitoring: Activity,
  diagnostics: Stethoscope,
};

// Feature titles reuse each pillar's existing page-title key rather than
// minting a new one; monitoring has no `monitoring.title` key, only the nav
// label.
const FEATURE_TITLE_KEY: Record<FeatureKey, string> = {
  lighting: 'lighting.title',
  cooling: 'cooling.title',
  monitoring: 'nav.monitoring',
  diagnostics: 'diagnostics.title',
};

const FEATURE_SETTINGS_KEY: Record<FeatureKey, 'featureLightingEnabled' | 'featureCoolingEnabled' | 'featureMonitoringEnabled' | 'featureDiagnosticsEnabled'> = {
  lighting: 'featureLightingEnabled',
  cooling: 'featureCoolingEnabled',
  monitoring: 'featureMonitoringEnabled',
  diagnostics: 'featureDiagnosticsEnabled',
};

export interface FeatureDisabledProps {
  feature: FeatureKey;
}

/**
 * Full-page disabled shell for a feature pillar turned off in Settings,
 * matching DevicePage's NexusControlOff layout (title, hint, a re-enable
 * card). The toggle writes straight through useUiSettingsUpdateSafe, so the
 * gated page underneath re-renders live once the flag flips.
 */
export function FeatureDisabled({ feature }: FeatureDisabledProps) {
  const { t } = useTranslation();
  const update = useUiSettingsUpdateSafe();
  const Icon = FEATURE_ICON[feature];
  const title = t(FEATURE_TITLE_KEY[feature]);
  return (
    <section className={styles.page}>
      <div className={styles.controlOff}>
        <h2 className={styles.controlOffTitle}>{title}</h2>
        <div className={styles.controlOffBody}>
          <p className={styles.controlOffHint}>{t(`featureDisabled.hint.${feature}`)}</p>
          <NexusControlCard
            checked={false}
            icon={<Icon size={13} aria-hidden />}
            label={title}
            onChange={() => update({ [FEATURE_SETTINGS_KEY[feature]]: true })}
          />
        </div>
      </div>
    </section>
  );
}

export interface FeatureGateProps {
  feature: FeatureKey;
  children: ReactNode;
}

/**
 * Wraps a feature page's content; renders the FeatureDisabled shell instead
 * while the pillar is off, so the wrapped page (and its data hooks) never
 * mounts. Mounted around exactly the four gated Dashboard cases: monitoring,
 * lighting, cooling, diagnostics.
 */
export function FeatureGate({ feature, children }: FeatureGateProps) {
  const flags = useFeatureFlags();
  if (!flags[feature]) return <FeatureDisabled feature={feature} />;
  return <>{children}</>;
}
