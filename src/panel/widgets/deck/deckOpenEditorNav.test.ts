import { describe, it, expect } from 'vitest';
import { requestOpenDeckEditor, takePendingDeckEditorTarget, onDeckOpenEditor } from './deckOpenEditorNav';

describe('deckOpenEditorNav', () => {
  it('stashes a target the matching serial claims exactly once', () => {
    requestOpenDeckEditor({ serial: 'A', page: 1, folderPath: [2], keyIndex: 3 });

    expect(takePendingDeckEditorTarget('B')).toBeNull(); // wrong serial leaves it stashed
    expect(takePendingDeckEditorTarget('A')).toEqual({ serial: 'A', page: 1, folderPath: [2], keyIndex: 3 });
    expect(takePendingDeckEditorTarget('A')).toBeNull(); // consumed once
  });

  it('announces via the window event, and stops after unsubscribe', () => {
    let fired = 0;
    const off = onDeckOpenEditor(() => { fired++; });

    requestOpenDeckEditor({ serial: 'X', page: 0, folderPath: [], keyIndex: 0 });
    expect(fired).toBe(1);

    off();
    requestOpenDeckEditor({ serial: 'X', page: 0, folderPath: [], keyIndex: 1 });
    expect(fired).toBe(1);

    takePendingDeckEditorTarget('X'); // drain module state for other tests
  });
});
