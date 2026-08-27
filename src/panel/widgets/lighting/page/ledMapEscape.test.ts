// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { shouldConsumeEditorEscape } from './ledMapEscape';

describe('shouldConsumeEditorEscape', () => {
  it('consumes Escape when a selection exists, no dialog is stacked above, and focus is not editable', () => {
    expect(shouldConsumeEditorEscape({
      isEditableTarget: false,
      dialogAboveEditorOpen: false,
      hasSelection: true,
    })).toBe(true);
  });

  it('does not consume Escape when there is no selection, letting it reach DeviceModal', () => {
    expect(shouldConsumeEditorEscape({
      isEditableTarget: false,
      dialogAboveEditorOpen: false,
      hasSelection: false,
    })).toBe(false);
  });

  it('does not consume Escape when a dialog is stacked above the editor, even with a selection', () => {
    expect(shouldConsumeEditorEscape({
      isEditableTarget: false,
      dialogAboveEditorOpen: true,
      hasSelection: true,
    })).toBe(false);
  });

  it('does not consume Escape when focus is in an editable field, even with a selection', () => {
    expect(shouldConsumeEditorEscape({
      isEditableTarget: true,
      dialogAboveEditorOpen: false,
      hasSelection: true,
    })).toBe(false);
  });
});
