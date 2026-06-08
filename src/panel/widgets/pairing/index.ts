import { QrCode } from 'lucide-react';
import type { AppManifest } from '../types';
import { PairingWidget } from './PairingWidget';

export const pairingApp: AppManifest = {
  meta: {
    type: 'pairing',
    i18nKey: 'panel.widget.pairing',
    icon: QrCode,
    sizes: ['2x2'],
    defaultSize: '2x2',
    supportsImmersive: { portrait: false, landscape: false },
    hasConfig: false,
    // Pure display — no interaction — so it's available on display-only
    // surfaces too, not just pointer/touch ones.
    touch: false,
    // The QR pairs a remote panel TO this host; on a remote panel it's
    // meaningless (the panel is already the remote), so hide it there.
    localOnly: true,
  },
  Widget: PairingWidget,
};
