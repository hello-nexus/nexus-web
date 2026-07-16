// Pure client-side mirror of the service's name-uniqueness rules (case-
// insensitive, trimmed). Kept free of React so it is unit-testable.

export interface NameCollisionItem {
  id: string;
  name: string;
}

/**
 * True when the trimmed, case-folded `name` collides with an existing item's
 * name other than `excludeId` - the item being renamed keeps its own current
 * name as a no-op, matching the server's collision rule.
 */
export function isNameTaken(items: NameCollisionItem[], name: string, excludeId?: string): boolean {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return false;
  return items.some(item => item.id !== excludeId && item.name.trim().toLowerCase() === trimmed);
}
