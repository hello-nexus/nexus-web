import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Activity, Bot, Box, Brain, Eye, EyeOff, Fan, History, IdCard, KeyRound, Lightbulb, RefreshCcwDot } from 'lucide-react';
import { Button } from '../../common/Button/Button';
import { SettingsSection } from '../../common/SettingsSection/SettingsSection';
import { SettingRow, SettingToggle } from '../../common/SettingRow/SettingRow';
import { InfoList, InfoRow } from '../../common/InfoList/InfoList';
import { ConfirmModal } from '../../common/ConfirmModal/ConfirmModal';
import { Badge } from '../../common/Badge/Badge';
import { UsageBar } from '../../common/UsageBar/UsageBar';
import {
  fetchAiStatus, postAiConfig, rotateAiToken,
  fetchAssistantStatus, installRuntime, removeRuntime,
  pullModel, removeModel, selectModel,
  type AiCapabilities, type AiStatusResponse,
  type AiAssistantStatus, type AiAssistantProgressFrame,
} from '../../../api/aiIntegration';
import { useTopic } from '../../../hooks/useMultiplexSocket';
import { useTranslation } from '../../../lib/i18n';
import { formatBytes } from '../DiagnosticsView/diagnosticsHelpers';
import { DEFAULT_NUMBER_FORMAT, type NumberFormat } from '../../../lib/units';
import { isAssistantTransient, progressPercent } from './assistantProgress';
import styles from './SettingsView.module.scss';

export interface AiIntegrationSectionProps {
  serviceOnline: boolean;
  /** Governs the digit/decimal display of assistant download sizes. Defaults to the system locale. */
  numberFormat?: NumberFormat;
}

const CAPABILITY_KEYS = ['telemetry', 'cooling', 'lighting', 'profiles', 'history'] as const;
type CapabilityKey = typeof CAPABILITY_KEYS[number];

const CAPABILITY_ICONS: Record<CapabilityKey, ReactNode> = {
  telemetry: <Activity />,
  cooling: <Fan />,
  lighting: <Lightbulb />,
  profiles: <IdCard />,
  history: <History />,
};

// Decorative placeholder for the masked token - its length is unrelated to
// the real token's length so the mask alone never leaks a size hint.
const TOKEN_MASK = '•'.repeat(24);

/**
 * "AI Integration" settings: the master MCP-endpoint toggle plus, once
 * enabled, per-capability consent toggles, the bearer token (masked/reveal/
 * copy/rotate), and the endpoint the user points an MCP client at.
 *
 * Server-authoritative like the telemetry consent block in PrivacyTab: status
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
export function AiIntegrationSection({ serviceOnline, numberFormat = DEFAULT_NUMBER_FORMAT }: AiIntegrationSectionProps) {
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

  // ── Local AI assistant ──
  const assistantEnabled = serviceOnline && status?.enabled === true;
  const [assistant, setAssistant] = useState<AiAssistantStatus | null>(null);
  const [assistantMutating, setAssistantMutating] = useState(false);
  const [removeRuntimeConfirmOpen, setRemoveRuntimeConfirmOpen] = useState(false);
  const [removeModelConfirmId, setRemoveModelConfirmId] = useState<string | null>(null);
  const [assistantActionError, setAssistantActionError] = useState(false);
  const wasTransientRef = useRef(false);

  const assistantProgress = useTopic<AiAssistantProgressFrame>('aiAssistant', assistantEnabled);

  useEffect(() => {
    if (!assistantEnabled) { setAssistant(null); return; }
    let cancelled = false;
    fetchAssistantStatus().then(data => { if (!cancelled) setAssistant(data); });
    return () => { cancelled = true; };
  }, [assistantEnabled]);

  // Mirrors useBenchmark's "refetch the canonical resource once the push
  // signals terminal" idiom: the WS frame carries only runtimeState/
  // downloadProgress/pull, not the installedModels/activeModel/busy fields a
  // just-finished install or pull actually changed - pull those over REST the
  // moment the live frame stops being transient.
  useEffect(() => {
    if (!assistantProgress) return;
    const transient = isAssistantTransient(assistantProgress.runtimeState, assistantProgress.pull);
    if (wasTransientRef.current && !transient) {
      fetchAssistantStatus().then(data => { if (data) setAssistant(data); });
    }
    wasTransientRef.current = transient;
  }, [assistantProgress]);

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

  // A single in-flight guard for every assistant mutation: the service enforces
  // single-flight runtime/model operations itself, so the client only needs to
  // stop a second click from firing while one request is outstanding. Each
  // mutation route's response shape is not pinned by the contract, so apply it
  // when present and otherwise fall back to a fresh GET to reconcile state.
  const runAssistantMutation = async (request: () => Promise<AiAssistantStatus | null>) => {
    if (assistantMutating) return;
    setAssistantMutating(true);
    setAssistantActionError(false);
    try {
      const resp = await request();
      setAssistant(resp ?? await fetchAssistantStatus());
      // A null response means the request itself failed - the section
      // still reconciles to the server's actual state above, but a silent
      // failure would leave the user unsure whether their click did
      // anything at all.
      if (resp === null) setAssistantActionError(true);
    } finally {
      setAssistantMutating(false);
    }
  };

  const doInstallRuntime = () => void runAssistantMutation(installRuntime);

  const doRemoveRuntime = async () => {
    await runAssistantMutation(removeRuntime);
    setRemoveRuntimeConfirmOpen(false);
  };

  const doPullModel = (modelId: string) => void runAssistantMutation(() => pullModel(modelId));

  const doRemoveModel = async (modelId: string) => {
    await runAssistantMutation(() => removeModel(modelId));
    setRemoveModelConfirmId(null);
  };

  const doSelectModel = (modelId: string) => void runAssistantMutation(() => selectModel(modelId));

  // The WS frame only wins the display while it reports something genuinely
  // in flight (a download/start/pull) - once it settles, the last REST
  // snapshot is authoritative. Otherwise a stale cached frame (useTopic
  // seeds from a module-level last-frame cache that outlives this section
  // remounting) would keep overriding a REST-only mutation's result: install
  // the runtime (WS ends on 'installed'), later remove it (REST confirms
  // 'notInstalled') - without this guard the row would keep reading the
  // stale 'installed' frame forever, since no new WS push follows a plain
  // removal.
  const wsTransient = assistantProgress !== null
    && isAssistantTransient(assistantProgress.runtimeState, assistantProgress.pull);
  const runtimeState = wsTransient && assistantProgress
    ? assistantProgress.runtimeState
    : assistant?.runtimeState ?? assistantProgress?.runtimeState ?? 'notInstalled';
  const downloadProgress = wsTransient && assistantProgress
    ? assistantProgress.downloadProgress
    : assistant?.downloadProgress ?? null;
  // Same wsTransient guard as runtimeState/downloadProgress above: the
  // service clears the pull field to null/absent on both success and
  // failure, so a genuinely terminal frame already stops wsTransient (and
  // therefore this) from holding it. The assistant.busy check is what lets a
  // MISSED terminal frame converge instead of wedging forever - it is kept
  // fresh by the fallback poll below, so once the REST snapshot no longer
  // reports a pulling-model op the row un-wedges even if the cached WS frame
  // itself never updated. Kind string must match the service BusyKind constant.
  const activePull = wsTransient && assistantProgress?.pull && assistantProgress.pull.status !== 'success'
    && assistant?.busy?.kind === 'pullingModel'
    ? assistantProgress.pull
    : null;
  const assistantBusy = assistantMutating || assistant?.busy != null;

  // Fallback poll: a missed WS reconnect (the multiplex socket resubscribes
  // on every reconnect, but a frame can still be lost in the gap) must not
  // leave the section stuck showing "Downloading..." forever. Mirrors
  // useBenchmark's interval fallback alongside its WS subscription.
  // A REST-reported busy op (e.g. a model pull with no WS frame yet) is
  // transient too, so the poll converges even when the socket delivers
  // nothing - otherwise a pull leaves the row disabled until remount.
  const transientNow = isAssistantTransient(runtimeState, activePull) || assistant?.busy != null;
  useEffect(() => {
    if (!assistantEnabled || !transientNow) return;
    const id = setInterval(() => {
      fetchAssistantStatus().then(data => { if (data) setAssistant(data); });
    }, 4000);
    return () => clearInterval(id);
  }, [assistantEnabled, transientNow]);

  const runtimeStatusText = (): string => {
    // A system Ollama that has since errored out must still surface as an
    // error, not linger on "using the system installation".
    if (assistant?.systemOllamaDetected && runtimeState !== 'error') {
      return t('settings.ai.assistant.runtime.status.systemDetected');
    }
    if (runtimeState === 'downloading') {
      if (downloadProgress && downloadProgress.total > 0) {
        return t('settings.ai.assistant.progress.downloading', {
          percent: String(progressPercent(downloadProgress.received, downloadProgress.total)),
          size: formatBytes(downloadProgress.total, numberFormat),
        });
      }
      return t('settings.ai.assistant.runtime.status.downloading');
    }
    return t(`settings.ai.assistant.runtime.status.${runtimeState}`);
  };

  const modelPullText = (modelId: string): string | null => {
    if (!activePull || activePull.model !== modelId) return null;
    if (activePull.total > 0) {
      return t('settings.ai.assistant.progress.downloading', {
        percent: String(progressPercent(activePull.received, activePull.total)),
        size: formatBytes(activePull.total, numberFormat),
      });
    }
    return activePull.status;
  };

  return (
    <>
      {status !== null && (
        <SettingsSection title={t('settings.ai.title')}>
          <SettingToggle
            label={t('settings.ai.master.label')}
            icon={<Bot />}
            iconLeading="subtle"
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
                  icon={CAPABILITY_ICONS[key]}
                  iconLeading="subtle"
                  description={t(`settings.ai.capability.${key}.description`)}
                  checked={status.capabilities[key]}
                  onChange={() => toggleCapability(key)}
                  disabled={!serviceOnline || mutating}
                />
              ))}

              <SettingRow
                label={t('settings.ai.token.label')}
                icon={<KeyRound />}
                iconLeading="subtle"
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
                icon={<RefreshCcwDot />}
                iconLeading="subtle"
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

              {assistant !== null && (
                <>
                  <SettingRow
                    label={t('settings.ai.assistant.runtime.label')}
                    icon={<Box />}
                    iconLeading="subtle"
                    description={t('settings.ai.assistant.runtime.description')}
                  >
                    <div className={styles.runtimeControl}>
                      <span className={styles.runtimeStatus}>{runtimeStatusText()}</span>
                      {runtimeState === 'downloading' && downloadProgress && downloadProgress.total > 0 && (
                        <div className={styles.progressTrack}>
                          <UsageBar value={downloadProgress.received / downloadProgress.total} />
                        </div>
                      )}
                      {/* 'error' offers both: retry the install, or clear
                          whatever is on disk and start over. */}
                      {!assistant.systemOllamaDetected && (runtimeState === 'notInstalled' || runtimeState === 'error') && (
                        <Button
                          type="button"
                          tone="accent"
                          size="sm"
                          onClick={doInstallRuntime}
                          disabled={!serviceOnline || assistantBusy}
                        >
                          {t('settings.ai.assistant.runtime.download')}
                        </Button>
                      )}
                      {!assistant.systemOllamaDetected
                        && (runtimeState === 'installed' || runtimeState === 'running' || runtimeState === 'error') && (
                        <Button
                          type="button"
                          tone="danger"
                          size="sm"
                          onClick={() => setRemoveRuntimeConfirmOpen(true)}
                          disabled={!serviceOnline || assistantBusy}
                        >
                          {t('settings.ai.assistant.runtime.remove')}
                        </Button>
                      )}
                    </div>
                  </SettingRow>
                  {assistantActionError && <p className={styles.note}>{t('settings.ai.assistant.actionError')}</p>}

                  <SettingRow
                    label={t('settings.ai.assistant.model.label')}
                    icon={<Brain />}
                    iconLeading="subtle"
                    description={t('settings.ai.assistant.model.description')}
                    align="start"
                  >
                    <div className={styles.modelList}>
                      {assistant.catalog.map(model => {
                        const installedModel = assistant.installedModels.find(m => m.id === model.id);
                        const isInstalled = installedModel !== undefined;
                        const isActive = assistant.activeModel === model.id;
                        const pullText = modelPullText(model.id);
                        const isPulling = pullText !== null;
                        return (
                          <div key={model.id} className={styles.modelRow}>
                            <div className={styles.modelInfo}>
                              <span className={styles.modelLabel}>
                                {model.label}
                                {model.recommended && (
                                  <Badge label={t('settings.ai.assistant.model.recommended')} color="var(--accent)" />
                                )}
                                {isActive && (
                                  <Badge label={t('settings.ai.assistant.model.active')} color="var(--good)" />
                                )}
                              </span>
                              <span className={styles.modelMeta}>
                                {formatBytes(model.downloadBytes, numberFormat)} · {model.ramHint}
                              </span>
                              {isPulling && (
                                <div className={styles.modelProgress}>
                                  <div className={styles.progressTrack}>
                                    <UsageBar value={activePull ? progressPercent(activePull.received, activePull.total) / 100 : 0} />
                                  </div>
                                  <span className={styles.modelProgressLabel}>{pullText}</span>
                                </div>
                              )}
                            </div>
                            {!isPulling && (
                              <div className={styles.modelActions}>
                                {!isInstalled && (
                                  <Button
                                    type="button"
                                    tone="accent"
                                    size="sm"
                                    onClick={() => doPullModel(model.id)}
                                    disabled={!serviceOnline || assistantBusy}
                                    aria-label={t('settings.ai.assistant.model.downloadAria', { model: model.label })}
                                  >
                                    {t('settings.ai.assistant.model.download')}
                                  </Button>
                                )}
                                {isInstalled && !isActive && (
                                  <Button
                                    type="button"
                                    tone="neutral"
                                    size="sm"
                                    onClick={() => doSelectModel(model.id)}
                                    disabled={!serviceOnline || assistantBusy}
                                    aria-label={t('settings.ai.assistant.model.useAria', { model: model.label })}
                                  >
                                    {t('settings.ai.assistant.model.use')}
                                  </Button>
                                )}
                                {isInstalled && (
                                  <Button
                                    type="button"
                                    tone="danger"
                                    size="sm"
                                    onClick={() => setRemoveModelConfirmId(model.id)}
                                    disabled={!serviceOnline || assistantBusy}
                                    aria-label={t('settings.ai.assistant.model.removeAria', { model: model.label })}
                                  >
                                    {t('settings.ai.assistant.model.remove')}
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </SettingRow>
                </>
              )}
            </>
          )}
        </SettingsSection>
      )}

      <ConfirmModal
        open={rotateConfirmOpen}
        title={t('settings.ai.rotate.confirmTitle')}
        message={t('settings.ai.rotate.confirmMessage')}
        note={rotateError ? t('settings.ai.rotate.failed') : undefined}
        // eslint-disable-next-line i18next/no-literal-string -- enum tone value, not user-facing text
        noteTone={rotateError ? 'danger' : 'default'}
        confirmLabel={t('settings.ai.rotate.confirmButton')}
        confirmDisabled={mutating}
        destructive
        onConfirm={doRotateToken}
        onCancel={() => { setRotateError(false); setRotateConfirmOpen(false); }}
      />

      <ConfirmModal
        open={removeRuntimeConfirmOpen}
        title={t('settings.ai.assistant.runtime.removeConfirmTitle')}
        message={t('settings.ai.assistant.runtime.removeConfirmMessage')}
        confirmLabel={t('settings.ai.assistant.runtime.removeConfirmButton')}
        confirmDisabled={assistantMutating}
        destructive
        onConfirm={doRemoveRuntime}
        onCancel={() => setRemoveRuntimeConfirmOpen(false)}
      />

      <ConfirmModal
        open={removeModelConfirmId !== null}
        title={t('settings.ai.assistant.model.removeConfirmTitle')}
        message={t('settings.ai.assistant.model.removeConfirmMessage')}
        confirmLabel={t('settings.ai.assistant.model.removeConfirmButton')}
        confirmDisabled={assistantMutating}
        destructive
        onConfirm={() => { if (removeModelConfirmId) void doRemoveModel(removeModelConfirmId); }}
        onCancel={() => setRemoveModelConfirmId(null)}
      />
    </>
  );
}
