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
    push({
      title: t('lighting.mappings.autoAppliedTitle'),
      body: t('lighting.mappings.autoAppliedBody', {
        name: frame.mappingName,
        device: frame.deviceName,
        count: frame.adopterCount,
      }),
      durationMs: AUTO_APPLY_TOAST_MS,
      action: {
        label: t('lighting.mappings.undo'),
        onClick: () => {
          void revertDeviceMapping(frame.deviceId, 'undo').then(resp => {
            if (resp && !resp.error) {
              push({
                title: t('lighting.mappings.undoneTitle'),
                body: t('lighting.mappings.undoneBody', { device: frame.deviceName }),
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
