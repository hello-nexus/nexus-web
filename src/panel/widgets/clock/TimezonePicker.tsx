import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { SearchInput } from '../../../components/common/SearchInput/SearchInput';
import { useTranslation } from '../../../lib/i18n';
import { formatTimeZoneOffset, humanizeTimeZone, listTimeZones } from './timezones';
import styles from './TimezonePicker.module.scss';

interface TimezonePickerProps {
  // null = Auto: follow the system local zone.
  value: string | null;
  onChange: (tz: string | null) => void;
}

/**
 * Searchable IANA time-zone picker for the clock widget settings. Every row is
 * a real platform zone, so the stored value is always valid - the clock can
 * never be handed a zone string that throws in Intl.DateTimeFormat.
 */
export function TimezonePicker({ value, onChange }: TimezonePickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  // Offsets only shift at DST boundaries, irrelevant to picking, so label the
  // full list once rather than per keystroke.
  const zones = useMemo(() => {
    const now = new Date();
    return listTimeZones().map(tz => ({
      tz,
      label: humanizeTimeZone(tz),
      offset: formatTimeZoneOffset(now, tz),
    }));
  }, []);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return zones;
    return zones.filter(z => z.label.toLowerCase().includes(q));
  }, [zones, query]);

  return (
    <div className={styles.picker}>
      <SearchInput
        value={query}
        onChange={setQuery}
        placeholder={t('panel.widget.clock.settings.timezoneSearch')}
        ariaLabel={t('panel.widget.clock.settings.timezoneSearch')}
      />
      <div className={styles.list}>
        <button
          type="button"
          className={`${styles.option} ${value === null ? styles.selected : ''}`}
          onClick={() => onChange(null)}
        >
          <span className={styles.label}>{t('panel.widget.clock.settings.timezoneAuto')}</span>
          {value === null && <Check size={15} className={styles.check} aria-hidden={true} />}
        </button>
        {matches.length === 0 ? (
          <div className={styles.empty}>{t('panel.widget.clock.settings.timezoneNoResults')}</div>
        ) : (
          matches.map(z => (
            <button
              key={z.tz}
              type="button"
              className={`${styles.option} ${z.tz === value ? styles.selected : ''}`}
              onClick={() => onChange(z.tz)}
            >
              <span className={styles.label}>{z.label}</span>
              {z.offset && <span className={styles.offset}>{z.offset}</span>}
              {z.tz === value && <Check size={15} className={styles.check} aria-hidden={true} />}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
