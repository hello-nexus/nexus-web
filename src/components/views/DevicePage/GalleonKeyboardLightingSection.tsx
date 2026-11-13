import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import { fetchLightingDevices, setLightingDeviceSaveToDevice, type LightingDevice } from '../../../api/lighting';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import { SettingToggle } from '../../common/SettingRow/SettingRow';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { useToast } from '../../common/Toast/Toast';
import { useStreamDecks } from '../../../hooks/useStreamDecks';
import { GALLEON_SAVE_ANCHOR, keyboardCardForDeck } from './galleonKeyboardLighting';

/**
 * The Galleon page's keyboard lighting group. It lives outside the Stream Deck
 * control gate: the keyboard is lit by the lighting stack whether or not Nexus
 * holds the deck. Renders nothing until the service lists a keyboard card that
 * can save its colors.
 */
export function GalleonKeyboardLightingSection({ serial }: { serial: string | null | undefined }) {
  const { t } = useTranslation();
  const { push } = useToast();
  const { decks } = useStreamDecks(true);
  const deckKey = decks.filter(d => d.displayName.startsWith('Corsair ')).map(d => d.serial).join('|');
  const [cards, setCards] = useState<LightingDevice[]>([]);
  // An optimistic value holds until the newest write settles; only that write may roll back.
  const [pending, setPending] = useState<boolean | null>(null);
  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const load = useCallback(async () => {
    const res = await fetchLightingDevices().catch(() => null);
    if (!mountedRef.current || !res) return;
    setCards(res.allDevices ?? res.devices);
  }, []);

  useEffect(() => { void load(); }, [load]);
  useTopicCallback('lighting', true, () => { void load(); });

  const card = keyboardCardForDeck(cards, serial, deckKey ? deckKey.split('|') : []);
  if (!card?.deviceId) return null;
  const deviceId = card.deviceId;
  const checked = pending ?? card.savedToDevice === true;

  const onChange = (next: boolean) => {
    const seq = ++seqRef.current;
    setPending(next);
    setLightingDeviceSaveToDevice(deviceId, next)
      .then(res => {
        if (res && !res.error) return;
        throw new Error('save failed');
      })
      .then(() => load())
      .catch(() => {
        if (seq === seqRef.current && mountedRef.current) push({ title: t('devices.galleon.saveColors.failed') });
      })
      .finally(() => {
        if (seq === seqRef.current && mountedRef.current) setPending(null);
      });
  };

  return (
    <SettingsSection title={t('devices.galleon.keyboardLighting')}>
      <SettingToggle
        anchorId={GALLEON_SAVE_ANCHOR}
        label={t('devices.galleon.saveColors.label')}
        description={t('devices.galleon.saveColors.description')}
        checked={checked}
        onChange={onChange}
      />
    </SettingsSection>
  );
}
