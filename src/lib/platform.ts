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
