// Shared sample window for performance / cooling sparklines. The buffer cap
// (in monitoringStore + useTopicHistory ring buffers) and the Sparkline
// `sampleCount` must match so the chart renders one continuous window
// without left-padding zeros.
export const PERF_HISTORY_SAMPLES = 40;
