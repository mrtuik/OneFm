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

/** Roles the reader may play: the unnamed main character ("You") and every character that fits their gender. */
export function playableRoles(story: Story, gender: Gender | null): Character[] {
  const s = withRoleInfo(story);
  const you: Character = { name: YOU, role: 'The main character of the story. The story speaks to you directly.' };
  const fits = s.characters.filter((c) => !c.gender || !gender || c.gender === gender);
  return [you, ...fits];
}

export const isYou = (role?: string) => !role || role === YOU;
