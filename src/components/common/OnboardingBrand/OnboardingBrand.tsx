import { useEffect, useState } from 'react';
import { NexusWordmark } from '../../icons/NexusBrand';
import { getUpdateStatus } from '../../../api/update';
import styles from './OnboardingBrand.module.scss';

/**
 * The running Nexus version, from the same source as the "check for updates"
 * modal (getUpdateStatus -> /update/status). Empty until known.
 */
export function useNexusVersion(enabled: boolean): string {
  const [version, setVersion] = useState('');
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getUpdateStatus().then(s => {
      if (s && !cancelled) setVersion(s.currentVersion);
    });
    return () => { cancelled = true; };
  }, [enabled]);
  return version;
}

/**
 * The first onboarding page's brand block: the color mark, then the
 * wordmark with the version line under it. Renders as two siblings meant to
 * sit inside the page's centered hero column.
 */
export function OnboardingBrand({ version }: { version: string }) {
  return (
    <>
      <img src="/nexus-mark-color.png" alt="" width={140} height={140} className={styles.logo} />
      <div className={styles.brandGroup}>
        <NexusWordmark height={40} />
        {version && <p className={styles.version}>{version}</p>}
      </div>
    </>
  );
}
