// Catalog preview fixture — fake payload, untranslated by design. ONE complete
// size-independent snapshot. Keep in sync with what TransferWidget renders
// (see .agents/rules/widget-preview-fixtures.md in the master repo). The live
// widget resolves machineName via /ping; the fixture freezes it.
export const TRANSFER_PREVIEW = {
  machineName: 'Nexus-PC',
};
