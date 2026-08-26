import { useCallback, useEffect, useRef, useState } from 'react';
import { Smartphone, LogOut, SatelliteDish, Zap, Lock } from 'lucide-react';
import classNames from 'classnames';
import { ConfirmModal } from '../ConfirmModal/ConfirmModal';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { Tabs, type TabDef } from '../Tabs/Tabs';
import { PairingQrView } from '../PairingQr/PairingQrView';
import { PairingOffState } from '../PairingQr/PairingOffState';
import { EditableText } from '../Editable/EditableText';
import { Select } from '../Select/Select';
import { SettingsSection } from '../SettingsSection/SettingsSection';
import { SettingRow, SettingToggle } from '../SettingRow/SettingRow';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';
import {
  fetchPanelPhonePairQr,
  fetchPanelPhoneSessions,
  fetchPanelRemoteControlState,
  hasNewPairedSession,
  renamePanelPhoneSession,
  revokeAllPanelPhoneSessions,
  revokePanelPhoneSession,
  setPanelRemoteControlEnabled,
  startPanelPhonePairCode,
  fetchPanelPairBroadcast,
  setPanelPairBroadcast,
  fetchPanelRelay,
  setPanelRelay,
  type PanelPhonePairQr,
  type PanelPhonePairCodeStart,
  type PanelPhoneSessionsResponse,
  type PairBroadcastState,
} from '../../../api/panel';
import { useTranslation } from '../../../lib/i18n';
import { useUnitPrefs } from '../../../hooks/useUiSettings';
import { resolveHour12, type TimeFormat } from '../../../lib/units';
import appStyles from '../../../App.module.scss';
import local from './PairRemoteContent.module.scss';

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function formatConnectedDevices(count: number, t: TranslateFn) {
  return t(count === 1 ? 'phonePair.connectedDeviceOne' : 'phonePair.connectedDeviceOther', { count });
}

function formatRelativeTime(value: number, now: number, t: TranslateFn) {
  if (!value) return t('phonePair.unknown');
  const diff = Math.max(0, now - value);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < 30_000) return t('phonePair.timeJustNow');
  if (diff < minute) return t('phonePair.timeLessThanMinuteAgo');
  if (diff < hour) return t('phonePair.timeMinutesAgo', { count: Math.floor(diff / minute) });
  if (diff < day) return t('phonePair.timeHoursAgo', { count: Math.floor(diff / hour) });
  return t('phonePair.timeDaysAgo', { count: Math.floor(diff / day) });
}

function formatDateTime(value: number, t: TranslateFn, timeFormat: TimeFormat) {
  if (!value) return t('phonePair.unknown');
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: resolveHour12(timeFormat),
  }).format(new Date(value));
}

export interface PairRemoteContentProps {
  // Gates fetch/poll/clock/TTL effects. Desktop passes the modal's `open`; the
  // panel sheet mounts this only while open, so it passes a constant `true`.
  active: boolean;
  // 'grid': desktop two-column modal layout. 'stacked': single column for the
  // panel bottom-sheet, ordered code → connection options → authorized devices.
  layout: 'grid' | 'stacked';
  // Live connected-device count. Falls back to the sessions poll's count when
  // omitted (the panel has no separate subscriber signal to pass).
  connectedCount?: number;
  // Remote-control killswitch. Controlled on desktop (Dashboard owns the state
  // and reads it elsewhere); omit to self-manage on the panel, where this
  // component fetches and owns it.
  remoteEnabled?: boolean;
  onRemoteEnabledChange?: (next: boolean) => void;
}

export function PairRemoteContent({
  active,
  layout,
  connectedCount,
  remoteEnabled,
  onRemoteEnabledChange,
}: PairRemoteContentProps) {
  const { t } = useTranslation();
  const { timeFormat } = useUnitPrefs();
  const controlled = remoteEnabled !== undefined;
  const [remoteEnabledOwn, setRemoteEnabledOwn] = useState(false);
  const effRemoteEnabled = controlled ? remoteEnabled : remoteEnabledOwn;
  // Single setter the optimistic flips route through: notify a controlling
  // parent and, when uncontrolled, drive the internal copy.
  const setRemoteEnabled = useCallback((next: boolean) => {
    onRemoteEnabledChange?.(next);
    if (!controlled) setRemoteEnabledOwn(next);
  }, [controlled, onRemoteEnabledChange]);

  const [qr, setQr] = useState<PanelPhonePairQr | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<PanelPhoneSessionsResponse | null>(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [confirmRemoveAllOpen, setConfirmRemoveAllOpen] = useState(false);
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  // Guards against double-trigger from the modal while the POST is in flight,
  // but does NOT disable the Toggle visual (Toggle's :disabled drops opacity
  // to 0.5 without a transition, which makes the post-confirm flip read as
  // "fading" instead of a crisp ON->OFF flip).
  const togglingRemoteRef = useRef(false);
  const [relayEnabled, setRelayEnabled] = useState(false);
  const togglingRelayRef = useRef(false);
  const [now, setNow] = useState(() => Date.now());
  const [pairMode, setPairMode] = useState<'qr' | 'code'>('qr');
  const [pairCode, setPairCode] = useState<PanelPhonePairCodeStart | null>(null);
  const [pairCodeBusy, setPairCodeBusy] = useState(false);
  const [pairCodeError, setPairCodeError] = useState<string | null>(null);
  const [broadcast, setBroadcast] = useState<PairBroadcastState>({ mode: 'always', untilUnixSeconds: 0 });
  const refreshInFlightRef = useRef(false);
  const sessionsInFlightRef = useRef(false);
  // Incrementing key that remounts the fade-from-white reveal overlay on the
  // manual-code box whenever the displayed token re-mints. A bumped key forces
  // React to unmount the old overlay and mount a fresh one, which re-fires the
  // CSS keyframes (an animation does NOT replay on a class that is already
  // applied). The last reacted value is tracked so we only bump on an actual
  // change of the displayed content, not on every unrelated re-render. The QR
  // box runs this same effect internally inside PairingQrView.
  const [codeRevealKey, setCodeRevealKey] = useState(0);
  const lastCodeRevealRef = useRef<string | null>(null);
  // Set of authorized session ids observed on the previous sessions poll. Used
  // to detect when a NEW device pairs so we can re-mint the single-use QR/code.
  // null until the first poll resolves so the initial load never counts as new.
  const prevSessionIdsRef = useRef<ReadonlySet<string> | null>(null);

  // Seed the killswitch state when self-managing (panel sheet). Controlled
  // parents (desktop) supply it as a prop, so skip the fetch there.
  useEffect(() => {
    if (!active || controlled) return;
    let cancelled = false;
    fetchPanelRemoteControlState().then(next => {
      if (!cancelled && next) setRemoteEnabledOwn(next.enabled);
    });
    return () => { cancelled = true; };
  }, [active, controlled]);

  const refresh = useCallback(() => {
    if (refreshInFlightRef.current) return;
    refreshInFlightRef.current = true;
    setLoading(true);
    fetchPanelPhonePairQr().then(next => {
      setQr(next);
      setNow(Date.now());
    }).finally(() => {
      refreshInFlightRef.current = false;
      setLoading(false);
    });
  }, []);

  const loadSessions = useCallback((showLoading = false) => {
    if (sessionsInFlightRef.current) return;
    sessionsInFlightRef.current = true;
    if (showLoading) setSessionsLoading(true);
    fetchPanelPhoneSessions().then(next => {
      if (next) setSessions(next);
    }).finally(() => {
      sessionsInFlightRef.current = false;
      if (showLoading) setSessionsLoading(false);
    });
  }, []);

  const revokeSession = useCallback(async (id: string) => {
    setRevokingId(id);
    await revokePanelPhoneSession(id);
    await fetchPanelPhoneSessions().then(next => {
      if (next) setSessions(next);
    });
    setRevokingId(null);
  }, []);

  const renameSession = useCallback((id: string, name: string) => {
    setRenamingId(id);
    setSessions(current => current
      ? {
          ...current,
          sessions: current.sessions.map(session =>
            session.id === id ? { ...session, name } : session),
        }
      : current);
    void renamePanelPhoneSession(id, name)
      .finally(() => {
        setRenamingId(null);
        loadSessions(false);
      });
  }, [loadSessions]);

  const revokeAllSessions = useCallback(() => {
    setConfirmRemoveAllOpen(false);
    setSessions(current => current
      ? { ...current, authorizedCount: 0, sessions: [] }
      : current);
    void revokeAllPanelPhoneSessions()
      .finally(() => loadSessions(false));
  }, [loadSessions]);

  const applyRemoteEnabled = useCallback(async (next: boolean) => {
    // Optimistic flip: the toggle moves immediately, then snaps back if the
    // server rejects (401/403/network).
    if (togglingRemoteRef.current) return;
    togglingRemoteRef.current = true;
    setRemoteEnabled(next);
    try {
      const result = await setPanelRemoteControlEnabled(next);
      if (result) {
        // Server may snap to a different state under contention (another
        // dashboard already toggled). Trust the server's reading.
        if (result.enabled !== next) setRemoteEnabled(result.enabled);
        // KickAllPhoneAsync ran synchronously on the server when next=false,
        // so the connected count is already 0; pull it now.
        loadSessions(false);
      } else {
        // Request failed (no body / non-OK status). Revert the optimistic
        // flip so the toggle reflects the actual server state.
        setRemoteEnabled(!next);
      }
    } catch {
      setRemoteEnabled(!next);
    } finally {
      togglingRemoteRef.current = false;
    }
  }, [loadSessions, setRemoteEnabled]);

  const handleRemoteToggle = useCallback((next: boolean) => {
    if (!next) {
      setConfirmDisableOpen(true);
      return;
    }
    void applyRemoteEnabled(true);
  }, [applyRemoteEnabled]);

  const confirmDisableRemote = useCallback(() => {
    setConfirmDisableOpen(false);
    void applyRemoteEnabled(false);
  }, [applyRemoteEnabled]);

  // Cloud relay fallback toggle. Optimistic flip with revert-on-failure,
  // mirroring applyRemoteEnabled. The relay only matters with remote control
  // on, so the row is disabled when !effRemoteEnabled.
  const applyRelayEnabled = useCallback(async (next: boolean) => {
    if (togglingRelayRef.current) return;
    togglingRelayRef.current = true;
    setRelayEnabled(next);
    try {
      const result = await setPanelRelay(next);
      if (result) {
        if (result.enabled !== next) setRelayEnabled(result.enabled);
      } else {
        setRelayEnabled(!next);
      }
    } catch {
      setRelayEnabled(!next);
    } finally {
      togglingRelayRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(() => {
      if (effRemoteEnabled) refresh();
      loadSessions(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active, loadSessions, refresh, effRemoteEnabled]);

  useEffect(() => {
    if (active) return;
    const timer = window.setTimeout(() => {
      setConfirmRemoveAllOpen(false);
      setConfirmDisableOpen(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => loadSessions(false), 3000);
    return () => window.clearInterval(timer);
  }, [loadSessions, active]);

  useEffect(() => {
    if (!active || !qr || !effRemoteEnabled) return;
    const msUntilRefresh = Math.max(1000, qr.expiresAt - Date.now());
    const timer = window.setTimeout(refresh, msUntilRefresh);
    return () => window.clearTimeout(timer);
  }, [active, qr, refresh, effRemoteEnabled]);

  // Reset code state when the surface closes or remote is disabled, so a reopen
  // starts at the generate button and never inherits stale state.
  useEffect(() => {
    if (active && effRemoteEnabled) return;
    setPairCode(null);
    setPairCodeError(null);
    setPairMode('qr');
  }, [active, effRemoteEnabled]);

  const handleStartCode = useCallback(async () => {
    setPairCodeBusy(true);
    setPairCodeError(null);
    try {
      const next = await startPanelPhonePairCode();
      if (next) setPairCode(next);
      else setPairCodeError(t('phonePair.code.errorStart'));
    } finally {
      setPairCodeBusy(false);
    }
  }, [t]);

  // Auto-mint a code on landing on the Code tab (or reopening with Code
  // active), mirroring the QR flow.
  useEffect(() => {
    if (!active || !effRemoteEnabled || pairMode !== 'code') return;
    if (pairCode || pairCodeBusy) return;
    handleStartCode();
  }, [active, effRemoteEnabled, pairMode, pairCode, pairCodeBusy, handleStartCode]);

  // Auto-refresh on TTL expiry, identical to the QR refresh effect.
  // Server enforces TTL too; this keeps the UI showing a usable code
  // without requiring user input.
  useEffect(() => {
    if (!pairCode) return;
    const msUntilExpiry = Math.max(1000, pairCode.expiresAt - Date.now());
    const timer = window.setTimeout(() => {
      setPairCode(null);
      handleStartCode();
    }, msUntilExpiry);
    return () => window.clearTimeout(timer);
  }, [pairCode, handleStartCode]);

  // Re-mint the single-use QR + manual code whenever a NEW device pairs.
  // Detected off the existing sessions poll: when an authorized session id
  // appears that wasn't in the previous poll, the on-screen QR/code token was
  // just consumed, so refresh both to keep a fresh token ready for the next
  // device. Guarded so it only fires on a real increase (not first load,
  // not a revoke/decrease) and only while open with remote control enabled.
  // Additive to the TTL refresh above - neither replaces the other.
  useEffect(() => {
    if (!active || !effRemoteEnabled) {
      prevSessionIdsRef.current = null;
      return;
    }
    if (!sessions) return;
    const nextIds = new Set(sessions.sessions.map(s => s.id));
    const isNew = hasNewPairedSession(prevSessionIdsRef.current, nextIds);
    prevSessionIdsRef.current = nextIds;
    if (isNew) {
      refresh();
      setPairCode(null);
      void handleStartCode();
    }
  }, [active, effRemoteEnabled, sessions, refresh, handleStartCode]);

  // Re-mint immediately when the host IP changes (VPN/Wi-Fi↔wired/DHCP). Both
  // the QR and the Code tab's host:port embed the LAN address picked at mint
  // time, so refresh both rather than waiting out the TTL. The code only
  // re-mints when one is currently shown (it re-reads the new host).
  useTopicCallback('panel/phone/pair-qr/refresh', active && effRemoteEnabled, () => {
    refresh();
    if (pairCode) {
      setPairCode(null);
      void handleStartCode();
    }
  });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetchPanelPairBroadcast().then(next => {
      if (!cancelled && next) setBroadcast(next);
    });
    return () => { cancelled = true; };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    fetchPanelRelay().then(next => {
      if (!cancelled && next) setRelayEnabled(next.enabled);
    });
    return () => { cancelled = true; };
  }, [active]);

  // Reveal on the manual code box, keyed off the displayed code value. (The QR
  // box runs the equivalent effect internally inside PairingQrView.)
  useEffect(() => {
    if (!pairCode?.code) return;
    if (lastCodeRevealRef.current === pairCode.code) return;
    lastCodeRevealRef.current = pairCode.code;
    setCodeRevealKey(k => k + 1);
  }, [pairCode?.code]);

  // Forget the last-shown code token when the surface closes / remote disables
  // so a reopen replays the reveal on the freshly fetched token rather than
  // treating it as unchanged. (The QR box resets with PairingQrView, which
  // unmounts when the surface closes.)
  useEffect(() => {
    if (active && effRemoteEnabled) return;
    lastCodeRevealRef.current = null;
  }, [active, effRemoteEnabled]);

  const updateBroadcast = useCallback(async (mode: PairBroadcastState['mode']) => {
    const until = mode === 'until' ? Math.floor(Date.now() / 1000) + 600 : 0;
    const next = await setPanelPairBroadcast(mode, until);
    if (next) setBroadcast(next);
  }, []);

  if (!active) return null;

  const codeSecondsLeft = pairCode ? Math.max(0, Math.ceil((pairCode.expiresAt - now) / 1000)) : 0;
  const codeStatus = !pairCode || codeSecondsLeft <= 0
    ? t('phonePair.refreshing')
    : t('phonePair.refreshesIn', { seconds: codeSecondsLeft });
  const liveConnectedCount = sessions?.connectedCount ?? connectedCount ?? 0;
  const sessionNow = sessions?.now ?? now;
  const sessionList = sessions?.sessions ?? [];

  // Off-state count: prefer authorizedCount (the server's view) so we don't
  // render "0 devices paired" while sessions is still null on first open.
  const offPairedCount = sessions?.authorizedCount ?? sessionList.length;
  const sessionCountLabel = effRemoteEnabled
    ? formatConnectedDevices(liveConnectedCount, t)
    : sessions == null
      ? t('phonePair.loadingSessions')
      : t(
          offPairedCount === 1
            ? 'phonePair.killswitch.offSummaryOne'
            : 'phonePair.killswitch.offSummaryOther',
          { count: offPairedCount },
        );

  const pairTabs: TabDef[] = [
    { key: 'qr', label: t('phonePair.tab.qr') },
    { key: 'code', label: t('phonePair.tab.code') },
  ];

  // ── Region 1: pairing flow (QR or Code), tabbed ──────────────────────────
  const flowSection = (
    <section className={appStyles.phonePairCard + ' ' + appStyles.phonePairFlowCard} aria-label={t('phonePair.title')}>
      {!effRemoteEnabled ? (
        <PairingOffState label={t('phonePair.killswitch.qrDisabled')} />
      ) : (
        <>
          <Tabs
            tabs={pairTabs}
            activeKey={pairMode}
            onChange={(key) => setPairMode(key as 'qr' | 'code')}
            ariaLabel={t('phonePair.title')}
            className={appStyles.phonePairFlowTabs}
          />

          {pairMode === 'qr' ? (
            <>
              <div className={appStyles.phonePairHintSpacer} aria-hidden="true" />
              <PairingQrView
                qrDataUrl={qr?.qrDataUrl}
                expiresAt={qr?.expiresAt}
                loading={loading}
                now={now}
              />
            </>
          ) : (
            <>
              <div className={appStyles.phonePairHintSpacer} aria-hidden="true" />
              <div className={appStyles.phonePairCodeBox}>
                {pairCode ? (
                  <div className={appStyles.phonePairCodeRows}>
                    <span className={appStyles.phonePairCodeLocalOnly}>{t('phonePair.code.localOnly')}</span>
                    <div>
                      <span className={appStyles.phonePairCodeFieldLabel}>{t('phonePair.code.hostLabel')}</span>
                      <span className={appStyles.phonePairCodeHost}>{pairCode.host}:{pairCode.port}</span>
                    </div>
                    <div>
                      <span className={appStyles.phonePairCodeFieldLabel}>{t('phonePair.code.codeLabel')}</span>
                      <span className={appStyles.phonePairCodeDigits}>{pairCode.code}</span>
                    </div>
                  </div>
                ) : (
                  <div className={appStyles.phonePairLoading}>{t('phonePair.refreshing')}</div>
                )}
                {codeRevealKey > 0 && (
                  <span key={codeRevealKey} className={appStyles.phonePairReveal} aria-hidden="true" />
                )}
              </div>
              {pairCodeError && <p className={appStyles.phonePairCodeError}>{pairCodeError}</p>}
              <div className={classNames(appStyles.phonePairTimer, {
                [appStyles.phonePairTimerFlash]: codeSecondsLeft > 0 && codeSecondsLeft <= 5,
              })}>
                <span>{codeStatus}</span>
              </div>
            </>
          )}

          <p className={appStyles.phonePairFlowFooter}>{t('phonePair.securityNote')}</p>
        </>
      )}
    </section>
  );

  // ── Region 2: connection options ─────────────────────────────────────────
  const connectionSection = (
    <SettingsSection
      title={t('phonePair.connectionOptions')}
      ariaLabel={t('phonePair.connectionOptions')}
      boxClassName={appStyles.phonePairBox}
    >
      <SettingToggle
        label={t('phonePair.killswitch.label')}
        description={effRemoteEnabled
          ? t('phonePair.killswitch.onHint')
          : t('phonePair.killswitch.offHint')}
        checked={effRemoteEnabled}
        onChange={handleRemoteToggle}
      />
      <SettingToggle
        label={t('phonePair.relay.label')}
        description={t('phonePair.relay.hint')}
        icon={<SatelliteDish size={14} />}
        checked={effRemoteEnabled && relayEnabled}
        onChange={applyRelayEnabled}
        disabled={!effRemoteEnabled}
      />
      <PairBroadcastRow value={broadcast} onChange={updateBroadcast} now={now} />
    </SettingsSection>
  );

  // ── Region 3: authorized devices ─────────────────────────────────────────
  const sessionsSection = (
    <div className={appStyles.phonePairSessions} aria-label={t('phonePair.ariaSessions')} data-disabled={effRemoteEnabled ? 'false' : 'true'}>
      <div className={appStyles.phonePairSessionsHeader}>
        <div>
          <h3>{t('phonePair.authorizedDevices')}</h3>
          <span>{sessionCountLabel}</span>
        </div>
        <button
          type="button"
          className={appStyles.phonePairRevoke}
          disabled={sessionList.length === 0}
          onClick={() => setConfirmRemoveAllOpen(true)}
        >
          <LogOut size={14} />
          {t('phonePair.removeAll')}
        </button>
      </div>

      <section className={appStyles.phonePairCard + ' ' + appStyles.phonePairSessionsPanel}>
        {sessionsLoading && sessionList.length === 0 ? (
          <div className={appStyles.phonePairEmpty}>{t('phonePair.loadingSessions')}</div>
        ) : sessionList.length === 0 ? (
          <div className={appStyles.phonePairEmpty}>{t('phonePair.emptySessions')}</div>
        ) : (
          <div className={appStyles.phonePairSessionList}>
            {sessionList.map(session => {
              const fallbackName = t('phonePair.deviceFallback');
              const deviceType = session.deviceType || '';
              const persistedName = session.name || '';
              const hasCustomName = Boolean(persistedName && persistedName !== fallbackName && persistedName !== deviceType);
              const sessionName = hasCustomName ? persistedName : deviceType || persistedName || fallbackName;
              const showDeviceType = Boolean(session.deviceType && session.deviceType !== sessionName);
              // The panel sheet card is narrow; show only last-seen there.
              // Paired-at + remote IP stay on the roomier desktop modal.
              const compactMeta = layout === 'stacked';
              const metaContent = (
                <>
                  {showDeviceType && <span>{deviceType}</span>}
                  <span>{t('phonePair.lastSeen', { time: formatRelativeTime(session.lastSeenAt, sessionNow, t) })}</span>
                  {!compactMeta && (
                    <span>{t('phonePair.pairedAt', { time: formatDateTime(session.createdAt, t, timeFormat) })}</span>
                  )}
                  {!compactMeta && session.remoteAddress && <span>{session.remoteAddress}</span>}
                </>
              );
              return (
                <div key={session.id} className={appStyles.phonePairSessionRow}>
                  <span className={appStyles.phonePairSessionIcon}>
                    <Smartphone size={15} />
                  </span>
                  <div className={appStyles.phonePairSessionMain}>
                    <div className={appStyles.phonePairSessionTitleRow}>
                      <EditableText
                        value={sessionName}
                        onCommit={name => renameSession(session.id, name)}
                        maxLength={40}
                        className={appStyles.phonePairSessionName}
                        ariaLabel={t('phonePair.editDeviceName')}
                      />
                      <span
                        className={classNames(appStyles.phonePairSessionBadge, {
                          [appStyles.phonePairSessionBadgeActive]: effRemoteEnabled && session.recentlyActive,
                          [appStyles.phonePairSessionBadgeDisabled]: !effRemoteEnabled,
                        })}
                      >
                        {!effRemoteEnabled
                          ? t('phonePair.killswitch.statusDisabled')
                          : session.recentlyActive
                            ? t('phonePair.statusRecentlyActive')
                            : t('phonePair.statusPaired')}
                      </span>
                      {session.connectedVia === 'relay' && (
                        <HoverTooltip body={t('connection.relayMode')} side="top">
                          <span
                            className={appStyles.phonePairSessionRelay}
                            aria-label={t('connection.relayMode')}
                          >
                            <SatelliteDish size={14} aria-hidden="true" />
                          </span>
                        </HoverTooltip>
                      )}
                      {session.connectedVia === 'direct' && (
                        <HoverTooltip body={t('connection.directMode')} side="top">
                          <span
                            className={appStyles.phonePairSessionRelay}
                            aria-label={t('connection.directMode')}
                          >
                            <Zap size={14} aria-hidden="true" />
                          </span>
                        </HoverTooltip>
                      )}
                      {renamingId === session.id && (
                        <span className={appStyles.phonePairSessionSaving}>{t('phonePair.saving')}</span>
                      )}
                    </div>
                    {session.userAgent ? (
                      <HoverTooltip body={session.userAgent} side="bottom">
                        <div className={appStyles.phonePairSessionMeta}>{metaContent}</div>
                      </HoverTooltip>
                    ) : (
                      <div className={appStyles.phonePairSessionMeta}>{metaContent}</div>
                    )}
                  </div>
                  <HoverTooltip body={t('phonePair.removeSession', { name: sessionName })} side="left">
                    <button
                      type="button"
                      className={classNames(appStyles.phonePairRevoke, appStyles.phonePairSessionRevoke)}
                      disabled={revokingId === session.id}
                      onClick={() => revokeSession(session.id)}
                      aria-label={t('phonePair.removeSession', { name: sessionName })}
                    >
                      <LogOut size={14} />
                    </button>
                  </HoverTooltip>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );

  const e2eNote = (
    <div className={appStyles.phonePairE2e}>
      {/* eslint-disable-next-line i18next/no-literal-string -- aria attribute value */}
      <Lock size={15} aria-hidden="true" />
      <span>{t('phonePair.e2eNote')}</span>
    </div>
  );

  const confirmModals = (
    <>
      <ConfirmModal
        open={confirmRemoveAllOpen}
        title={t('phonePair.confirmRemoveAllTitle')}
        message={t('phonePair.confirmRemoveAllMessage')}
        note={t('phonePair.confirmRemoveAllNote')}
        confirmLabel={t('phonePair.removeAll')}
        onConfirm={revokeAllSessions}
        onCancel={() => setConfirmRemoveAllOpen(false)}
      />
      <ConfirmModal
        open={confirmDisableOpen}
        title={t('phonePair.killswitch.confirmTitle')}
        message={t('phonePair.killswitch.confirmMessage')}
        note={t('phonePair.killswitch.confirmNote')}
        confirmLabel={t('phonePair.killswitch.confirmAction')}
        onConfirm={confirmDisableRemote}
        onCancel={() => setConfirmDisableOpen(false)}
      />
    </>
  );

  if (layout === 'stacked') {
    return (
      <>
        <div className={local.stacked} data-remote-enabled={effRemoteEnabled ? 'true' : 'false'}>
          {flowSection}
          {connectionSection}
          {sessionsSection}
          {e2eNote}
        </div>
        {confirmModals}
      </>
    );
  }

  return (
    <>
      <div className={appStyles.phonePairLayout} data-remote-enabled={effRemoteEnabled ? 'true' : 'false'}>
        {/* Left column: connection options + authorized device list */}
        <div className={appStyles.phonePairCol}>
          {connectionSection}
          {sessionsSection}
        </div>
        {/* Right column: pairing flow (QR or Code) */}
        <div className={appStyles.phonePairCol}>
          {flowSection}
        </div>
      </div>
      {e2eNote}
      {confirmModals}
    </>
  );
}

/**
 * AirDrop-style discoverability selector for the Wi-Fi (mDNS) pair flow,
 * rendered as a standard SettingRow inside the connection-options box. QR +
 * manual pair-code flows are unaffected - this only gates whether the iOS
 * companion app can see this host in its "find on Wi-Fi" list.
 */
function PairBroadcastRow({
  value,
  onChange,
  now,
}: {
  value: PairBroadcastState;
  onChange: (mode: PairBroadcastState['mode']) => void;
  now: number;
}) {
  const { t } = useTranslation();
  const expiresIn = value.mode === 'until'
    ? Math.max(0, value.untilUnixSeconds * 1000 - now)
    : 0;
  const hint = value.mode === 'never'
    ? t('phonePair.broadcast.hintNever')
    : value.mode === 'always'
      ? t('phonePair.broadcast.hintAlways')
      : t('phonePair.broadcast.hintUntil', { seconds: Math.ceil(expiresIn / 1000) });

  return (
    <SettingRow label={t('phonePair.broadcast.label')} description={hint}>
      <Select
        value={value.mode}
        onChange={(next) => onChange(next as PairBroadcastState['mode'])}
        ariaLabel={t('phonePair.broadcast.label')}
        options={[
          // eslint-disable-next-line i18next/no-literal-string -- broadcast mode enum
          { value: 'never', label: t('phonePair.broadcast.optNever') },
          // eslint-disable-next-line i18next/no-literal-string -- broadcast mode enum
          { value: 'always', label: t('phonePair.broadcast.optAlways') },
          // eslint-disable-next-line i18next/no-literal-string -- broadcast mode enum
          { value: 'until', label: t('phonePair.broadcast.optTen') },
        ]}
      />
    </SettingRow>
  );
}
