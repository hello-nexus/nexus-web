import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import styles from '../LightingPage.module.scss';

/**
 * Wraps a run of motherboard zone cards (one per ARGB header) under a single
 * collapsible header so the device list doesn't get visually overwhelmed when
 * a board has three or four headers. Header shows the parent OpenRGB device
 * name; clicking it toggles the zone list. Expanded by default.
 */
export function MotherboardGroup({
  parentName,
  children,
}: {
  parentName: string;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  return (
    <div className={styles.motherboardGroup}>
      <button
        type="button"
        className={styles.motherboardGroupHeader}
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        aria-label={t('lighting.devices.motherboardHeader')}
      >
        {expanded ? <ChevronDown /> : <ChevronRight />}
        <span className={styles.motherboardGroupName}>{parentName}</span>
      </button>
      {expanded && (
        <div className={styles.motherboardGroupChildren}>
          {children}
        </div>
      )}
    </div>
  );
}
