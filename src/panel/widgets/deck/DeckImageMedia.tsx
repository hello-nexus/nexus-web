interface DeckImageMediaProps {
  url: string;
  isVideo: boolean;
  className?: string;
}

/** A stored deck key image: video loops muted inline, everything else (including GIF) is an img. */
export function DeckImageMedia({ url, isVideo, className }: DeckImageMediaProps) {
  if (isVideo) {
    return <video src={url} className={className} autoPlay loop muted playsInline aria-hidden="true" />;
  }
  return <img src={url} className={className} alt="" />;
}
