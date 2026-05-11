import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import type { CompatibilityIssue } from '../../../types/builder';
import { useTranslation } from '../../../lib/i18n';
import styles from './CompatibilityPanel.module.scss';

interface CompatibilityPanelProps {
  issues: CompatibilityIssue[];
}

export function CompatibilityPanel({ issues }: CompatibilityPanelProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(true);

  if (issues.length === 0) return null;

  const errors = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  return (
    <div className={styles.panel}>
      <button type="button" className={styles.header} onClick={() => setExpanded(e => !e)}>
        <AlertTriangle size={16} className={styles.headerIcon} />
        <span className={styles.headerText}>
          {errors.length > 0 && (
            <span className={styles.errorCount}>{errors.length} {t('builder.compatibility.error')}</span>
          )}
          {warnings.length > 0 && (
            <span className={styles.warningCount}>{warnings.length} {t('builder.compatibility.warning')}</span>
          )}
        </span>
        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>

      {expanded && (
        <div className={styles.list}>
          {issues.map((issue, i) => (
            <div
              key={i}
              className={`${styles.issue} ${issue.severity === 'error' ? styles.issueError : styles.issueWarning}`}
            >
              <span className={styles.issueDot} />
              <span className={styles.issueMsg}>{issue.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
