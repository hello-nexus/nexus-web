// True only in a build carrying the build credential. A false value is a
// compile-time constant, so the surfaces behind it are unreachable (their
// modules still ship - the point is that nothing renders or calls them).
// Unlike DEV_TOOLS this is NOT forced on under `vite dev`: a machine with no
// credential builds what it is.
export const OFFICIAL_BUILD = __OFFICIAL_BUILD__;
