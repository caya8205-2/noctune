/**
 * Noctune design tokens — desktop source of truth for JS/TS consumers.
 *
 * Colors / radii / spacing used in CSS also live as CSS variables in
 * `index.css` (`:root`). Keep both in sync when changing brand values.
 *
 * Prefer:
 * - Tailwind token classes (`bg-accent`, `text-muted`, `w-track-thumb`, …)
 * - CSS vars (`var(--size-modal-md)`) in stylesheets
 * - These TS constants for lucide sizes, portal math, canvas, etc.
 */

/** RGB channel triples (space-separated) for `rgb(var(--token) / <alpha>)`. */
export const noctuneRgb = {
  gold: '234 177 76',
  goldDim: '200 146 58',
  moon: '127 168 255',
  bg: '6 7 9',
  surface: '11 13 17',
  surfaceRaised: '20 23 30',
  surfaceHigh: '29 33 43',
  border: '42 47 59',
  borderStrong: '58 65 81',
  muted: '106 110 120',
  soft: '164 168 178',
  ink: '236 234 227',
  danger: '248 113 113',
} as const;

/** Hex palette for places that need a concrete color string. */
export const noctuneHex = {
  gold: '#EAB14C',
  goldDim: '#C8923A',
  goldBright: '#F4C76A',
  moon: '#7FA8FF',
  bg: '#060709',
  surface: '#0B0D11',
  surfaceRaised: '#14171E',
  surfaceHigh: '#1D212B',
  border: '#2A2F3B',
  muted: '#6A6E78',
  soft: '#A4A8B2',
  ink: '#ECEAE3',
  white: '#FFFFFF',
  danger: '#F87171',
  /** Aligns with mobile `noctuneGold` for cross-platform brand reference. */
  mobileGold: '#F7B733',
  mobileBg: '#050608',
  mobileSurface: '#11141A',
  mobileSurfaceRaised: '#171B23',
  mobileMuted: '#8C93A3',
} as const;

/** Layout chrome (px) — used for dropdown positioning, safe areas, etc. */
export const noctuneLayout = {
  topChrome: 56,
  topChromeMd: 40,
  playerBar: 80,
  sidebar: 256,
  detailsSidebar: 288,
  pagePadX: 24,
  pagePadY: 20,
  viewportEdgeGap: 12,
} as const;

/** Component size tokens (px) for icons, thumbs, modals, actions. */
export const noctuneSize = {
  // Track artwork
  trackThumbXs: 32,
  trackThumbSm: 40,
  trackThumb: 48,
  trackThumbMd: 56,
  trackThumbLg: 64,

  // Track action buttons (lucide `size` prop)
  actionIcon: 14,
  actionIconMd: 16,
  actionIconLg: 18,
  actionHit: 28,
  actionHitMd: 32,

  // Dropdown / menus
  dropdownWidth: 224,
  dropdownMaxHeight: 288,
  dropdownMinHeight: 176,
  dropdownButtonGap: 8,

  // Modals
  modalSm: 384,
  modalMd: 448,
  modalLg: 512,
  modalPad: 20,
  modalPadLg: 24,

  // Local library cards
  libraryCardRadius: 12,
  libraryCoverRadius: 8,
  emptyStateIcon: 30,
  emptyStateBox: 56,

  // Player
  playButton: 48,
  eqThumb: 14,
} as const;

/** Border radius scale (px). */
export const noctuneRadius = {
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  full: 9999,
} as const;

/** Z-index layers. */
export const noctuneZ = {
  base: 0,
  raised: 10,
  dropdown: 40,
  sticky: 30,
  modalBackdrop: 50,
  modal: 50,
  toast: 60,
  tooltip: 70,
} as const;

/** Transition durations (ms). */
export const noctuneMotion = {
  fast: 150,
  normal: 200,
  slow: 300,
  enter: 400,
} as const;

/** Convenience bundle — import `{ noctune }` when you want the whole kit. */
export const noctune = {
  rgb: noctuneRgb,
  hex: noctuneHex,
  layout: noctuneLayout,
  size: noctuneSize,
  radius: noctuneRadius,
  z: noctuneZ,
  motion: noctuneMotion,
} as const;

export type NoctuneTheme = typeof noctune;
