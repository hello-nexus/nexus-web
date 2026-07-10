// Orchestrates rendering + uploading a resolved folder view's key images to
// a physical deck. Thin glue between the pure job list (deckTarget.ts), the
// canvas renderer, and the service client - kept separate from
// usePhysicalDeckTarget.ts so the hook's effect logic stays readable.
import { uploadStreamDeckKeyImage } from '../../../api/streamdeck';
import { renderDeckKeyBitmap, type DeckKeyModel } from './renderDeckKeyBitmap';
import type { DeckUploadJob } from './deckTarget';

/**
 * Renders and uploads every job in order, bailing out as soon as `isStale`
 * reports true (a newer edit/navigation has superseded this run) so a slow
 * upload never clobbers a later one.
 */
export async function pushDeckKeyImages(
  serial: string,
  model: DeckKeyModel,
  jobs: readonly DeckUploadJob[],
  isStale: () => boolean,
): Promise<void> {
  for (const job of jobs) {
    if (isStale()) return;
    const bytes = await renderDeckKeyBitmap(job.slot, model);
    if (isStale()) return;
    await uploadStreamDeckKeyImage(serial, job.slotPath, job.state, bytes, model.format);
  }
}
