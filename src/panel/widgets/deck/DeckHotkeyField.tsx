import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../components/common/Button/Button';
import { InlineError } from '../../../components/common/InlineError/InlineError';
import { SettingsSection } from '../../../components/common/SettingsSection/SettingsSection';
import { Field } from './DeckKeyInspector';
import { HotkeyRecorder } from './HotkeyRecorder';
import { bindingName, checkCombo, findDuplicate, formatCombo, hotkeyErrorText } from './hotkeyCombo';
import { useTranslation } from '../../../lib/i18n';
import { useHotkeyDeckInfo } from './useHotkeyDeckInfo';
import {
  deleteHotkey, newHotkeyId, putHotkey, useHotkeys,
  type HotkeysResult,
} from '../../../api/hotkeys';
import styles from './DeckHotkeyField.module.scss';

interface DeckHotkeyFieldProps {
  presetId: string;
  /** The tag the key or dial event carries now, if any (the binding id). */
  tag: string | undefined;
  /** Sets or clears the tag on the key or event through the deck's normal commit, so it travels with the slot. */
  onTagChange: (tag: string | undefined) => void;
  /** 'section' is a titled box of its own; 'field' is a labelled row inside another section. */
  layout: 'section' | 'field';
}

/**
 * A global hotkey recorder for one key or dial event: records a combo that fires
 * this slot's current action from anywhere. Creates, updates or clears the
 * `deck` binding for the slot. Desktop editor only (the routes are desktop-token).
 */
export function DeckHotkeyField({ presetId, tag, onTagChange, layout }: DeckHotkeyFieldProps) {
  const { t } = useTranslation();
  const { state, apply } = useHotkeys(true);
  const { presetNames } = useHotkeyDeckInfo(true, state?.bindings ?? [], { configs: false, deckSerials: [] });
  const [error, setError] = useState('');
  // An async rollback must see the editor as it is by then, not as it was when the PUT started.
  const latest = useRef({ tag, onTagChange });
  useEffect(() => { latest.current = { tag, onTagChange }; });

  if (!state?.supported) return null;
  const binding = tag ? state.bindings.find(b => b.id === tag && b.target.kind === 'deck' && b.target.presetId === presetId) : undefined;

  const settle = (res: HotkeysResult) => {
    if (res.ok) {
      apply(res.state);
      setError('');
    } else {
      setError(hotkeyErrorText(t, res.msg, res.code));
    }
  };

  const onRecord = async (keys: string) => {
    const check = checkCombo(keys);
    if (check !== 'ok') {
      setError(t(check === 'needsModifier' ? 'hotkeys.error.needsModifier' : 'hotkeys.error.invalidCombo'));
      return;
    }
    const dup = findDuplicate(state.bindings, keys, binding?.id);
    if (dup) {
      setError(t('hotkeys.duplicate', { combo: formatCombo(keys, state.platform, t), name: bindingName(dup, t, presetNames) }));
      return;
    }
    // A tag copied in with another preset (import, preset copy) names that preset's binding: mint a new one.
    const taken = tag ? state.bindings.find(b => b.id === tag) : undefined;
    const foreign = !!taken && !binding;
    const id = binding?.id ?? (tag && !foreign ? tag : newHotkeyId());
    const previous = tag;
    // The tag goes onto the slot first, so the preset save that carries it is not behind the binding.
    if (id !== tag) onTagChange(id);
    const res = await putHotkey({
      id,
      combo: keys,
      enabled: true,
      label: binding?.label,
      target: { kind: 'deck', presetId, tag: id },
    });
    // Undo only the tag, and only if it is still the one set here, so edits made meanwhile survive.
    if (!res.ok && id !== previous && latest.current.tag === id) latest.current.onTagChange(previous);
    settle(res);
  };

  const onClear = async () => {
    if (binding) settle(await deleteHotkey(binding.id));
    onTagChange(undefined);
  };

  const warn = binding && (binding.status === 'conflict' || binding.status === 'orphaned')
    ? t(`hotkeys.status.${binding.status}`)
    : '';

  const body = (
    <div className={styles.field}>
      <div className={styles.row}>
        <div className={styles.recorder}>
          <HotkeyRecorder
            value={binding?.combo ?? ''}
            display={binding?.combo ? formatCombo(binding.combo, state.platform, t) : undefined}
            onChange={keys => void onRecord(keys)}
          />
        </div>
        {tag && (
          <Button
            type="button"
            size="sm"
            tone="ghost"
            icon={<X size={14} aria-hidden />}
            aria-label={t('hotkeys.clear')}
            onClick={() => void onClear()}
          />
        )}
      </div>
      {(error || warn) && <InlineError>{error || warn}</InlineError>}
    </div>
  );

  // The title lives here, not in the caller, so nothing shows while there is nothing to offer.
  return layout === 'section' ? (
    <SettingsSection title={t('hotkeys.field.title')} description={t('hotkeys.field.description')}>{body}</SettingsSection>
  ) : (
    <Field label={t('hotkeys.field.title')}>{body}</Field>
  );
}
