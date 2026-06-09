import { ViewHeader } from '../../../components/common/ViewHeader/ViewHeader';
import { useTranslation } from '../../../lib/i18n';
import { ClockWorldView } from './ClockWorldView';
import styles from './ClockPage.module.scss';

/**
 * Desktop app view for the Clock widget: the day/night world map + scrollable
 * city list (see ClockWorldView). The body is shared verbatim with the SDK
 * clock's `ui-worldclock` composite. No customisation surface here; per-widget
 * config lives in the widget edit sheet.
 */
export function ClockPage() {
  const { t } = useTranslation();
  return (
    <div className={styles.app}>
      <ViewHeader title={t('nav.clock')} />
      <ClockWorldView />
    </div>
  );
}

export default ClockPage;
