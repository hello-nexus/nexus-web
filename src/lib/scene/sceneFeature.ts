import { DEV_TOOLS } from '../devTools';

/**
 * The desk is shelved: while this is false no desk, and nothing that exists only because of it, is drawn or named. The
 * code, the stored scenes and the locale keys stay, so setting it to true brings the desk back unchanged.
 */
export const DESK_ENABLED = false;

/** The 3D lighting scene draws the case with the desk around it and is experimental: offered only in dev-tools builds, and not while the desk is shelved. */
export const SCENE_3D = DEV_TOOLS && DESK_ENABLED;
