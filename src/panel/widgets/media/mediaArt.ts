type MediaArtSession = {
  song?: {
    title?: string;
    artist?: string;
    album?: string;
  };
};

export function mediaArtSignature(session: MediaArtSession | null | undefined): string {
  const song = session?.song;
  return [
    song?.title ?? '',
    song?.artist ?? '',
    song?.album ?? '',
  ].join('\u001f');
}
