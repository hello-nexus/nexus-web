import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Activity, Fan, Lightbulb, Stethoscope, type LucideIcon } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { NexusControlCard } from '../NexusControlCard/NexusControlCard';
import { useFeatureFlags, useUiSettingsUpdateSafe, type FeatureKey } from '../../../hooks/useUiSettings';
import styles from './FeatureDisabled.module.scss';

// Holds the disabled shell mounted after the flag flips on so the Toggle's
// own transition (Toggle.module.scss, --ease) finishes playing before
// FeatureGate swaps to the live page.
const REENABLE_HOLD_MS = 350;

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
 * card). The toggle's own optimistic `enabling` state animates it to "on"
 * immediately on click, ahead of the real write and the parent FeatureGate's
 * delayed swap to the live page - see REENABLE_HOLD_MS.
 */
export function FeatureDisabled({ feature }: FeatureDisabledProps) {
  const { t } = useTranslation();
  const update = useUiSettingsUpdateSafe();
  const [enabling, setEnabling] = useState(false);
  const Icon = FEATURE_ICON[feature];
  const title = t(FEATURE_TITLE_KEY[feature]);
  const handleEnable = () => {
    setEnabling(true);
    update({ [FEATURE_SETTINGS_KEY[feature]]: true });
  };
  return (
    <section className={styles.page}>
      <div className={styles.controlOff}>
        <h2 className={styles.controlOffTitle}>{title}</h2>
        <div className={styles.controlOffBody}>
          <p className={styles.controlOffHint}>{t(`featureDisabled.hint.${feature}`)}</p>
          <NexusControlCard
            checked={enabling}
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
 * lighting, cooling, diagnostics. Keeps rendering the shell for
 * REENABLE_HOLD_MS after the flag flips on, so the re-enable toggle's own
 * animation (played by FeatureDisabled) is visible before the swap.
 */
export function FeatureGate({ feature, children }: FeatureGateProps) {
  const flags = useFeatureFlags();
  const enabled = flags[feature];
  const [holdingShell, setHoldingShell] = useState(false);
  const prevEnabledRef = useRef(enabled);

  useEffect(() => {
    if (enabled && !prevEnabledRef.current) {
      setHoldingShell(true);
      const timer = setTimeout(() => setHoldingShell(false), REENABLE_HOLD_MS);
      prevEnabledRef.current = enabled;
      return () => clearTimeout(timer);
    }
    prevEnabledRef.current = enabled;
  }, [enabled]);

  if (!enabled || holdingShell) return <FeatureDisabled feature={feature} />;
  return <>{children}</>;
}
