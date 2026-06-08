import { SmartLightsPage } from './SmartLightsPage';
import styles from './SmartLightsTouch.module.scss';

/**
 * Touch-fullscreen smart-lights management. Reuses the desktop Page (brand
 * picker + Hue scan/pair + paired list) inside a scrollable fullscreen frame.
 * onSectionNavigate is desktop-only, so the "color lives on the Lighting page"
 * hint falls back to plain text here.
 */
export function SmartLightsTouch() {
  return (
    <div className={styles.touch} data-panel-scrollable="true">
      <SmartLightsPage />
    </div>
  );
}

export default SmartLightsTouch;
