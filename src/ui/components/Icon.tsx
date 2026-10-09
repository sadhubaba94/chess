const PATHS = {
  first: 'M6 5h2v14H6zM20 5v14L9.5 12z',
  prev: 'M17 5v14L6.5 12z',
  next: 'M7 5v14l10.5-7z',
  last: 'M16 5h2v14h-2zM4 5v14l10.5-7z',
} as const;

export type IconName = keyof typeof PATHS;

/** Inline SVG icons (no icon font, so glyphs render identically on every platform). */
export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fill="currentColor" />
    </svg>
  );
}
