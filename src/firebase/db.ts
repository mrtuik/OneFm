import { getDatabase, ref, get, set, update } from '@react-native-firebase/database';
import type { FirebaseAuthTypes } from '@react-native-firebase/auth';
import { Story } from '../types';
import { SAMPLE_STORIES } from '../data/samples';

const norm = (s: Story): Story => ({ ...s, genres: s.genres ?? [], characters: s.characters ?? [], episodes: s.episodes ?? [] });

/** Stories from Realtime Database. Falls back to bundled samples if empty or offline. */
export async function fetchStories(): Promise<Story[]> {
  try {
    const snap = await get(ref(getDatabase(), 'stories'));
    const v = snap.val() as Record<string, Story> | null;
    if (!v) return SAMPLE_STORIES;
    return Object.values(v).map(norm);
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
    if (snap.exists()) return;
    await set(r, {
      name: u.displayName ?? u.email?.split('@')[0] ?? 'Reader',
      avatarUrl: u.photoURL ?? '',
      bio: '',
      role: 'user',
      createdAt: Date.now(),
    });
  } catch {}
}
