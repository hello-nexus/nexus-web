// @hellonexus/sdk barrel — the author's data/control/lifecycle surface.
export { mount } from './mount';
export type { WidgetSurfaces } from './mount';
export {
  useSettings, useSize, useSurface, usePreview, useLocalState, useTick, useSensor, useFetch, useDispatch, useHostAction,
  useLatest, request,
} from './hooks';
export { clamp, pct, formatDuration } from './format';
export type { WidgetHostApi, WidgetContextInit, WidgetSurface } from './context';
