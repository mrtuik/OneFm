import { SAMPLE_STORIES } from './samples';
import { Post } from '../types';

const H = 3600 * 1000;
const WHO: { name: string; username: string; caption: string; likes: number; ago: number; story: string }[] = [
  { name: 'Ananya Roy', username: 'ananya.roy', caption: 'Ei golpota raat e porle ar ghum ashbe na.', likes: 128, ago: 3, story: 's03' },
  { name: 'Rohan Mehta', username: 'rohan_m', caption: 'Episode 2 ka twist dekhke maza aa gaya!', likes: 86, ago: 9, story: 's08' },
  { name: 'Mitali Das', username: 'mitali', caption: 'Baarir kotha mone pore gelo. Try it.', likes: 54, ago: 20, story: 's01' },
  { name: 'Kabir Singh', username: 'kabir.s', caption: 'Hostel life, but make it a mystery.', likes: 41, ago: 31, story: 's10' },
  { name: 'Sneha Paul', username: 'sneha_p', caption: 'My comfort story. Chai and rain.', likes: 33, ago: 48, story: 's02' },
];

/** A few made-up posts so the feed never looks empty. They sit under the real posts. */
export const SAMPLE_POSTS: Post[] = WHO.flatMap((w, i) => {
  const story = SAMPLE_STORIES.find((s) => s.id === w.story);
  if (!story) return [];
  const createdAt = Date.now() - w.ago * H;
  return [{
    id: `sample-${i + 1}`, creatorUid: '', creatorName: w.name, creatorUsername: w.username, createdAt,
    caption: w.caption, likeCount: w.likes, featured: false, visibility: 'public' as const, sample: true,
    story: { ...story, creatorName: w.name, createdAt, likeCount: w.likes },
  }];
});
