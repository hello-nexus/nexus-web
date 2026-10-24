/** Kinds of desk items Lighting names and auto-places devices on. */
export type DeskKind = 'keyboard' | 'mouse' | 'mousepad' | 'deskmat' | 'headset' | 'monitor' | 'speaker' | 'strip' | 'light';

export const DESK_KINDS: DeskKind[] = ['keyboard', 'mouse', 'mousepad', 'deskmat', 'headset', 'monitor', 'speaker', 'strip', 'light'];

export function isDeskKind(kind: string): kind is DeskKind {
  return (DESK_KINDS as string[]).includes(kind);
}
