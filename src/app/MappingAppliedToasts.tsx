import { useCallback } from 'react';
import { useToast } from '../components/common/Toast/Toast';
import { useTopicCallback } from '../hooks/useMultiplexSocket';
import { useTranslation } from '../lib/i18n';
import { MAPPING_APPLIED_TOPIC, revertDeviceMapping, type MappingAppliedFrame } from '../api/lighting';

// Longer than the toast default: this is the only announcement of an
// automatic layout change, and it carries the Undo affordance.
const AUTO_APPLY_TOAST_MS = 15000;

// Desktop-dashboard listener for silent community-mapping auto-applies on
// newly seen devices. Mounted at the layout root (next to TransferToasts) so
// the toast surfaces regardless of the open view. Undo reverts to the factory
// default and suppresses future auto-apply for that device service-side.
export function MappingAppliedToasts() {
  const { t } = useTranslation();
  const { push } = useToast();

  const handleFrame = useCallback((raw: unknown) => {
    const frame = raw as MappingAppliedFrame | null;
    if (!frame || !frame.deviceId || !frame.mappingName) return;
    // Tolerate partial frames so a missing field never renders as the
    // literal "undefined": fall back to the device id for the name and drop
    // the adopter-count clause entirely when the count is absent.
    const device = typeof frame.deviceName === 'string' && frame.deviceName !== ''
      ? frame.deviceName
      : frame.deviceId;
    const adopterCount = typeof frame.adopterCount === 'number' && Number.isFinite(frame.adopterCount)
      ? frame.adopterCount
      : null;
    push({
      title: t('lighting.mappings.autoAppliedTitle'),
      body: adopterCount === null
        ? t('lighting.mappings.autoAppliedBodyNoCount', { name: frame.mappingName, device })
        : t('lighting.mappings.autoAppliedBody', { name: frame.mappingName, device, count: adopterCount }),
      durationMs: AUTO_APPLY_TOAST_MS,
      action: {
        label: t('lighting.mappings.undo'),
        onClick: () => {
          void revertDeviceMapping(frame.deviceId, 'undo').then(resp => {
            if (resp && !resp.error) {
              push({
                title: t('lighting.mappings.undoneTitle'),
                body: t('lighting.mappings.undoneBody', { device }),
              });
            } else {
              push({ title: t('lighting.mappings.undoFailedTitle') });
            }
          });
        },
      },
    });
  }, [push, t]);

  useTopicCallback(MAPPING_APPLIED_TOPIC, true, handleFrame);

  return null;
}
