import { Story } from '../types';

/** Cover art that ships inside the app, by story id. Stories posted by users use their own `image` instead. */
export const COVER_ASSETS: Record<string, number> = {
  s01: require('../../assets/covers/s01.jpg'),
  s02: require('../../assets/covers/s02.jpg'),
  s03: require('../../assets/covers/s03.jpg'),
  s04: require('../../assets/covers/s04.jpg'),
  s05: require('../../assets/covers/s05.jpg'),
  s06: require('../../assets/covers/s06.jpg'),
  s07: require('../../assets/covers/s07.jpg'),
  s08: require('../../assets/covers/s08.jpg'),
  s09: require('../../assets/covers/s09.jpg'),
  s10: require('../../assets/covers/s10.jpg'),
  s11: require('../../assets/covers/s11.jpg'),
};

/** The picture for a story, or null when it only has gradient colors. */
export function coverSource(story: Pick<Story, 'id' | 'image'>): number | { uri: string } | null {
  if (story.image) return { uri: story.image };
  return COVER_ASSETS[story.id] ?? null;
}
