import { getDatabase, ref, get, set, update, increment } from '@react-native-firebase/database';
import { getAuth } from '@react-native-firebase/auth';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { Story } from '../types';
import { SAMPLE_STORIES } from '../data/samples';
import { ensureUsername } from './community';

const norm = (s: Story): Story => ({
  ...s,
  genres: s.genres ?? [],
  characters: s.characters ?? [],
  episodes: s.episodes ?? [],
  likeCount: s.likeCount ?? 0,
  playCount: s.playCount ?? 0,
  highlight: s.highlight ?? (s.title ?? '').split(' ')[0],
  readMin: s.readMin ?? 6,
  creatorName: s.creatorName ?? 'One Fm',
  createdAt: s.createdAt ?? 0,
  cover: s.cover ?? ['#2A2230', '#5A3A4A'],
});

/** What the developer changed on a story page (thumbnail, names). Kept apart from the story, so it works for built-in stories too. */
export interface StoryEdit {
  title?: string;
  highlight?: string;
  logline?: string;
  /** Thumbnail as a small data: link (stored in the database, so every reader sees it). */
  image?: string;
  /** Episode names by position (0 is Episode 1). */
  episodes?: Record<string, { title?: string }> | ({ title?: string } | null)[];
}

// Counts developer edits in this session so Home knows when to reload its stories.
let editVersion = 0;
export const storiesVersion = () => editVersion;

/** Puts the developer's changes over a story. */
export const applyEdit = (s: Story, e?: StoryEdit | null): Story => {
  if (!e) return s;
  const eps = e.episodes as any;
  return {
    ...s,
    title: e.title || s.title,
    highlight: e.highlight || s.highlight,
    logline: e.logline || s.logline,
    image: e.image || s.image,
    episodes: s.episodes.map((ep, i) => (eps?.[i]?.title ? { ...ep, title: eps[i].title } : ep)),
  };
};

/** Stories from Realtime Database. Falls back to bundled samples if empty or offline. Developer edits are applied on top. */
export async function fetchStories(): Promise<Story[]> {
  try {
    const [snap, editSnap] = await Promise.all([
      get(ref(getDatabase(), 'stories')),
      get(ref(getDatabase(), 'storyEdits')).catch(() => null),
    ]);
    const edits = (editSnap?.val() ?? {}) as Record<string, StoryEdit>;
    const v = snap.val() as Record<string, Story> | null;
    let list = SAMPLE_STORIES;
    if (v) {
      // Counter updates can create partial nodes before seeding, so keep only complete stories.
      const full = Object.values(v).filter((x) => x && typeof x.title === 'string').map(norm);
      if (full.length) list = full;
    }
    return list.map((x) => applyEdit(x, edits[x.id]));
  } catch {
    return SAMPLE_STORIES;
  }
}

/**
 * Saves the developer's changes for a story.
 * Built-in stories: stored under storyEdits/<id> and applied on top of the story.
 * Community stories (postId): written into the post itself, and into the Home copy when the story is featured.
 */
export async function saveStoryEdit(story: Story, edit: StoryEdit, postId?: string) {
  const clean = JSON.parse(JSON.stringify(edit)) as StoryEdit;
  if (!postId) {
    await set(ref(getDatabase(), `storyEdits/${story.id}`), clean);
    editVersion++;
    return;
  }
  const fields: Record<string, any> = {};
  (['title', 'highlight', 'logline', 'image'] as const).forEach((k) => { if (clean[k]) fields[k] = clean[k]; });
  const eps = clean.episodes as any;
  story.episodes.forEach((_, i) => { if (eps?.[i]?.title) fields[`episodes/${i}/title`] = eps[i].title; });
  const up: Record<string, any> = {};
  for (const [k, val] of Object.entries(fields)) up[`posts/${postId}/story/${k}`] = val;
  const home = await get(ref(getDatabase(), `stories/${story.id}`));
  if (home.exists()) for (const [k, val] of Object.entries(fields)) up[`stories/${story.id}/${k}`] = val;
  await update(ref(getDatabase()), up);
  editVersion++;
}

/** Removes the developer's changes of a built-in story (back to the original thumbnail and names). */
export async function clearStoryEdit(storyId: string) {
  await set(ref(getDatabase(), `storyEdits/${storyId}`), null);
  editVersion++;
}

/** One-time seed from the Profile screen (dev action). */
export async function seedStories() {
  const obj: Record<string, Story> = {};
  SAMPLE_STORIES.forEach((s) => (obj[s.id] = s));
  await update(ref(getDatabase(), 'stories'), obj);
}

export async function ensureUserProfile(u: FirebaseAuthTypes.User) {
  try {
    const r = ref(getDatabase(), `users/${u.uid}`);
    const snap = await get(r);
    if (!snap.exists()) {
      await set(r, {
        name: u.displayName ?? u.email?.split('@')[0] ?? 'Reader',
        avatarUrl: u.photoURL ?? '',
        bio: '',
        role: 'user',
        createdAt: Date.now(),
      });
    }
    // Every reader gets a unique @username (new readers, and old ones who have none yet). They can change it in Edit profile.
    if (!snap.exists() || !snap.val()?.username) await ensureUsername(u.uid, u.email?.split('@')[0] ?? u.displayName ?? 'reader');
  } catch {}
}

/** Counts a play for a story. Needs a signed-in user, silently skipped for guests. */
export async function incrementPlay(storyId: string) {
  if (!getAuth().currentUser) return;
  try {
    await update(ref(getDatabase()), { [`stories/${storyId}/playCount`]: increment(1) });
  } catch {}
}

export async function isLiked(storyId: string): Promise<boolean> {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return false;
  try {
    return (await get(ref(getDatabase(), `users/${uid}/likes/${storyId}`))).exists();
  } catch {
    return false;
  }
}

/** Like or unlike in one atomic write: the user's like flag and the story counter change together. */
export async function setLiked(storyId: string, liked: boolean) {
  const uid = getAuth().currentUser?.uid;
  if (!uid) throw new Error('Sign in to like stories.');
  await update(ref(getDatabase()), {
    [`users/${uid}/likes/${storyId}`]: liked ? true : null,
    [`stories/${storyId}/likeCount`]: increment(liked ? 1 : -1),
  });
}
