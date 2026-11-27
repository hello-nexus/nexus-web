import type { CSSProperties } from 'react';
import { Pencil } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { HoverTooltip } from '../../../components/common/HoverTooltip/HoverTooltip';
import { IconLabelButton } from '../../../components/common/IconLabelButton/IconLabelButton';
import { Toggle } from '../../../components/common/Toggle/Toggle';
import styles from './CalendarSourceRow.module.scss';

interface Props {
  name: string;
  color: string;
  description: string;
  // Show or hide this calendar where the row lives.
  checked: boolean;
  onChange: (on: boolean) => void;
  // Present where calendars can be edited and removed (desktop only).
  onEdit?: () => void;
  isError?: boolean;
}

/** One calendar in the widget settings and the page rail: color dot, name and sync line, toggle, optional remove. */
export function CalendarSourceRow({ name, color, description, checked, onChange, onEdit, isError }: Props) {
  const { t } = useTranslation();
  return (
    <div className={styles.row} style={{ '--cal-color': color } as CSSProperties}>
      <span className={styles.dot} />
      <div className={styles.text}>
        <HoverTooltip body={name}><span className={styles.name}>{name}</span></HoverTooltip>
        <HoverTooltip body={description}><span className={`${styles.sub} ${isError ? styles.error : ''}`}>{description}</span></HoverTooltip>
      </div>
      <div className={styles.controls}>
        <Toggle checked={checked} onChange={onChange} ariaLabel={name} />
        {onEdit && (
          <IconLabelButton
            variant="bare"
            icon={<Pencil size={15} aria-hidden />}
            ariaLabel={t('panel.widget.calendar.edit.button', { name })}
            title={t('panel.widget.calendar.edit.title')}
            onPress={onEdit}
          />
        )}
      </div>
    </div>
  );
}
