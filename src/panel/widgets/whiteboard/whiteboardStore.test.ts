import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearBoard, loadBoard, MAX_BOARD_BYTES, saveBoard, subscribeBoard } from './whiteboardStore';
import { createEmptyBoard, type Stroke } from './whiteboardTypes';

const KEY = 'nexus_panel_whiteboard_w1';

function stroke(points = 2, width = 4): Stroke {
  return {
    tool: 'pen',
    color: '#ff0000',
    width,
    points: Array.from({ length: points }, (_, i) => ({ x: i, y: i })),
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('loadBoard', () => {
  it('returns a fresh board when nothing is stored', () => {
    expect(loadBoard('w1')).toEqual(createEmptyBoard());
  });

  it('degrades to a fresh board rather than throwing on unparseable JSON', () => {
    localStorage.setItem(KEY, '{not json');
    expect(loadBoard('w1')).toEqual(createEmptyBoard());
  });

  it('round-trips a saved board', () => {
    const board = { ...createEmptyBoard(), strokes: [stroke()], background: 'light' as const, penWidth: 12 };
    saveBoard('w1', board);
    const loaded = loadBoard('w1');
    expect(loaded.strokes).toEqual(board.strokes);
    expect(loaded.background).toBe('light');
    expect(loaded.penWidth).toBe(12);
  });

  it('drops individual malformed strokes but keeps the valid ones', () => {
    // One bad entry must not cost the user the rest of the drawing.
    localStorage.setItem(KEY, JSON.stringify({
      strokes: [
        stroke(),
        { color: '#fff', width: 3 },
        { tool: 'pen', color: '#fff', width: 3, points: [{ x: 'a', y: 1 }] },
        { tool: 'pen', color: '#fff', width: 0, points: [{ x: 1, y: 1 }] },
        stroke(3),
      ],
    }));
    expect(loadBoard('w1').strokes).toHaveLength(2);
  });

  it('ignores a non-finite view and keeps the default', () => {
    localStorage.setItem(KEY, JSON.stringify({
      strokes: [],
      view: { scale: NaN, panX: 0, panY: 0 },
    }));
    expect(loadBoard('w1').view).toEqual(createEmptyBoard().view);
  });

  it('normalizes an unknown background to dark', () => {
    localStorage.setItem(KEY, JSON.stringify({ strokes: [], background: 'chartreuse' }));
    expect(loadBoard('w1').background).toBe('dark');
  });

  it('survives storage that throws on read', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadBoard('w1')).toEqual(createEmptyBoard());
  });
});

describe('saveBoard', () => {
  it('drops oldest strokes until the payload fits the size cap', () => {
    // 900 points per stroke pushes the board past the cap; the newest strokes
    // are the ones worth keeping.
    const strokes = Array.from({ length: 60 }, () => stroke(900));
    const written = saveBoard('w1', { ...createEmptyBoard(), strokes });
    expect(written.length).toBeLessThan(strokes.length);
    expect(written[written.length - 1]).toBe(strokes[strokes.length - 1]);
    expect((localStorage.getItem(KEY) ?? '').length).toBeLessThanOrEqual(MAX_BOARD_BYTES);
  });

  it('returns the in-memory strokes and does not throw when the quota is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const strokes = [stroke()];
    expect(() => saveBoard('w1', { ...createEmptyBoard(), strokes })).not.toThrow();
    expect(saveBoard('w1', { ...createEmptyBoard(), strokes })).toEqual(strokes);
  });
});

describe('subscribeBoard', () => {
  it('notifies same-document listeners on save and clear', () => {
    // The `storage` event only fires in OTHER documents, so the tile behind an
    // open fullscreen view depends entirely on this in-process channel.
    const seen = vi.fn();
    const unsubscribe = subscribeBoard('w1', seen);
    saveBoard('w1', { ...createEmptyBoard(), strokes: [stroke()] });
    expect(seen).toHaveBeenCalledTimes(1);
    clearBoard('w1');
    expect(seen).toHaveBeenCalledTimes(2);
    unsubscribe();
    saveBoard('w1', createEmptyBoard());
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('does not cross-notify a different board', () => {
    const seen = vi.fn();
    const unsubscribe = subscribeBoard('w1', seen);
    saveBoard('w2', createEmptyBoard());
    expect(seen).not.toHaveBeenCalled();
    unsubscribe();
  });
});
