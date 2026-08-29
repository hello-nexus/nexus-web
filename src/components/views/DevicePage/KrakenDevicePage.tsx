import { ViewHeader } from '../../common/ViewHeader/ViewHeader';
import { KrakenCoolerSettings } from './KrakenCoolerSettings';
import styles from './LianLiDevicePage.module.scss';

/**
 * Standalone page for the cooler when its LCD is not streaming a panel. With a
 * panel session up, the same settings ride the panel page's settings tab so the
 * display and the hardware live under one entry.
 */
export function KrakenDevicePage({ onSectionNavigate }: { onSectionNavigate?: (section: string) => void }) {
  return (
    <div className={styles.page}>
      {/* eslint-disable-next-line i18next/no-literal-string -- brand + model name */}
      <ViewHeader title="NZXT Kraken" />
      <div className={`${styles.pageBody} pageBody`}>
        <KrakenCoolerSettings onSectionNavigate={onSectionNavigate} />
      </div>
    </div>
  );
}
