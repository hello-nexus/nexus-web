/** Ref callback that starts a video; autoplay alone is not reliable on a remounted video in the panel WebViews. */
export function kickPlay(el: HTMLVideoElement | null): void {
  el?.play()?.catch(() => {});
}
