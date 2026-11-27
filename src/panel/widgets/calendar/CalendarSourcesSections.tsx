import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { CALENDAR_REFRESH_OPTIONS, DEFAULT_REFRESH_MINUTES, type CalendarRefreshMinutes, type CalendarSourceDto } from '../../../api/calendar';
import { useCalendarMutations, useCalendarSettings, useCalendarSources } from '../../../hooks/useCalendar';
import { Button } from '../../../components/common/Button/Button';
import { SettingRow } from '../../../components/common/SettingRow/SettingRow';
import { SettingsSection, SettingsSelect } from '../common/SettingsRow/SettingsRow';
import { syncedText } from './calendarEvents';
import { CalendarSourceEditor } from './CalendarSourceEditor';
import { CalendarSourceRow } from './CalendarSourceRow';
import { CalendarSourceModal } from './page/CalendarSourceModal';
import styles from './CalendarSourcesSections.module.scss';

const REFRESH_LABEL_KEYS: Record<CalendarRefreshMinutes, string> = {
  5: 'panel.widget.calendar.refresh.min5',
  15: 'panel.widget.calendar.refresh.min15',
  30: 'panel.widget.calendar.refresh.min30',
  60: 'panel.widget.calendar.refresh.hour1',
};

// Known service sync codes (a stored address the service refuses reads as invalidUrl); anything else is a generic failure.
const SOURCE_ERROR_KEYS: Readonly<Record<string, string>> = {
  unreachable: 'panel.widget.calendar.add.error.unreachable',
  unauthorized: 'panel.widget.calendar.add.error.unauthorized',
  notFound: 'panel.widget.calendar.add.error.notFound',
  notIcs: 'panel.widget.calendar.add.error.notIcs',
  tooLarge: 'panel.widget.calendar.add.error.tooLarge',
  invalidUrl: 'panel.widget.calendar.source.error.invalidUrl',
};

const KIND_LABEL_KEYS: Record<CalendarSourceDto['kind'], string> = {
  ics: 'panel.widget.calendar.kind.ics',
  google: 'panel.widget.calendar.kind.google',
  microsoft: 'panel.widget.calendar.kind.microsoft',
};

interface Props {
  // Calendars hidden where these sections live (this widget, or this page).
  hidden: readonly string[];
  onToggle: (id: string, visible: boolean) => void;
  // Add and edit need a keyboard, so touch surfaces leave them out.
  canEdit: boolean;
}

/**
 * The Calendars section (rows, then Add calendar) followed by the Sync section
 * (refresh interval, status, Refresh now). One component for the widget
 * settings and the page rail so the two cannot drift.
 */
export function CalendarSourcesSections({ hidden, onToggle, canEdit }: Props) {
  const { t } = useTranslation();
  const { sources } = useCalendarSources();
  const { settings, setRefreshMinutes, refreshNow } = useCalendarSettings();
  const { add } = useCalendarMutations();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<CalendarSourceDto | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const now = Date.now();

  const doRefresh = async () => {
    setRefreshing(true);
    try { await refreshNow(); } catch { /* the status line reports the outcome */ } finally { setRefreshing(false); }
  };

  return (
    <>
      <SettingsSection title={t('panel.widget.calendar.settings.calendars')}>
        {sources.map(source => (
          <CalendarSourceRow
            key={source.id}
            name={source.name}
            color={source.color}
            isError={source.error !== null}
            description={source.error
              ? t(SOURCE_ERROR_KEYS[source.error] ?? 'panel.widget.calendar.source.error.generic')
              : syncedText(t, source.lastSyncedAt, now, t(KIND_LABEL_KEYS[source.kind]))}
            checked={!hidden.includes(source.id)}
            onChange={on => onToggle(source.id, on)}
            onEdit={canEdit ? () => setEditing(source) : undefined}
          />
        ))}
        {canEdit && (
          <div className={styles.addRow} data-settings-aside="true">
            <Button size="sm" tone="neutral" icon={<Plus size={16} aria-hidden />} onClick={() => setAdding(true)}>
              {t('panel.widget.calendar.add.button')}
            </Button>
          </div>
        )}
      </SettingsSection>

      <SettingsSection title={t('panel.widget.calendar.settings.sync')}>
        <SettingsSelect
          label={t('panel.widget.calendar.settings.refreshEvery')}
          value={String(settings?.refreshMinutes ?? DEFAULT_REFRESH_MINUTES)}
          options={CALENDAR_REFRESH_OPTIONS.map(m => ({ value: String(m), label: t(REFRESH_LABEL_KEYS[m]) }))}
          onChange={value => { void setRefreshMinutes(Number(value) as CalendarRefreshMinutes).catch(() => undefined); }}
        />
        <SettingRow
          label={syncedText(t, settings?.lastSyncedAt ?? null, now)}
          description={t('panel.widget.calendar.settings.refreshHint')}
        >
          <Button size="sm" tone="neutral" onClick={() => { void doRefresh(); }} loading={refreshing || settings?.syncing === true}>
            {t('panel.widget.calendar.settings.refreshNow')}
          </Button>
        </SettingRow>
      </SettingsSection>

      {canEdit && (
        <>
          <CalendarSourceModal open={adding} usedColors={sources.map(s => s.color)} onAdd={add} onClose={() => setAdding(false)} />
          <CalendarSourceEditor source={editing} usedColors={sources.map(s => s.color)} onClose={() => setEditing(null)} />
        </>
      )}
    </>
  );
}
