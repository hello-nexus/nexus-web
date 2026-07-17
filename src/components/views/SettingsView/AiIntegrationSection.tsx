import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow, SettingToggle } from '../../common/SettingRow/SettingRow';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import {
  fetchAiStatus, postAiConfig, rotateAiToken,
  type AiCapabilities, type AiStatusResponse,
} from '../../../api/aiIntegration';
import { useTranslation } from '../../../lib/i18n';
import styles from './SettingsView.module.scss';

export interface AiIntegrationSectionProps {
  serviceOnline: boolean;
}

const CAPABILITY_KEYS = ['telemetry', 'cooling', 'lighting', 'profiles', 'history'] as const;
type CapabilityKey = typeof CAPABILITY_KEYS[number];

// Decorative placeholder for the masked token - its length is unrelated to
// the real token's length so the mask alone never leaks a size hint.
const TOKEN_MASK = '•'.repeat(24);

/**
 * "AI Integration" settings: the master MCP-endpoint toggle plus, once
 * enabled, per-capability consent toggles, the bearer token (masked/reveal/
 * copy/rotate), and the endpoint the user points an MCP client at.
 *
 * Server-authoritative like the telemetry consent block in GeneralTab: status
 * is fetched on mount and every mutation applies the POST response straight
 * back onto state (each route already returns the fresh AiStatusResponse, so
 * no follow-up GET is needed). Toggles flip optimistically and reconcile to
 * the server's echoed value, or roll back on a failed request.
 *
 * The master toggle, capability toggles, and token rotation share one
 * mutation runner: `mutatingRef` blocks a second mutation from starting while
 * one is in flight (all their controls disable together), and `seqRef` is
 * checked before a response is applied, so a request can never write state
 * for a mutation attempt other than the one that issued it.
 */
export function AiIntegrationSection({ serviceOnline }: AiIntegrationSectionProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<AiStatusResponse | null>(null);
  const [mutating, setMutating] = useState(false);
  const mutatingRef = useRef(false);
  const seqRef = useRef(0);
  const [rotateConfirmOpen, setRotateConfirmOpen] = useState(false);
  const [rotateError, setRotateError] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!serviceOnline) return;
    let cancelled = false;
    // A refetch racing an in-flight mutation must not clobber its result: a
    // stale snapshot only applies while the mutation sequence is untouched.
    const seqAtFetch = seqRef.current;
    fetchAiStatus().then(data => {
      if (data && !cancelled && !mutatingRef.current && seqRef.current === seqAtFetch) setStatus(data);
    });
    return () => { cancelled = true; };
  }, [serviceOnline]);

  useEffect(() => () => {
    if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
  }, []);

  // A token revealed before the master toggle turns off must not reappear in
  // plaintext the moment the section re-enables.
  useEffect(() => {
    if (status?.enabled === false) setRevealed(false);
  }, [status?.enabled]);

  const runMutation = async (
    optimistic: AiStatusResponse | null,
    request: () => Promise<AiStatusResponse | null>,
  ): Promise<boolean> => {
    if (mutatingRef.current || !status) return false;
    const previous = status;
    mutatingRef.current = true;
    const seq = ++seqRef.current;
    setMutating(true);
    if (optimistic) setStatus(optimistic);
    let resp: AiStatusResponse | null = null;
    try {
      resp = await request();
    } catch {
      // A rejected request (non-JSON body, aborted fetch) is the same outcome
      // as a null response: roll back below. Swallowing it here keeps the
      // rejection from escaping the fire-and-forget toggle handlers.
    } finally {
      // The busy flags must clear on every path, or the whole section wedges
      // disabled until remount. Only the state application is sequence-gated.
      if (seqRef.current === seq) setStatus(resp ?? previous);
      mutatingRef.current = false;
      setMutating(false);
    }
    return resp !== null;
  };

  const toggleMaster = () => {
    if (!status) return;
    const nextEnabled = !status.enabled;
    void runMutation({ ...status, enabled: nextEnabled }, () => postAiConfig({ enabled: nextEnabled }));
  };

  const toggleCapability = (key: CapabilityKey) => {
    if (!status) return;
    const nextValue = !status.capabilities[key];
    const nextCapabilities: AiCapabilities = { ...status.capabilities, [key]: nextValue };
    void runMutation(
      { ...status, capabilities: nextCapabilities },
      () => postAiConfig({ capabilities: { [key]: nextValue } }),
    );
  };

  const doRotateToken = async () => {
    const succeeded = await runMutation(null, rotateAiToken);
    // Rotation is a security action: a silent failure would let the user walk
    // away believing a leaked token was revoked. Keep the modal open and show
    // the failure; only a confirmed rotation closes it.
    if (succeeded) {
      setRevealed(false);
      setRotateError(false);
      setRotateConfirmOpen(false);
    } else {
      setRotateError(true);
    }
  };

  const copyToken = async () => {
    if (!status?.token) return;
    try {
      await navigator.clipboard.writeText(status.token);
      setCopied(true);
      if (copyResetTimer.current !== null) window.clearTimeout(copyResetTimer.current);
      copyResetTimer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (older WebViews on the panel side) - no
      // error surface needed, the button just won't flip to "Copied".
    }
  };

  return (
    <>
      {status !== null && (
        <SettingsSection title={t('settings.ai.title')}>
          <SettingToggle
            label={t('settings.ai.master.label')}
            anchorId="set-ai-integration"
            description={t('settings.ai.master.description')}
            checked={status.enabled}
            onChange={toggleMaster}
            disabled={!serviceOnline || mutating}
          />
          {status.enabled && (
            <>
              {CAPABILITY_KEYS.map(key => (
                <SettingToggle
                  key={key}
                  label={t(`settings.ai.capability.${key}.label`)}
                  description={t(`settings.ai.capability.${key}.description`)}
                  checked={status.capabilities[key]}
                  onChange={() => toggleCapability(key)}
                  disabled={!serviceOnline || mutating}
                />
              ))}

              <SettingRow
                label={t('settings.ai.token.label')}
                description={t('settings.ai.token.description')}
              >
                <span className={styles.tokenValue}>{revealed ? status.token : TOKEN_MASK}</span>
                <Button
                  type="button"
                  tone="ghost"
                  size="sm"
                  icon={revealed ? <EyeOff size={14} /> : <Eye size={14} />}
                  onClick={() => setRevealed(r => !r)}
                  title={t(revealed ? 'settings.ai.token.hide' : 'settings.ai.token.reveal')}
                  aria-label={t(revealed ? 'settings.ai.token.hide' : 'settings.ai.token.reveal')}
                  disabled={!serviceOnline}
                />
                <Button
                  type="button"
                  tone="accent"
                  size="sm"
                  onClick={copyToken}
                  disabled={!serviceOnline}
                >
                  {copied ? t('settings.ai.token.copied') : t('settings.ai.token.copy')}
                </Button>
              </SettingRow>

              <SettingRow
                label={t('settings.ai.rotate.label')}
                description={t('settings.ai.rotate.description')}
              >
                <Button
                  type="button"
                  tone="danger"
                  size="sm"
                  onClick={() => { setRotateError(false); setRotateConfirmOpen(true); }}
                  disabled={!serviceOnline || mutating}
                >
                  {t('settings.ai.rotate.button')}
                </Button>
              </SettingRow>

              <InfoList>
                <InfoRow
                  label={t('settings.ai.status.label')}
                  value={t(status.running ? 'settings.ai.status.running' : 'settings.ai.status.notRunning')}
                  tone={status.running ? 'good' : 'warn'}
                />
                <InfoRow label={t('settings.ai.endpoint.label')} value={status.endpoint} />
                {status.lastError && (
                  <InfoRow label={t('settings.ai.error.label')} value={status.lastError} tone="bad" />
                )}
              </InfoList>
              <p className={styles.note}>{t('settings.ai.hint')}</p>
            </>
          )}
        </SettingsSection>
      )}

      <ConfirmModal
        open={rotateConfirmOpen}
        title={t('settings.ai.rotate.confirmTitle')}
        message={t('settings.ai.rotate.confirmMessage')}
        note={rotateError ? t('settings.ai.rotate.failed') : undefined}
        noteTone={rotateError ? 'danger' : 'default'}
        confirmLabel={t('settings.ai.rotate.confirmButton')}
        confirmDisabled={mutating}
        destructive
        onConfirm={doRotateToken}
        onCancel={() => { setRotateError(false); setRotateConfirmOpen(false); }}
      />
    </>
  );
}
