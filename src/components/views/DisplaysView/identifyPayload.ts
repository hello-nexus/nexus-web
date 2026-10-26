import type { IdentifyDisplayEntry, TopologyDisplay } from '../../../api/displays';
import { displayNumberLabel } from './monitorMapLayout';

/** How long the host keeps the labels up; the button stays pressed for the same span. */
export const IDENTIFY_SHOWN_MS = 3000;

/** One entry per display, labeled exactly as the arrangement diagram labels it, with the name the detail shows. */
export function identifyPayload(displays: TopologyDisplay[]): IdentifyDisplayEntry[] {
  return displays.map((display, index) => ({
    displayId: display.id,
    label: displayNumberLabel(display, index),
    name: display.name,
  }));
}
