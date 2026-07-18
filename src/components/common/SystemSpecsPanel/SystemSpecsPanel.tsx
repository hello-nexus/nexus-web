import { useState, type ReactNode } from 'react';
import { Card } from '../Card/Card';
import { Button } from '../Button/Button';
import styles from './SystemSpecsPanel.module.scss';

export interface SystemSpecRow {
  label: string;
  value: string;
  /** Tiles variant only. */
  icon?: ReactNode;
}

export interface SystemSpecsPanelProps {
  rows: SystemSpecRow[];
  /** 'list': copyable label:value sheet (Devices > System Specs, Diagnostics
   *  Summary). 'tiles': icon + value grid (Benchmark's pre-run summary). */
  variant?: 'list' | 'tiles';
  /** List variant: renders every value blank instead of a "-" placeholder,
   *  for a stable row count while the first fetch is in flight. */
  loading?: boolean;
  /** List variant: omit both to hide the copy-to-clipboard toolbar. */
  copyLabel?: string;
  copiedLabel?: string;
  /** Tiles variant only. Pairs the icon and label on one row, with the value
   *  on the line beneath - the process-detail usage tiles' own layout
   *  (ProcessDetailPanel). Default false keeps icon/label/value each on
   *  their own line (Benchmark's pre-run summary). */
  iconInline?: boolean;
}

/**
 * Renders a machine's system specs (CPU, motherboard, memory, GPU, OS build,
 * PC name, ...) - the single component every surface that shows this data
 * (Devices > System Specs, Benchmark's pre-run summary and per-run results,
 * Diagnostics Summary) renders through. Rows are pre-translated by the
 * caller; the component owns no i18n keys of its own.
 *
 * The tiles variant renders bare Card tiles with no owning grid, so a caller
 * can drop a single tile into its own grid alongside unrelated cards
 * (Benchmark's results page mixes one spec tile into its subsystem-score
 * grid) as well as render a whole grid of them (Benchmark's pre-run summary).
 */
export function SystemSpecsPanel({ rows, variant = 'list', loading, copyLabel, copiedLabel, iconInline = false }: SystemSpecsPanelProps) {
  const [copied, setCopied] = useState(false);

  if (variant === 'tiles') {
    return (
      <>
        {rows.map((row, i) => (
          <Card key={i} className={styles.tile}>
            <div className={styles.tileInner}>
              {iconInline ? (
                <span className={styles.tileHeader}>
                  {row.icon && <span className={styles.tileIcon}>{row.icon}</span>}
                  <span className={styles.tileLabel}>{row.label}</span>
                </span>
              ) : (
                <>
                  {row.icon && <span className={styles.tileIcon}>{row.icon}</span>}
                  <span className={styles.tileLabel}>{row.label}</span>
                </>
              )}
              <span className={styles.tileValue} title={row.value}>{row.value || '-'}</span>
            </div>
          </Card>
        ))}
      </>
    );
  }

  const onCopy = async () => {
    if (loading) return;
    const text = rows.map(row => `${row.label}: ${row.value || '-'}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Browsers without async clipboard (older WebViews on the panel side)
      // fall back to selecting nothing - no need to surface an error here,
      // the toast just won't appear.
    }
  };

  return (
    <>
      {copyLabel && (
        <div className={styles.toolbar}>
          <Button type="button" tone="accent" size="sm" onClick={onCopy} disabled={loading}>
            {copied ? copiedLabel : copyLabel}
          </Button>
        </div>
      )}
      <div className={styles.card}>
        <dl className={styles.list}>
          {rows.map((row, i) => (
            <div key={i} className={styles.row}>
              <dt className={styles.label}>{row.label || ' '}</dt>
              <dd className={`${styles.value} selectable`} data-panel-allow-text-selection="true">
                {loading ? ' ' : (row.value || '-')}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </>
  );
}
