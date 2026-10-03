// One-shot "start a run as the Benchmark page opens", for surfaces outside the
// page (the Build frame's Start benchmark). The page takes it on mount, so a
// request never outlives the visit it was made for.
let startRequested = false;

export function requestBenchmarkStart(): void {
  startRequested = true;
}

export function takeBenchmarkStartRequest(): boolean {
  const requested = startRequested;
  startRequested = false;
  return requested;
}
