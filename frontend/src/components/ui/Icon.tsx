import React from 'react';

// Hand-rolled minimal SVG path set. Paths copied verbatim from
// docs/design/handoff/v4/primitives-v4.jsx ICON_PATHS table.
export const ICON_PATHS = {
  home:     'M3 8l5-5 5 5v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8z',
  layers:   'M8 2L2 5l6 3 6-3-6-3zm-6 6l6 3 6-3M2 11l6 3 6-3',
  book:     'M3 3h7a3 3 0 0 1 3 3v7H6a3 3 0 0 1-3-3V3zm10 0h0M3 3v10',
  users:    'M5 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm6 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM2 13c0-2 1.5-3 3-3s3 1 3 3m1 0c0-2 1.5-3 3-3s3 1 3 3',
  zap:      'M9 2L3 9h4l-1 5 6-7H8l1-5z',
  search:   'M11 11l3 3M7 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10z',
  chevR:    'M6 3l4 5-4 5',
  chevL:    'M10 3L6 8l4 5',
  chevD:    'M3 6l5 4 5-4',
  chevU:    'M3 10l5-4 5 4',
  plus:     'M8 3v10M3 8h10',
  x:        'M3 3l10 10M13 3L3 13',
  check:    'M3 8l3 3 7-7',
  alert:    'M8 2l6 11H2L8 2zM8 6v3M8 11.5v.5',
  info:     'M8 14a6 6 0 1 0 0-12 6 6 0 0 0 0 12zm0-9v.5M8 7v4',
  play:     'M4 3l9 5-9 5V3z',
  pause:    'M5 3v10M11 3v10',
  square:   'M3 3h10v10H3z',
  menu:     'M2 4h12M2 8h12M2 12h12',
  more:     'M3 8h.01M8 8h.01M13 8h.01',
  settings: 'M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2',
  bell:     'M4 11V7a4 4 0 1 1 8 0v4l1 2H3l1-2zM6 14h4',
  lock:     'M4 7h8v6H4zM6 7V5a2 2 0 1 1 4 0v2',
  globe:    'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM1.5 8h13M8 1.5C5 4 5 12 8 14.5M8 1.5c3 2.5 3 10.5 0 13',
  copy:     'M5 5V3a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-2M3 5h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z',
  edit:     'M11 2l3 3-8 8H3v-3l8-8zM10 3l3 3',
  trash:    'M3 4h10M6 4V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M5 4l1 9h4l1-9',
  download: 'M8 2v8M5 7l3 3 3-3M3 13h10',
  arrowR:   'M3 8h10M9 4l4 4-4 4',
  arrowL:   'M13 8H3M7 4L3 8l4 4',
  upload:   'M8 11V3M5 6l3-3 3 3M3 13h10',
  refresh:  'M2.5 8a5.5 5.5 0 0 1 9.5-3.5L13 6M13.5 8a5.5 5.5 0 0 1-9.5 3.5L3 10M13 3v3h-3M3 13v-3h3',
  wifi:     'M2 6a9 9 0 0 1 12 0M4 9a6 6 0 0 1 8 0M6 12a3 3 0 0 1 4 0M8 14h.01',
  link:     'M7 9a3 3 0 0 1 0-4l2-2a3 3 0 1 1 4 4l-1 1M9 7a3 3 0 0 1 0 4l-2 2a3 3 0 1 1-4-4l1-1',
  flag:     'M3 14V2M3 2h9l-2 3 2 3H3',
  send:     'M14 2L2 8l5 1 1 5 6-12z',
  filter:   'M2 3h12l-5 6v5l-2-1V9L2 3z',
  sort:     'M5 3v10M2 10l3 3 3-3M11 13V3M14 6l-3-3-3 3',
  eye:      'M1.5 8s2.5-5 6.5-5 6.5 5 6.5 5-2.5 5-6.5 5-6.5-5-6.5-5zM8 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  history:  'M8 4v4l3 2M8 1.5a6.5 6.5 0 1 0 6.5 6.5M2 4l-.5 3 3 .5',
  star:     'M8 2l1.8 4 4.2.5-3 3 .8 4.5-4-2-4 2 .8-4.5-3-3 4.2-.5L8 2z',
} as const;

export type IconName = keyof typeof ICON_PATHS;

export interface IconProps {
  name: IconName;
  size?: number;
  stroke?: number;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Icon — line-glyph SVG set (16×16 viewBox, currentColor stroke).
 * Pure presentational; no state. Pass name from the ICON_PATHS set.
 * Returns null for unknown names so callers don't need to guard.
 */
export function Icon({ name, size = 14, stroke = 1.6, className, style }: IconProps): React.ReactElement | null {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0, display: 'inline-block', ...style }}
    >
      <path d={d} />
    </svg>
  );
}

export default Icon;
