import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TypeReactiveBoard } from './TypeReactiveBoard';
import { clearLedFrame, publishLedFrame } from '../../../lib/ledFrameStore';
import type { KeyReactionPreview } from '../../../api/keyReactive';

// Records every fill the board paints.
const fills: string[] = [];
const ctx = {
  setTransform: vi.fn(), clearRect: vi.fn(), beginPath: vi.fn(), arc: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
  set fillStyle(v: string) { fills.push(v); },
  lineWidth: 0, strokeStyle: '',
};

const preview = { x: [0, 1], y: [0, 0], width: 2, height: 1, fps: 30, frameCount: 1 } as KeyReactionPreview;

beforeEach(() => {
  fills.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as never);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
});
afterEach(() => { clearLedFrame(); vi.restoreAllMocks(); });

describe('TypeReactiveBoard', () => {
  it('paints the stream bytes as-is, with no extra dimming', () => {
    // Bytes already carry the brightness the hardware gets.
    render(<TypeReactiveBoard preview={preview} label="board" disabled={false} live frameIndex={7} onPressLed={vi.fn()} onPressRandom={vi.fn()} />);
    // The painter exists once the measured width lands, so the frame comes after.
    act(() => { publishLedFrame(new Uint8Array(12), 2, 2, new Map([[7, new Uint8Array([200, 100, 80, 70, 60, 90])]])); });
    return new Promise<void>(resolve => requestAnimationFrame(() => {
      expect(fills).toContain('rgb(200,100,80)');
      expect(fills).toContain('rgb(70,60,90)');
      resolve();
    }));
  });
});
