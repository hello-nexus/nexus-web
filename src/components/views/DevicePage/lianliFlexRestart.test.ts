// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { LianLiWirelessFan } from '../../../api/lianli-wireless';
import { reconcileRestarts } from './lianliFlexRestart';

function fan(mac: string, lcdRestarting?: boolean): LianLiWirelessFan {
  return { mac, masterMac: '', boundToUs: true, channel: 0, slot: 254, devType: 0, fanType: 51, fanCount: 1, rpm: [], pwm: [], lcdRestarting };
}

describe('reconcileRestarts', () => {
  it('keeps a request pending until the restart has been seen', () => {
    const pending = { A: false };
    expect(reconcileRestarts(pending, [fan('A', false)])).toBe(pending);
  });

  it('marks the restart seen while the service reports it', () => {
    expect(reconcileRestarts({ A: false }, [fan('A', true)])).toEqual({ A: true });
  });

  it('clears the request once a seen restart has finished', () => {
    expect(reconcileRestarts({ A: true }, [fan('A', false)])).toEqual({});
    expect(reconcileRestarts({ A: true }, [fan('A')])).toEqual({});
  });

  it('clears the request of a unit that is gone and leaves the others', () => {
    expect(reconcileRestarts({ A: false, B: false }, [fan('B', false)])).toEqual({ B: false });
  });

  it('returns the same object when nothing changes', () => {
    const pending = { A: true };
    expect(reconcileRestarts(pending, [fan('A', true)])).toBe(pending);
    expect(reconcileRestarts({}, [fan('A', true)])).toEqual({});
  });
});
