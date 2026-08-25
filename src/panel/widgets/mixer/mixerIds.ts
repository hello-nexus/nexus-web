/** Mirrors AudioMixerIds in nexus-service: strip ids that are not process names. */
export const AudioMixerIds = {
  /** The pid-0 session Windows renders notification sounds through. */
  SystemSounds: '@system',
} as const;
