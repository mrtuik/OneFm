import { Character, Gender, Story } from '../types';
import { SAMPLE_STORIES } from '../data/samples';

export const YOU = 'You';

// Stories saved in the database before roles existed have no gender on their characters.
// Fill the gaps from the bundled sample with the same id and character name.
export function withRoleInfo(story: Story): Story {
  const sample = SAMPLE_STORIES.find((x) => x.id === story.id);
  if (!sample) return story;
  return {
    ...story,
    characters: story.characters.map((c) => {
      if (c.gender) return c;
      const m = sample.characters.find((x) => x.name === c.name);
      return m?.gender ? { ...c, gender: m.gender } : c;
    }),
  };
}

/** Roles the reader may play: only the story's named main characters that fit their gender. */
export function playableRoles(story: Story, gender: Gender | null): Character[] {
  const s = withRoleInfo(story);
  const fits = s.characters.filter((c) => !c.gender || !gender || c.gender === gender);
  // Never leave the picker empty (for example a story with only female roles and a male reader).
  return fits.length ? fits : s.characters;
}

export const isYou = (role?: string) => !role || role === YOU;
