import { ScreenPreviewCanvas } from '../../../../components/common/ScreenPreviewCanvas/ScreenPreviewCanvas';
import styles from '../LightingPage.module.scss';

/**
 * The Mirror tab's canvas when it is open while another mode runs globally: the output
 * stream shows the global mode, so this paints the live capture of the selected monitor.
 * With Mirror global the output stream already is the capture, so the caller does not
 * mount this. When the service reports no capture source it renders nothing, so the
 * output stream shows as it did before.
 */
export function MirrorBackdrop() {
  return <ScreenPreviewCanvas className={styles.mirrorBackdrop} />;
}
