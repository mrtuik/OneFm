// Black theme. Accent is the Pocket FM pink, text is the palette off-white.
export const colors = {
  bg: '#0A0A0A',
  surface: '#171313',
  text: '#FEF4F4',
  sub: '#B5A8A8',
  accent: '#E31A4E',
  onAccent: '#FFFFFF',
  line: 'rgba(254,244,244,0.12)',
  scrim: 'rgba(10,10,10,0.6)',
  accentSoft: 'rgba(227,26,78,0.16)',
};

// Smaller, consistent corners. An inner element is always rounder-less than the card around it.
export const radius = { card: 12, inner: 8, chip: 8, btn: 10, badge: 6 };

// Shared spacing so every screen and card uses the same padding.
export const space = { screen: 16, card: 16, gap: 12, section: 24 };

// Shared poster sizes so story images look the same everywhere.
export const poster = {
  wideRatio: 16 / 10, // hero card and story detail
  tileWidth: 176, // horizontal rows, cover is square
  rowSize: 104, // search results, cover is square
  detailSize: 220, // story detail poster, square
};

export const TAB_BAR_HEIGHT = 72;
