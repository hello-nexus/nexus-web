// Orchestrates rendering + uploading the whole deck tree's key images to a
// physical deck. Thin glue between the pure job list (deckTarget.ts), the
// canvas renderer, and the service client - kept separate from
// usePhysicalDeckTarget.ts so the hook's effect logic stays readable.
import { uploadStreamDeckKeyImage } from '../../../api/streamdeck';
import { renderDeckKeyBitmap, type DeckKeyModel } from './renderDeckKeyBitmap';
import { deckImageSlotPath, type DeckUploadJob } from './deckTarget';

/**
 * Renders and uploads every job in order, skipping a job whose slot content
 * is unchanged from what `uploaded` recorded the last time this key was
 * pushed - avoids the render + HTTP round trip for content the device
 * already has, even though the service store is content-addressed and would
 * dedupe it anyway. `uploaded` is caller-owned (keyed by the same
 * page-qualified slotPath + state the upload route uses) so it persists
 * across sync passes; bails out as soon as `isStale` reports true (a newer
 * edit has superseded this run) so a slow upload never clobbers a later one.
 */
export async function pushDeckKeyImages(
  serial: string,
  model: DeckKeyModel,
  jobs: readonly DeckUploadJob[],
  isStale: () => boolean,
  uploaded: Map<string, string>,
): Promise<void> {
  for (const job of jobs) {
    if (isStale()) return;
    const slotPath = deckImageSlotPath(job.page, job.slotPath);
    const key = `${slotPath}/${job.state}`;
    const signature = JSON.stringify(job.slot);
    if (uploaded.get(key) === signature) continue;
    const bytes = await renderDeckKeyBitmap(job.slot, model);
    if (isStale()) return;
    const hash = await uploadStreamDeckKeyImage(serial, slotPath, job.state, bytes, model.format);
    if (hash !== null) uploaded.set(key, signature);
  }
}
