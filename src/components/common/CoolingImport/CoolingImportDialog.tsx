import { useEffect, useId, useState, type ReactNode } from 'react';
import { Fan, PlugZap } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { pluralKey } from '../../../lib/pluralKey';
import { DeviceModal } from '../DeviceModal/DeviceModal';
import { EmptyState } from '../EmptyState/EmptyState';
import { FanControlImportSection } from '../FanControlImport/FanControlImportSection';
import { useFanControlStatus } from '../../../hooks/useFanControlStatus';
import styles from './CoolingImportDialog.module.scss';

/** Apps this dialog can bring a cooling setup over from. */
type SourceId = 'fancontrol';

interface SourceRow {
  id: SourceId;
  name: string;
  icon: ReactNode;
  /** False when the app is not on this PC: the row still lists, and says so. */
  available: boolean;
  /** One line under the name: what was found, or why nothing can be imported. */
  status: string;
  panel: ReactNode;
}

/**
 * Whether any source this dialog knows about can exist on `platform`.
 * FanControl is Windows-only, so on macOS and Linux the dialog would have
 * nothing but a permanent "not found" to show, and the entry point that opens
 * it should not be there at all.
 */
export function coolingImportHasSources(platform: string): boolean {
  return platform === 'windows';
}

export interface CoolingImportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Fires after a successful import so the cooling page refetches. */
  onImported?: () => void;
}

/**
 * The cooling page's import surface: a list of apps a setup can come from,
 * and the selected one's flow beside it. FanControl is the only source today.
 *
 * A source that is not installed still appears, greyed, with the reason. The
 * entry point is always available, so "can Nexus take my curves from X" has an
 * answer in the app instead of the button simply not being there.
 */
export function CoolingImportDialog({ open, onClose, onImported }: CoolingImportDialogProps) {
  const { t, language } = useTranslation();
  const fanControl = useFanControlStatus();
  const [selected, setSelected] = useState<SourceId>('fancontrol');
  const sourceHeaderId = useId();

  // Re-read detection on every open: the user may have just installed the app
  // this dialog is asking about.
  const { refresh } = fanControl;
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const fanControlAvailable = fanControl.payload?.importAvailable === true;
  const sources: SourceRow[] = [
    {
      id: 'fancontrol',
      name: t('coolingImport.source.fancontrol'),
      icon: <Fan size={20} />,
      available: fanControlAvailable,
      status: fanControlAvailable
        ? t(
          pluralKey('coolingImport.source.fancontrol.found', language, fanControl.payload?.configs.length ?? 0),
          { count: fanControl.payload?.configs.length ?? 0 },
        )
        : t('coolingImport.source.fancontrol.missing'),
      panel: fanControlAvailable
        ? (
          <FanControlImportSection
            open={open}
            configs={fanControl.payload?.configs ?? []}
            onImported={onImported}
            wide
          />
        )
        : (
          <EmptyState
            icon={<PlugZap size={28} />}
            title={t('coolingImport.notFound.title', { app: t('coolingImport.source.fancontrol') })}
            hint={t('coolingImport.notFound.hint')}
          />
        ),
    },
  ];

  const current = sources.find(s => s.id === selected) ?? sources[0];

  return (
    <DeviceModal open={open} onClose={onClose} title={t('coolingImport.title')} large>
      <div className={styles.body}>
        <div className={styles.sourceColumn}>
          <span className={styles.sourceHeader} id={sourceHeaderId}>{t('coolingImport.sourceLabel')}</span>
          <div className={styles.sourceList} role="radiogroup" aria-labelledby={sourceHeaderId}>
          {sources.map(source => (
            <button
              key={source.id}
              type="button"
              role="radio"
              aria-checked={source.id === current.id}
              className={`${styles.sourceRow} ${source.id === current.id ? styles.sourceRowActive : ''}`}
              onClick={() => setSelected(source.id)}
            >
              <span className={`${styles.sourceIcon} ${source.available ? '' : styles.sourceIconOff}`} aria-hidden>
                {source.icon}
              </span>
              <span className={styles.sourceText}>
                <span className={styles.sourceName}>{source.name}</span>
                <span className={styles.sourceStatus}>{source.status}</span>
              </span>
            </button>
          ))}
          </div>
        </div>
        <div className={styles.panel}>{current.panel}</div>
      </div>
    </DeviceModal>
  );
}
