import { useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { DeviceModal } from '../../common/DeviceModal/DeviceModal';
import { EmptyState } from '../../common/EmptyState/EmptyState';
import { Spinner } from '../../common/Spinner/Spinner';
import { Badge } from '../../common/Badge/Badge';
import { DECK_PRESET_CAP } from '../../../panel/widgets/deck/DeckPresetToolbar';
import { createDeckPreset, getDeckTemplates, type DeckTemplate } from '../../../api/deck';
import styles from './StarterPresetsModal.module.scss';

interface StarterPresetsModalProps {
  open: boolean;
  onClose: () => void;
  /** Host-wide preset count, for cap gating. */
  presetCount: number;
  /** Templates a preset was already made from; tagged Added but still addable. */
  addedTemplateIds: string[];
  /** Called with the new preset's id so the caller activates it on this instance. */
  onImported: (presetId: string) => void;
}

/** The bundled starter presets: one press creates the preset and closes. */
export function StarterPresetsModal({ open, onClose, presetCount, addedTemplateIds, onImported }: StarterPresetsModalProps) {
  const { t } = useTranslation();
  // null while loading, so the list appears whole instead of filling in.
  const [templates, setTemplates] = useState<DeckTemplate[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTemplates(null);
    setError(null);
    void getDeckTemplates().then(list => { if (!cancelled) setTemplates(list); });
    return () => { cancelled = true; };
  }, [open]);

  const atCap = presetCount >= DECK_PRESET_CAP;

  // The service de-dupes the name and binds the installed app unless another
  // preset already holds it, so a starter can be added more than once.
  const add = async (tpl: DeckTemplate) => {
    if (adding || atCap) return;
    setAdding(true);
    setError(null);
    const created = await createDeckPreset({ name: tpl.name, cols: tpl.cols, rows: tpl.rows, templateId: tpl.id });
    setAdding(false);
    if (!created) {
      setError(t('panel.settings.deck.presets.createFailed'));
      return;
    }
    onImported(created.id);
    onClose();
  };

  return (
    <DeviceModal open={open} onClose={onClose} title={t('devices.streamdeck.import.startersTitle')} medium>
      <div className={styles.body}>
        {templates === null ? (
          <div className={styles.loadingRow}>
            <Spinner size={24} />
          </div>
        ) : templates.length === 0 ? (
          <EmptyState icon={<Inbox size={32} />} title={t('devices.streamdeck.import.startersEmpty')} />
        ) : (
          <div className={styles.list}>
            {templates.map(tpl => (
              <button
                key={tpl.id}
                type="button"
                className={styles.row}
                disabled={adding || atCap}
                onClick={() => void add(tpl)}
              >
                <span className={styles.rowName}>{tpl.name}</span>
                {addedTemplateIds.includes(tpl.id) && <Badge label={t('devices.streamdeck.import.added')} />}
              </button>
            ))}
          </div>
        )}
        {atCap && <span className={styles.note}>{t('lighting.layoutPresets.capReached', { max: DECK_PRESET_CAP })}</span>}
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </DeviceModal>
  );
}
