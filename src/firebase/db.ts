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

/** Stories from Realtime Database. Falls back to bundled samples if empty or offline. */
export async function fetchStories(): Promise<Story[]> {
  try {
    const snap = await get(ref(getDatabase(), 'stories'));
    const v = snap.val() as Record<string, Story> | null;
    if (!v) return SAMPLE_STORIES;
    // Counter updates can create partial nodes before seeding, so keep only complete stories.
    const full = Object.values(v).filter((x) => x && typeof x.title === 'string').map(norm);
    return full.length ? full : SAMPLE_STORIES;
  } catch {
    return SAMPLE_STORIES;
  }
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
