function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatStopwatchElapsed(elapsed: number) {
  const totalHundredths = Math.floor(Math.max(0, elapsed) / 10);
  const hundredths = totalHundredths % 100;
  const totalSeconds = Math.floor(totalHundredths / 100);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  return {
    h: h > 0 ? String(h) : null,
    m: pad(m),
    s: pad(s),
    hundredths: pad(hundredths),
  };
}
