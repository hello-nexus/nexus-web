import { QrCode } from 'lucide-react';
import styles from './PairingOffState.module.scss';

// The paused/off state shared by the pairing widget (remote control off) and the
// Pair-remote modal's flow card (killswitch off): a centered QR glyph + a short
// label. Fills its parent so it sits centered in either surface.
export function PairingOffState({ label }: { label: string }) {
  return (
    <div className={styles.off}>
      {/* eslint-disable-next-line i18next/no-literal-string -- decorative-icon aria flag */}
      <QrCode size={40} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export default PairingOffState;
