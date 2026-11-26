import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from '../../../../lib/i18n';
import { Overlay } from '../../../../components/common/Overlay/Overlay';
import { Button } from '../../../../components/common/Button/Button';
import { TextInput } from '../../../../components/common/TextInput/TextInput';
import { ColorPickerWithPresets } from '../../../../components/common/ColorPickerWithPresets/ColorPickerWithPresets';
import { useStackOnOverflow } from '../../../../components/common/ConfirmModal/useStackOnOverflow';
import { ADD_CALENDAR_GUIDE_URL } from '../../../../lib/externalLinks';
import { TroubleshootLink } from '../../../../components/common/TroubleshootLink/TroubleshootLink';
import { Spinner } from '../../../../components/common/Spinner/Spinner';
import { CalendarRequestError, probeCalendar, type AddCalendarInput, type CalendarAddError, type CalendarSourceDto } from '../../../../api/calendar';
import styles from './CalendarSourceModal.module.scss';

const PICKER_PLACEMENT = 'top-end' as const;
const PROBE_DELAY_MS = 500;
const LOOKS_LIKE_URL = /^(https?|webcal):\/\/[^\s/]+\.[^\s/]+/i;
const ADDRESS_PLACEHOLDER = 'https://example.com/calendar.ics';

export const CALENDAR_COLORS: readonly string[] = [
  '#8b7cff', '#ff9f0a', '#32d74b', '#0a84ff', '#ff453a', '#bf5af2', '#64d2ff', '#ffd60a',
];

const ERROR_KEYS: Record<CalendarAddError, string> = {
  unreachable: 'panel.widget.calendar.add.error.unreachable',
  unauthorized: 'panel.widget.calendar.add.error.unauthorized',
  notFound: 'panel.widget.calendar.add.error.notFound',
  notIcs: 'panel.widget.calendar.add.error.notIcs',
  tooLarge: 'panel.widget.calendar.add.error.tooLarge',
  invalidUrl: 'panel.widget.calendar.add.error.invalidUrl',
  limitReached: 'panel.widget.calendar.add.error.limitReached',
  duplicate: 'panel.widget.calendar.add.error.duplicate',
};

/** The first palette colour no existing calendar uses, else the first. */
export function nextCalendarColor(used: readonly string[]): string {
  const taken = new Set(used.map(c => c.toLowerCase()));
  return CALENDAR_COLORS.find(c => !taken.has(c)) ?? CALENDAR_COLORS[0];
}

/** Google's public iCal address, which a calendar that is not public refuses. */
export function isGooglePublicAddress(address: string): boolean {
  return /^(https?|webcal):\/\/calendar\.google\.com\/calendar\/ical\/.+\/public\//i.test(address.trim());
}

/** The feed's host, for a default name; null when the address does not parse. */
export function hostOfAddress(address: string): string | null {
  try {
    return new URL(address.trim().replace(/^webcal:/i, 'https:')).hostname || null;
  } catch {
    return null;
  }
}

interface CalendarSourceModalProps {
  open: boolean;
  usedColors: readonly string[];
  onClose: () => void;
  // Add mode.
  onAdd?: (input: AddCalendarInput) => Promise<unknown>;
  // Edit mode: the calendar being edited, with save and remove.
  source?: CalendarSourceDto | null;
  onSave?: (patch: { name: string; color: string }) => Promise<unknown>;
  onRemove?: () => void;
  // A message from the caller (a failed remove), shown like the dialog's own errors.
  notice?: string | null;
}

/** The Add calendar dialog, and the same dialog in edit mode for a calendar that exists. */
export function CalendarSourceModal({ open, usedColors, onAdd, source, onSave, onRemove, notice, onClose }: CalendarSourceModalProps) {
  const { t } = useTranslation();
  const editing = source != null;
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState(CALENDAR_COLORS[0]);
  const [customColor, setCustomColor] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [probing, setProbing] = useState(false);
  const nameTyped = useRef(false);
  const probeSeq = useRef(0);
  const lastProbed = useRef('');
  const probeTimer = useRef<number | null>(null);
  useEffect(() => () => { if (probeTimer.current !== null) window.clearTimeout(probeTimer.current); }, []);
  const attempt = useRef(0);
  const actionsRef = useRef<HTMLDivElement>(null);
  const errorId = useId();
  useStackOnOverflow(actionsRef, styles.stacked, open);

  useEffect(() => {
    if (!open) return;
    attempt.current += 1;
    setUrl('');
    setName(source?.name ?? '');
    setError(null);
    setBusy(false);
    setProbing(false);
    nameTyped.current = false;
    probeSeq.current += 1;
    lastProbed.current = '';
    const start = source?.color ?? nextCalendarColor(usedColors);
    setColor(start);
    setCustomColor(CALENDAR_COLORS.includes(start.toLowerCase()) ? '' : start);
    // Reset only on the closed to open edge; the palette pick follows the colours in use at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const errorFor = (e: unknown, address: string): string => {
    const code = e instanceof CalendarRequestError ? e.code : null;
    const googlePublic = (code === 'notFound' || code === 'unauthorized') && isGooglePublicAddress(address);
    return t(googlePublic ? 'panel.widget.calendar.add.error.googlePublic' : code ? ERROR_KEYS[code] : 'panel.widget.calendar.add.error.generic');
  };

  // Reads the feed's own name for the Name field; the latest address wins and a typed name is never replaced.
  const runProbe = (address: string) => {
    const wanted = address.trim();
    if (editing || !LOOKS_LIKE_URL.test(wanted) || lastProbed.current === wanted) return;
    lastProbed.current = wanted;
    const mine = ++probeSeq.current;
    setProbing(true);
    probeCalendar(wanted)
      .then(result => {
        if (mine !== probeSeq.current) return;
        if (result && !nameTyped.current) setName(result.name ?? '');
      })
      .catch(e => {
        if (mine !== probeSeq.current) return;
        if (e instanceof CalendarRequestError && e.code) setError(errorFor(e, wanted));
      })
      .finally(() => { if (mine === probeSeq.current) setProbing(false); });
  };

  const scheduleProbe = (address: string) => {
    if (probeTimer.current !== null) window.clearTimeout(probeTimer.current);
    probeTimer.current = window.setTimeout(() => runProbe(address), PROBE_DELAY_MS);
  };

  if (!open) return null;

  const changed = editing && (name.trim() !== source.name || color.toLowerCase() !== source.color.toLowerCase());
  const canSubmit = !busy && (editing ? changed : url.trim() !== '');

  const submit = async () => {
    if (!canSubmit) return;
    const mine = attempt.current;
    setBusy(true);
    setError(null);
    const address = url.trim();
    try {
      if (editing) await onSave?.({ name: name.trim(), color });
      else await onAdd?.({ url: address, name: name.trim(), color });
      if (attempt.current === mine) onClose();
    } catch (e) {
      if (attempt.current !== mine) return;
      if (editing) {
        setError(t('panel.widget.calendar.edit.error'));
        setBusy(false);
        return;
      }
      setError(errorFor(e, address));
      setBusy(false);
    }
  };

  return (
    <Overlay
      open={open}
      onClose={onClose}
      variant="alert"
      onEnter={() => { void submit(); }}
      backdropClassName={styles.backdrop}
      className={styles.modal}
      ariaLabel={t(editing ? 'panel.widget.calendar.edit.title' : 'panel.widget.calendar.add.title')}
    >
      <h2 className={styles.title}>{t(editing ? 'panel.widget.calendar.edit.title' : 'panel.widget.calendar.add.title')}</h2>
      <div className={styles.body}>
        {editing ? (
          <div className={styles.field}>
            <span className={styles.label}>{t('panel.widget.calendar.edit.feed')}</span>
            <span className={styles.readonly}>{source.host ?? ''}</span>
            <span className={styles.note}>{t('panel.widget.calendar.add.readOnly')}</span>
            {(error ?? notice) && <p id={errorId} className={styles.error} role="alert">{error ?? notice}</p>}
          </div>
        ) : (
        <div className={styles.field}>
          <span className={styles.label}>{t('panel.widget.calendar.add.address')}</span>
          <TextInput
            value={url}
            placeholder={ADDRESS_PLACEHOLDER}
            ariaLabel={t('panel.widget.calendar.add.address')}
            onInput={value => { setUrl(value); setError(null); scheduleProbe(value); }}
            onBlur={value => runProbe(value)}
            invalid={error !== null}
            autoComplete="off"
          />
          {error && <p id={errorId} className={styles.error} role="alert">{error}</p>}
          <span className={styles.note}>{t('panel.widget.calendar.add.readOnly')}</span>
          <TroubleshootLink className={styles.helpLink} label={t('panel.widget.calendar.add.addressHelp')} href={ADD_CALENDAR_GUIDE_URL} />
        </div>
        )}
        <div className={styles.field}>
          <span className={styles.label}>
            {t('panel.widget.calendar.add.name')}
            {probing && <Spinner size={12} />}
          </span>
          <TextInput
            value={name}
            placeholder={t('panel.widget.calendar.add.namePlaceholder')}
            maxLength={60}
            ariaLabel={t('panel.widget.calendar.add.name')}
            onInput={value => { nameTyped.current = true; setName(value); }}
            autoComplete="off"
          />
        </div>
        <div className={styles.field}>
          <span className={styles.label}>{t('panel.widget.calendar.add.color')}</span>
          <ColorPickerWithPresets
            value={color}
            presets={CALENDAR_COLORS}
            onCommit={setColor}
            allowCustom
            customColor={customColor || undefined}
            onCustomCommit={setCustomColor}
            pickerPortal
            pickerPlacement={PICKER_PLACEMENT}
            className={styles.swatches}
          />
        </div>
      </div>
      <div ref={actionsRef} className={styles.actions}>
        <Button tone="neutral" size="md" onClick={onClose}>{t('confirm.cancel')}</Button>
        <div className={styles.actionsEnd}>
          {editing && onRemove && (
            <Button tone="danger" size="md" onClick={onRemove} disabled={busy}>{t('panel.widget.calendar.remove.title')}</Button>
          )}
          <Button tone="accent" size="md" onClick={() => { void submit(); }} disabled={!canSubmit} loading={busy}>
            {t(editing ? 'panel.widget.calendar.edit.save' : 'panel.widget.calendar.add.confirm')}
          </Button>
        </div>
      </div>
    </Overlay>
  );
}
