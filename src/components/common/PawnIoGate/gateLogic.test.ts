import { describe, expect, it } from 'vitest';
import type { PawnIoState, PawnIoStatus } from '../../../api/pawnio';
import {
  PAWNIO_PREVIEW_IDS, fixOutcome, gateShows, previewFor, previewHref, screenFor,
} from './gateLogic';

function status(state: PawnIoState): PawnIoStatus {
  return { installed: true, open: state === 'ok', state, errorCode: null, fixAction: 'none', fixing: false };
}

describe('gateShows', () => {
  it('stays hidden with no status, so an unreadable service never gates', () => {
    expect(gateShows(null)).toBe(false);
  });

  it('stays hidden for ok', () => {
    expect(gateShows(status('ok'))).toBe(false);
  });

  it.each(['notInstalled', 'installFailed', 'restartRequired', 'notRunning', 'blocked', 'permissionDeclined'] as const)(
    'shows for %s',
    state => expect(gateShows(status(state))).toBe(true),
  );
});

describe('screenFor', () => {
  it('maps each not-ok state to its screen', () => {
    expect(screenFor('notInstalled')).toBe('install');
    expect(screenFor('installFailed')).toBe('install');
    expect(screenFor('permissionDeclined')).toBe('install');
    expect(screenFor('restartRequired')).toBe('restart');
    expect(screenFor('notRunning')).toBe('notRunning');
    expect(screenFor('blocked')).toBe('blocked');
  });
});

describe('fixOutcome', () => {
  it('reads a failed request as a failed fix', () => {
    expect(fixOutcome('notRunning', null)).toEqual({ kind: 'failed' });
  });

  it('reads ok as done', () => {
    expect(fixOutcome('notInstalled', status('ok'))).toEqual({ kind: 'done' });
  });

  it('repeats of the same state mean the fix did not take', () => {
    expect(fixOutcome('notRunning', status('notRunning'))).toEqual({ kind: 'failed' });
    expect(fixOutcome('notInstalled', status('installFailed'))).toEqual({ kind: 'failed' });
  });

  it('moves to a new state when the attempt lands elsewhere', () => {
    expect(fixOutcome('notInstalled', status('restartRequired'))).toEqual({ kind: 'moved', status: status('restartRequired') });
    expect(fixOutcome('notRunning', status('blocked'))).toEqual({ kind: 'moved', status: status('blocked') });
  });

  it('a declined permission prompt moves the install screen to its note', () => {
    expect(fixOutcome('notInstalled', status('permissionDeclined')).kind).toBe('moved');
    expect(fixOutcome('permissionDeclined', status('permissionDeclined')).kind).toBe('failed');
  });
});

describe('previews', () => {
  it('has a status and phase for every id and resolves only known ids', () => {
    for (const id of PAWNIO_PREVIEW_IDS) {
      const p = previewFor(id);
      expect(p).not.toBeNull();
      expect(gateShows(p?.status ?? null)).toBe(true);
    }
    expect(previewFor('nope')).toBeNull();
    expect(previewFor(null)).toBeNull();
    expect(previewFor('toString')).toBeNull();
  });

  it('builds a link that carries the id', () => {
    expect(previewHref('blocked')).toBe('/?pawnioPreview=blocked');
  });
});
