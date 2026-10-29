import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, CircleX, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge } from '../Badge/Badge';
import { Button } from '../Button/Button';
import { OnboardingFooter } from '../OnboardingFooter/OnboardingFooter';
import { Card } from '../Card/Card';
import { Checkbox } from '../Checkbox/Checkbox';
import { ChipGroup } from '../ChipGroup/ChipGroup';
import { ConflictAllClear } from '../ConflictAllClear/ConflictAllClear';
import { ExperimentalEnableModal } from '../ExperimentalEnableModal/ExperimentalEnableModal';
import { useTranslation } from '../../../lib/i18n';
import { useConflictAutostart } from '../../../hooks/useConflictAutostart';
import { useConflictDevices } from '../../../hooks/useConflictDevices';
import { useConflictRoster } from '../../../hooks/useConflictRoster';
import {
  HYTE_NEXUS2_CONFLICT_ID,
  killConflict,
  setConflictWhitelisted,
  type DetectedConflict,
} from '../../../api/conflicts';
import { uninstallNexus2 } from '../../../api/migration';
import {
  cardState,
  handsOverExperimental,
  keepAllIds,
  ownerPatch,
  planApp,
  toggleCardPatch,
  type CardChoice,
  type OwnerChoice,
} from './conflictOutcome';
import styles from './ConflictOutcomePanel.module.scss';

const WARN_ICON_SIZE = 13;
const OUTCOME_ICON_SIZE = 20;
const NEXUS2_NAME = 'HYTE Nexus 2';

export type ConflictOutcomeAction = 'apply' | 'keepAll';

interface ConflictOutcomePanelProps {
  conflicts: readonly DetectedConflict[];
  /** False while the detected-app snapshot is unresolved; the roster then holds its rows rather than reading the gap as apps exiting. */
  ready: boolean;
  /** The surface is open: hooks only read the service while true. */
  active: boolean;
  /** Apps on `Ui.ConflictAutoKillExclusions`, with Nexus 2 already filtered out. */
  whitelisted: ReadonlySet<string>;
  /** Onboarding only: Nexus 2 is installed, so it gets its own uninstall card. */
  nexus2Installed?: boolean;
  /** Primary label style: onboarding continues to the next step, the modal just closes. */
  variant: 'onboarding' | 'modal';
  /** The screen's own title and subtitle, rendered above the list. */
  heading: ReactNode;
  /** Fired once per button press before anything is applied; the onboarding screen logs the choice. */
  onAction?: (action: ConflictOutcomeAction, info: { listed: string[]; alreadyEnded: string[] }) => void;
  /** Fired after the action was applied (best effort); the screen continues or closes. */
  onDone: (action: ConflictOutcomeAction) => void;
  onBusyChange?: (busy: boolean) => void;
}

/**
 * The shared body of the conflict surfaces: one card per detected app, whose
 * click toggles terminate against keep running, plus the footer. Nothing is
 * applied until a footer button is pressed.
 */
export function ConflictOutcomePanel({
  conflicts, ready, active, whitelisted, nexus2Installed, variant, heading, onAction, onDone, onBusyChange,
}: ConflictOutcomePanelProps) {
  const { t } = useTranslation();
  const { entries, conflicts: roster, markTerminated } = useConflictRoster(conflicts, active, ready);
  const { devicesByApp, setOwner } = useConflictDevices(roster, active);
  const { autostartByApp, disable: disableAutostart } = useConflictAutostart(roster, active);
  const [choices, setChoices] = useState<Readonly<Record<string, CardChoice>>>({});
  const [nexus2Uninstall, setNexus2Uninstall] = useState(true);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // Either a switch click awaiting confirmation, or the whole plan awaiting it.
  const [confirming, setConfirming] = useState<{ id: string; patch: CardChoice } | 'plan' | null>(null);
  const [confirmedIds, setConfirmedIds] = useState<ReadonlySet<string>>(() => new Set());

  const patchChoice = useCallback((id: string, patch: CardChoice) => {
    setChoices(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
    if (patch.owner === 'app') setConfirmedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  }, []);

  // With Nexus 2 installed its card handles the running app too; otherwise it is an ordinary row.
  const nexus2Entry = nexus2Installed ? entries.find(e => e.conflict.id === HYTE_NEXUS2_CONFLICT_ID) : undefined;
  const appEntries = useMemo(
    () => entries.filter(e => !(nexus2Installed && e.conflict.id === HYTE_NEXUS2_CONFLICT_ID)),
    [entries, nexus2Installed],
  );

  // The service always ends Nexus 2, so outside its uninstall card its row is not a choice.
  const isFixed = (id: string) => id === HYTE_NEXUS2_CONFLICT_ID;

  const states = useMemo(() => new Map(appEntries.map(e => {
    const id = e.conflict.id;
    const state = cardState(choices[id], devicesByApp.get(id) ?? [], whitelisted.has(id));
    return [id, id === HYTE_NEXUS2_CONFLICT_ID ? { ...state, end: true } : state];
  })), [appEntries, choices, devicesByApp, whitelisted]);

  const terminateCount = appEntries.filter(e => states.get(e.conflict.id)?.end && !e.terminated).length;

  // A switch click on experimental hardware asks at once; card clicks defer to the primary button.
  const requestOwner = useCallback((id: string, patch: CardChoice) => {
    const devices = devicesByApp.get(id) ?? [];
    const needsConfirm = patch.owner === 'nexus' && states.get(id)?.owner !== 'nexus'
      && devices.some(d => d.experimental && d.owner !== 'nexus');
    if (needsConfirm) setConfirming({ id, patch });
    else patchChoice(id, patch);
  }, [devicesByApp, states, patchChoice]);

  const setBusyState = useCallback((value: boolean) => {
    busyRef.current = value;
    setBusy(value);
    onBusyChange?.(value);
  }, [onBusyChange]);

  const plans = useMemo(() => appEntries.map(entry => {
    const id = entry.conflict.id;
    return planApp({
      id,
      choice: choices[id],
      state: states.get(id)!,
      devices: devicesByApp.get(id) ?? [],
      whitelisted: whitelisted.has(id),
      autostartCount: autostartByApp.get(id)?.length ?? 0,
      terminated: entry.terminated,
      neverWhitelist: id === HYTE_NEXUS2_CONFLICT_ID,
    });
  }), [appEntries, choices, states, devicesByApp, whitelisted, autostartByApp]);

  const run = useCallback(async (action: ConflictOutcomeAction, confirmed = false) => {
    if (busyRef.current) return;
    if (action === 'apply' && !confirmed
      && plans.some(p => !confirmedIds.has(p.id) && handsOverExperimental(p, devicesByApp.get(p.id) ?? []))) {
      setConfirming('plan');
      return;
    }
    setBusyState(true);
    onAction?.(action, {
      listed: entries.map(e => e.conflict.id),
      alreadyEnded: entries.filter(e => e.terminated).map(e => e.conflict.id),
    });
    try {
      if (action === 'keepAll') {
        const ids = keepAllIds(entries.map(e => e.conflict.id), whitelisted, HYTE_NEXUS2_CONFLICT_ID);
        await Promise.all(ids.map(id => setConflictWhitelisted(id, true).catch(() => null)));
      } else {
        await Promise.all(plans.map(async plan => {
          const id = plan.id;
          if (plan.setOwner) await setOwner(id, plan.setOwner).catch(() => false);
          if (plan.whitelist !== undefined) await setConflictWhitelisted(id, plan.whitelist).catch(() => null);
          if (plan.kill) {
            const res = await killConflict(id).catch(() => null);
            if (res?.killed) markTerminated(id);
          }
          if (plan.disableAutostart) await disableAutostart(id).catch(() => false);
        }));
        if (nexus2Installed && nexus2Uninstall) {
          if (nexus2Entry && !nexus2Entry.terminated) await killConflict(HYTE_NEXUS2_CONFLICT_ID).catch(() => null);
          await uninstallNexus2().catch(() => null);
        }
      }
    } finally {
      setBusyState(false);
    }
    onDone(action);
  }, [
    setBusyState, onAction, onDone, entries, whitelisted, plans, confirmedIds, devicesByApp,
    setOwner, markTerminated, disableAutostart, nexus2Installed, nexus2Uninstall, nexus2Entry,
  ]);

  const primaryLabel = terminateCount === 0
    ? t(variant === 'onboarding' ? 'conflicts.outcome.continue' : 'conflicts.outcome.save')
    : variant === 'onboarding'
      ? (terminateCount === 1 ? t('conflicts.outcome.terminateContinueOne') : t('conflicts.outcome.terminateContinue', { count: terminateCount }))
      : (terminateCount === 1 ? t('conflicts.outcome.terminateOne') : t('conflicts.outcome.terminate', { count: terminateCount }));

  const showList = appEntries.length > 0 || nexus2Installed === true;

  return (
    <div className={styles.root}>
      <div className={styles.heading}>{heading}</div>

      {/* Nothing until the snapshot resolves: an empty pre-load list is not an all-clear. */}
      {!ready ? null : !showList ? (
        <ConflictAllClear />
      ) : (
        <div className={styles.scroll}>
          <ul className={styles.list}>
            {appEntries.map(entry => {
              const id = entry.conflict.id;
              const state = states.get(id)!;
              const devices = devicesByApp.get(id) ?? [];
              const autostartCount = autostartByApp.get(id)?.length ?? 0;
              return (
                <li key={id}>
                  <Card
                    compact
                    selected={state.end}
                    pressed={isFixed(id) ? undefined : state.end}
                    onClick={busy || isFixed(id) ? undefined : () => patchChoice(id, toggleCardPatch(state, devices.length > 0))}
                  >
                    <div className={styles.cardRow}>
                      <div className={styles.info}>
                        <div className={styles.name}>{entry.conflict.displayName}</div>
                        <div className={styles.meta}>
                          {entry.conflict.isSetting ? (
                            <Badge label={t('conflicts.modal.windowsSetting')} />
                          ) : (
                            <>
                              <Badge label={entry.conflict.processName} />
                              <Badge label={t('conflicts.modal.pid', { pid: entry.conflict.pid })} />
                            </>
                          )}
                          {autostartCount > 0 && <Badge label={t('conflicts.outcome.startsWithWindows')} />}
                        </div>
                        {devices.length > 0 && (
                          <div className={styles.devices} onClick={e => e.stopPropagation()}>
                            <div className={styles.devicesLabel}>
                              {t('conflicts.outcome.competesFor', { devices: devices.map(d => d.name).join(', ') })}
                            </div>
                            <ChipGroup
                              fullWidth
                              ariaLabel={t('conflicts.devices.switchLabel')}
                              activeKey={state.owner ?? 'nexus'}
                              onChange={key => requestOwner(id, ownerPatch(key as OwnerChoice))}
                              options={[
                                { key: 'nexus', label: t('conflicts.devices.nexusControls'), disabled: busy },
                                { key: 'app', label: t('conflicts.devices.appControls', { app: entry.conflict.displayName }), disabled: busy },
                              ]}
                            />
                            {state.bothDrive && (
                              <div className={styles.warn} role="status">
                                <CircleAlert size={WARN_ICON_SIZE} aria-hidden />
                                {t('conflicts.outcome.bothDrive')}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div className={styles.outcome}>
                        {state.end
                          ? <CircleX size={OUTCOME_ICON_SIZE} className={styles.outcomeIcon} aria-hidden />
                          : <CircleCheck size={OUTCOME_ICON_SIZE} className={`${styles.outcomeIcon} ${styles.outcomeDim}`} aria-hidden />}
                        <div className={styles.outcomeText}>
                          <span className={`${styles.outcomeLabel} ${state.end ? '' : styles.outcomeDim}`}>
                            {state.end
                              ? t(entry.conflict.isSetting ? 'conflicts.outcome.willTurnOff' : 'conflicts.outcome.willTerminate')
                              : t(entry.conflict.isSetting ? 'conflicts.outcome.keepsOn' : 'conflicts.outcome.keepsRunning')}
                          </span>
                          {state.end && autostartCount > 0 && (
                            <div onClick={e => e.stopPropagation()}>
                              <Checkbox
                                checked={state.unstart}
                                disabled={busy}
                                onChange={value => patchChoice(id, { unstart: value })}
                                label={t('conflicts.outcome.removeFromStartup')}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </li>
              );
            })}
            {nexus2Installed && (
              <li>
                <Card compact selected={nexus2Uninstall} pressed={nexus2Uninstall} onClick={busy ? undefined : () => setNexus2Uninstall(v => !v)}>
                  <div className={styles.cardRow}>
                    <div className={styles.info}>
                      <div className={styles.name}>{NEXUS2_NAME}</div>
                      <div className={styles.meta}><Badge label={t('conflicts.outcome.olderVersion')} /></div>
                    </div>
                    <div className={styles.outcome}>
                      {nexus2Uninstall
                        ? <Trash2 size={OUTCOME_ICON_SIZE} className={styles.outcomeIcon} aria-hidden />
                        : <CircleCheck size={OUTCOME_ICON_SIZE} className={`${styles.outcomeIcon} ${styles.outcomeDim}`} aria-hidden />}
                      <div className={styles.outcomeText}>
                        <span className={`${styles.outcomeLabel} ${nexus2Uninstall ? '' : styles.outcomeDim}`}>
                          {t(nexus2Uninstall ? 'conflicts.outcome.willUninstall' : 'conflicts.outcome.staysInstalled')}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              </li>
            )}
          </ul>
        </div>
      )}

      {ready && showList && (variant === 'onboarding' ? (
        <OnboardingFooter
          secondary={{ label: t('conflicts.outcome.keepAll'), onClick: () => { void run('keepAll'); }, disabled: busy }}
          icon={<ShieldCheck />}
          loading={busy}
          label={primaryLabel}
          onContinue={() => { void run('apply'); }}
        />
      ) : (
        <div className={styles.footer}>
          <Button tone="ghost" size="lg" disabled={busy} onClick={() => { void run('keepAll'); }}>
            {t('conflicts.outcome.keepAll')}
          </Button>
          <Button
            tone="accent"
            size="lg"
            icon={<ShieldCheck />}
            loading={busy}
            loadingHidesLabel
            onClick={() => { void run('apply'); }}
            className={styles.primary}
          >
            {primaryLabel}
          </Button>
        </div>
      ))}

      <ExperimentalEnableModal
        open={confirming !== null}
        onConfirm={() => {
          const pending = confirming;
          setConfirming(null);
          if (pending === 'plan') void run('apply', true);
          else if (pending) {
            patchChoice(pending.id, pending.patch);
            setConfirmedIds(prev => new Set(prev).add(pending.id));
          }
        }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
