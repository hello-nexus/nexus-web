export type DetectedOS = 'windows' | 'macos' | 'linux' | 'unknown';

interface UAData {
  platform?: string;
}

interface NavigatorWithUAData extends Navigator {
  userAgentData?: UAData;
}

export function detectOS(): DetectedOS {
  if (typeof navigator === 'undefined') return 'unknown';

  const uaData = (navigator as NavigatorWithUAData).userAgentData;
  const platformHint = uaData?.platform?.toLowerCase() ?? '';
  if (platformHint) {
    if (platformHint.includes('win')) return 'windows';
    if (platformHint.includes('mac')) return 'macos';
    if (platformHint.includes('linux')) return 'linux';
  }

  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('windows')) return 'windows';
  if (ua.includes('mac os') || ua.includes('macintosh')) return 'macos';
  if (ua.includes('linux') && !ua.includes('android')) return 'linux';
  return 'unknown';
}

export function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  if (!ua.includes('safari')) return false;
  if (ua.includes('chrome') || ua.includes('chromium') || ua.includes('crios') ||
      ua.includes('fxios') || ua.includes('edg') || ua.includes('opr')) return false;
  return true;
}

// Short device-class label for the pairing session list. The signals that
// disambiguate the two cases the service can't get right from the User-Agent
// alone live only client-side: iPadOS 13+ Safari sends a desktop "Macintosh"
// UA (indistinguishable from a real Mac), and Samsung Android tablets carry
// "Mobile" in the UA exactly like a phone. Returns '' for anything we can't
// confidently classify so the service falls back to its own UA descriptor.
export function deriveDeviceLabel(): string {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return '';
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone';
  // maxTouchPoints separates an iPad (>1) from a real Mac (0) under the Mac UA.
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/i.test(ua)) {
    // Phones include "Mobile"; tablets historically omit it, but Samsung
    // tablets break that rule — fall back to the 600px tablet breakpoint.
    const shortSide = Math.min(window.screen.width, window.screen.height);
    return !/Mobile/i.test(ua) || shortSide >= 600 ? 'Android tablet' : 'Android phone';
  }
  return '';
}
