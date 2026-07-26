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

let applePlatform: boolean | undefined;

/**
 * True on Apple platforms, where Cmd (not Ctrl) is the selection accelerator.
 * detectOS() already reports 'macos' for iPhone/iPad too (their UA carries
 * "like Mac OS X"), so this covers every Apple device.
 */
export function isApplePlatform(): boolean {
  if (applePlatform === undefined) applePlatform = detectOS() === 'macos';
  return applePlatform;
}

/**
 * Whether an event carries the platform multi-select accelerator: Cmd on Apple,
 * Ctrl on Windows/Linux. Every additive/toggle selection surface routes through
 * this so the modifier is consistent per-OS. On a Mac, Ctrl+click is a secondary
 * (right) click, so Cmd is the only correct choice there.
 */
export function isMultiSelectModifier(e: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return isApplePlatform() ? e.metaKey : e.ctrlKey;
}

export function isSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  if (!ua.includes('safari')) return false;
  if (ua.includes('chrome') || ua.includes('chromium') || ua.includes('crios') ||
      ua.includes('fxios') || ua.includes('edg') || ua.includes('opr')) return false;
  return true;
}

// iPadOS 13+ Safari sends a desktop "Macintosh" UA; maxTouchPoints (>1 on an
// iPad, 0 on a real Mac) is the only separating signal.
function isIpadUnderMacUa(ua: string): boolean {
  return /Macintosh/i.test(ua) && navigator.maxTouchPoints > 1;
}

/**
 * True on a phone or tablet, where the Nexus desktop app cannot run.
 * Unrecognized UAs count as desktop so unknown clients keep the full UI.
 */
export function isHandheldDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
  return isIpadUnderMacUa(ua);
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
  if (/iPad/i.test(ua) || isIpadUnderMacUa(ua)) return 'iPad';
  if (/Android/i.test(ua)) {
    // Phones include "Mobile"; tablets historically omit it, but Samsung
    // tablets break that rule - fall back to the 600px tablet breakpoint.
    const shortSide = Math.min(window.screen.width, window.screen.height);
    return !/Mobile/i.test(ua) || shortSide >= 600 ? 'Android tablet' : 'Android phone';
  }
  return '';
}
