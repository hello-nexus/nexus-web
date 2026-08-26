import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, Fan, Lightbulb, Stethoscope, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { NexusControlCard } from '../NexusControlCard/NexusControlCard';
import { useFeatureFlags, useUiSettingsUpdateSafe, type FeatureKey } from '../../../hooks/useUiSettings';
import styles from './FeatureDisabled.module.scss';

// Delay between the toggle's optimistic flip and the real settings write, so
// the Toggle's own transition (Toggle.module.scss, --ease) is visible before
// FeatureGate swaps to the live page.
const REENABLE_DELAY_MS = 350;

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
 * matching DevicePage's NexusControlOff layout. The toggle flips
 * optimistically on click, then writes the real flag after
 * REENABLE_DELAY_MS so the animation is visible before FeatureGate swaps
 * to the live page.
 */
export function FeatureDisabled({ feature }: FeatureDisabledProps) {
  const { t } = useTranslation();
  const update = useUiSettingsUpdateSafe();
  const [enabling, setEnabling] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  const Icon = FEATURE_ICON[feature];
  const title = t(FEATURE_TITLE_KEY[feature]);
  const handleEnable = () => {
    if (enabling) return;
    setEnabling(true);
    timerRef.current = setTimeout(() => {
      update({ [FEATURE_SETTINGS_KEY[feature]]: true });
    }, REENABLE_DELAY_MS);
  };
  return (
    <section className={styles.page}>
      <div className={styles.controlOff}>
        <h2 className={styles.controlOffTitle}>{title}</h2>
        <div className={styles.controlOffBody}>
          <p className={styles.controlOffHint}>{t(`featureDisabled.hint.${feature}`)}</p>
          <NexusControlCard
            checked={enabling}
            disabled={enabling}
            icon={<Icon size={13} aria-hidden />}
            label={title}
            onChange={handleEnable}
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
