import type { ConflictDevice } from '../../../hooks/useConflictDevices';

export type OwnerChoice = 'nexus' | 'app';

/** What the user changed on one card this session; anything left undefined falls back to the live default. */
export interface CardChoice {
  end?: boolean;
  owner?: OwnerChoice;
  /** The user clicked the device switch: card clicks stop moving it. */
  ownerPinned?: boolean;
  unstart?: boolean;
}

export interface CardState {
  end: boolean;
  owner?: OwnerChoice;
  ownerPinned: boolean;
  unstart: boolean;
  /** Kept running while Nexus also drives its devices. */
  bothDrive: boolean;
}

/** The owner every listed device agrees on; undefined with no devices or while they disagree. */
export function agreedOwner(devices: readonly ConflictDevice[]): OwnerChoice | undefined {
  if (devices.length === 0) return undefined;
  if (devices.every(d => d.owner === 'nexus')) return 'nexus';
  if (devices.every(d => d.owner === 'app')) return 'app';
  return undefined;
}

/** An app is left running by default when it is on the allowed list or already drives its own devices. */
export function cardState(choice: CardChoice | undefined, devices: readonly ConflictDevice[], whitelisted: boolean): CardState {
  const agreed = agreedOwner(devices);
  const hasDevices = devices.length > 0;
  const owner = hasDevices ? (choice?.owner ?? agreed ?? 'nexus') : undefined;
  const end = choice?.end ?? !(whitelisted || agreed === 'app');
  return {
    end,
    owner,
    ownerPinned: choice?.ownerPinned === true,
    unstart: choice?.unstart ?? true,
    bothDrive: hasDevices && owner === 'nexus' && !end,
  };
}

/** A card click flips the outcome; terminating always claims the devices, keeping drags the switch to the app until it is pinned. */
export function toggleCardPatch(state: CardState, hasDevices: boolean): CardChoice {
  const end = !state.end;
  if (!hasDevices) return { end };
  if (end) return { end, owner: 'nexus' };
  return state.ownerPinned ? { end } : { end, owner: 'app' };
}

/** A manual switch click sets the owner, mirrors it onto the card, and pins the switch. */
export function ownerPatch(owner: OwnerChoice): CardChoice {
  return { owner, end: owner === 'nexus', ownerPinned: true };
}

export interface AppPlan {
  id: string;
  /** Hand the devices to this owner; the device switch call also writes the allowed list. */
  setOwner?: OwnerChoice;
  /** Final allowed-list state to write after the ownership step. */
  whitelist?: boolean;
  kill: boolean;
  disableAutostart: boolean;
}

export interface PlanInput {
  id: string;
  choice: CardChoice | undefined;
  state: CardState;
  devices: readonly ConflictDevice[];
  whitelisted: boolean;
  autostartCount: number;
  terminated: boolean;
  /** HYTE Nexus 2 is ended by the service whatever the list says, so it is never allowed-listed. */
  neverWhitelist: boolean;
}

export function planApp(input: PlanInput): AppPlan {
  const { id, choice, state, devices, whitelisted, autostartCount, terminated, neverWhitelist } = input;
  const plan: AppPlan = {
    id,
    kill: state.end && !terminated,
    disableAutostart: state.end && state.unstart && autostartCount > 0,
  };
  if (neverWhitelist) return plan;
  // A terminated app hands every device back to Nexus whatever the switch says, so none stays dark.
  const owner = state.end && devices.length > 0 ? 'nexus' : choice?.owner;
  const ownerStep = owner !== undefined && devices.length > 0 && owner !== agreedOwner(devices);
  if (ownerStep) plan.setOwner = owner;
  const listedAfterOwner = ownerStep ? owner === 'app' : whitelisted;
  if (!state.end !== listedAfterOwner) plan.whitelist = !state.end;
  return plan;
}

/** Keep all running: every listed app not already allowed, never Nexus 2. */
export function keepAllIds(ids: readonly string[], whitelisted: ReadonlySet<string>, neverWhitelistId: string): string[] {
  return ids.filter(id => id !== neverWhitelistId && !whitelisted.has(id));
}

/** The plan hands hardware flagged experimental to Nexus that Nexus does not drive yet. */
export function handsOverExperimental(plan: AppPlan, devices: readonly ConflictDevice[]): boolean {
  return plan.setOwner === 'nexus' && devices.some(d => d.experimental === true && d.owner !== 'nexus');
}

/** Whether a conflict list holds only apps, a mix, or only OS settings (Windows Dynamic Lighting); picks the copy that says "apps". */
export function settingMix(conflicts: readonly { isSetting?: boolean }[]): 'apps' | 'mixed' | 'setting' {
  const settings = conflicts.filter(c => c.isSetting).length;
  if (settings === 0) return 'apps';
  return settings === conflicts.length ? 'setting' : 'mixed';
}
