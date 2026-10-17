/** The block type that colors a field through the Lighting page's color wheel. */
export const WHEEL_BLOCK = 'wheelcolor';

/** Whether a recipe (parsed or raw JSON shape) colors a field through the wheel's hue and range rather than colors of its own. */
export function recipeUsesWheel(recipe: { blocks?: readonly { type?: unknown }[] }): boolean {
  return (recipe.blocks ?? []).some(b => b.type === WHEEL_BLOCK);
}
