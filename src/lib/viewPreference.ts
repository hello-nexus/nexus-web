/** The view a page shows: its stored choice, or 2D when 3D is not available (a build without dev tools). */
export const effectiveView3d = (stored: boolean, available: boolean): boolean => available && stored;
