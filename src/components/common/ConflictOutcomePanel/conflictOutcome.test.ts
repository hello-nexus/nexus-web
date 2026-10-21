import { describe, expect, it } from 'vitest';
import type { ConflictDevice } from '../../../hooks/useConflictDevices';
import { agreedOwner, cardState, handsOverExperimental, keepAllIds, ownerPatch, planApp, toggleCardPatch } from './conflictOutcome';

const dev = (owner: ConflictDevice['owner']): ConflictDevice => ({ key: `k-${owner}`, name: 'Device', owner });

describe('cardState', () => {
  it('terminates by default, keeps an allowed app, and keeps an app that owns its devices', () => {
    expect(cardState(undefined, [], false).end).toBe(true);
    expect(cardState(undefined, [], true).end).toBe(false);
    expect(cardState(undefined, [dev('app')], false)).toMatchObject({ end: false, owner: 'app' });
    expect(cardState(undefined, [dev('nexus')], false)).toMatchObject({ end: true, owner: 'nexus' });
  });

  it('lets a user choice override the default', () => {
    expect(cardState({ end: false }, [], false).end).toBe(false);
    expect(cardState({ end: true }, [dev('app')], true).end).toBe(true);
  });

  it('flags both apps driving only when kept running while Nexus owns the devices', () => {
    expect(cardState({ end: false, owner: 'nexus' }, [dev('nexus')], false).bothDrive).toBe(true);
    expect(cardState({ end: true, owner: 'nexus' }, [dev('nexus')], false).bothDrive).toBe(false);
    expect(cardState({ end: false }, [], false).bothDrive).toBe(false);
  });

  it('removes from startup by default', () => {
    expect(cardState(undefined, [], false).unstart).toBe(true);
    expect(cardState({ unstart: false }, [], false).unstart).toBe(false);
  });
});

describe('agreedOwner', () => {
  it('is undefined without devices or when they disagree', () => {
    expect(agreedOwner([])).toBeUndefined();
    expect(agreedOwner([dev('app'), dev('nexus')])).toBeUndefined();
    expect(agreedOwner([dev('mixed')])).toBeUndefined();
    expect(agreedOwner([dev('app'), dev('app')])).toBe('app');
  });
});

describe('card and switch coupling', () => {
  it('a card click drags the switch both ways until it is pinned', () => {
    const terminating = cardState(undefined, [dev('nexus')], false);
    expect(toggleCardPatch(terminating, true)).toEqual({ end: false, owner: 'app' });
    const keeping = cardState({ end: false, owner: 'app' }, [dev('app')], false);
    expect(toggleCardPatch(keeping, true)).toEqual({ end: true, owner: 'nexus' });
  });

  it('a pinned switch no longer moves with the card', () => {
    const pinned = cardState({ ...ownerPatch('nexus') }, [dev('app')], false);
    expect(pinned.ownerPinned).toBe(true);
    expect(toggleCardPatch(pinned, true)).toEqual({ end: false });
    const pinnedKeeping = cardState({ owner: 'app', end: false, ownerPinned: true }, [dev('app')], false);
    expect(toggleCardPatch(pinnedKeeping, true)).toEqual({ end: true, owner: 'nexus' });
  });

  it('an app without devices only flips the outcome', () => {
    expect(toggleCardPatch(cardState(undefined, [], false), false)).toEqual({ end: false });
  });

  it('a manual switch click sets the card and pins', () => {
    expect(ownerPatch('nexus')).toEqual({ owner: 'nexus', end: true, ownerPinned: true });
    expect(ownerPatch('app')).toEqual({ owner: 'app', end: false, ownerPinned: true });
  });
});

describe('planApp', () => {
  const base = { id: 'icue', devices: [] as ConflictDevice[], whitelisted: false, autostartCount: 0, terminated: false, neverWhitelist: false };
  const plan = (choice: Parameters<typeof cardState>[0], over: Partial<typeof base> = {}) => {
    const input = { ...base, ...over };
    return planApp({ ...input, choice, state: cardState(choice, input.devices, input.whitelisted) });
  };

  it('kills a terminating app and writes nothing else when it was not allowed', () => {
    expect(plan(undefined)).toEqual({ id: 'icue', kill: true, disableAutostart: false });
  });

  it('allows a kept app, and removes a terminated app from the list', () => {
    expect(plan({ end: false })).toMatchObject({ kill: false, whitelist: true });
    expect(plan({ end: true }, { whitelisted: true })).toMatchObject({ kill: true, whitelist: false });
    expect(plan(undefined, { whitelisted: true }).whitelist).toBeUndefined();
  });

  it('disables boot entries only for a terminating app with the box ticked', () => {
    expect(plan(undefined, { autostartCount: 1 }).disableAutostart).toBe(true);
    expect(plan({ unstart: false }, { autostartCount: 1 }).disableAutostart).toBe(false);
    expect(plan({ end: false }, { autostartCount: 1 }).disableAutostart).toBe(false);
  });

  it('does not kill an app that already exited', () => {
    expect(plan(undefined, { terminated: true }).kill).toBe(false);
  });

  it('hands devices over only when the chosen owner differs from what they have', () => {
    const nexusOwned = [dev('nexus')];
    expect(plan(undefined, { devices: nexusOwned }).setOwner).toBeUndefined();
    expect(plan({ owner: 'app', end: false }, { devices: nexusOwned })).toMatchObject({ setOwner: 'app' });
    expect(plan({ owner: 'nexus', end: true }, { devices: [dev('app')] })).toMatchObject({ setOwner: 'nexus', kill: true });
  });

  it('hands every device to Nexus when a terminating app has mixed or app-owned devices, untouched or not', () => {
    expect(plan(undefined, { devices: [dev('app'), dev('nexus')] })).toMatchObject({ setOwner: 'nexus', kill: true });
    expect(plan(undefined, { devices: [dev('mixed')] })).toMatchObject({ setOwner: 'nexus', kill: true });
    expect(plan({ end: true, owner: 'app', ownerPinned: true }, { devices: [dev('app')] })).toMatchObject({ setOwner: 'nexus', kill: true });
    expect(plan({ end: true }, { devices: [dev('app')], whitelisted: true })).toMatchObject({ setOwner: 'nexus' });
  });

  it('writes the allowed list after an ownership step that already set it, only when they disagree', () => {
    // Owner app whitelists through the switch and the card keeps running: no extra write.
    expect(plan({ owner: 'app', end: false }, { devices: [dev('nexus')] }).whitelist).toBeUndefined();
    // Pinned Nexus ownership while kept running: the switch cleared the list, so the keep needs a write.
    expect(plan({ owner: 'nexus', end: false, ownerPinned: true }, { devices: [dev('app')] })).toMatchObject({ setOwner: 'nexus', whitelist: true });
  });

  it('never touches ownership or the allowed list for Nexus 2', () => {
    expect(plan({ end: false, owner: 'app' }, { id: 'hyte-nexus-2', devices: [dev('nexus')], neverWhitelist: true }))
      .toEqual({ id: 'hyte-nexus-2', kill: false, disableAutostart: false });
  });
});

describe('keepAllIds', () => {
  it('skips apps already allowed and Nexus 2', () => {
    expect(keepAllIds(['a', 'b', 'hyte-nexus-2'], new Set(['a']), 'hyte-nexus-2')).toEqual(['b']);
  });
});

describe('handsOverExperimental', () => {
  const exp = (owner: ConflictDevice['owner']): ConflictDevice => ({ key: 'e', name: 'Hub', owner, experimental: true });
  it('flags a handover of experimental hardware Nexus does not drive yet', () => {
    expect(handsOverExperimental({ id: 'a', kill: true, disableAutostart: false, setOwner: 'nexus' }, [exp('app')])).toBe(true);
    expect(handsOverExperimental({ id: 'a', kill: true, disableAutostart: false, setOwner: 'nexus' }, [exp('mixed')])).toBe(true);
    expect(handsOverExperimental({ id: 'a', kill: true, disableAutostart: false, setOwner: 'nexus' }, [exp('nexus')])).toBe(false);
    expect(handsOverExperimental({ id: 'a', kill: true, disableAutostart: false, setOwner: 'nexus' }, [dev('app')])).toBe(false);
    expect(handsOverExperimental({ id: 'a', kill: false, disableAutostart: false, setOwner: 'app' }, [exp('nexus')])).toBe(false);
  });
});
