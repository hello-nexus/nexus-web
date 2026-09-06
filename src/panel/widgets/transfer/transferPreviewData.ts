// Catalog preview fixture - fake payload, untranslated by design. ONE complete
// size-independent snapshot. Keep in sync with what TransferWidget renders
// (previewMode.test.tsx is the fixture-sync gate). The live widget resolves
// machineName via /ping; the fixture freezes it.
export const TRANSFER_PREVIEW = {
  machineName: 'Nexus-PC',
};
