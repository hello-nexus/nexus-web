// Shared sample window for performance / cooling sparklines. The buffer cap and
// the Sparkline `sampleCount` must match so the chart renders one continuous
// window without left-padding zeros.
export const PERF_HISTORY_SAMPLES = 40;

// The old `useHistory(value, samples)` hook was removed: it gated the
// push on `useEffect([value, samples])`, which silently dropped frames
// whose value was identical to the prior sample (React's Object.is on
// primitives). The user-visible symptom was the cooling trend chart
// freezing on stretches of pinned-temperature readings. New callers
// should use `useSharedSensorHistory` (driven off monitoring frameTick,
// not value identity).
