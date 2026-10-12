import { getDatabase, ref, get, set, update, push, remove, query, orderByChild, equalTo, limitToLast, increment } from '@react-native-firebase/database';
import { getAuth } from '@react-native-firebase/auth';
import { GENRES, Post, Story } from '../types';

const db = () => getDatabase();
/** Realtime Database refuses `undefined`, so every object is cleaned before it is written. */
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// ---------- admin ----------
// An admin is a user whose id is listed in the database at config/admins/<uid> = true (set it in the Firebase console).
const adminCache: Record<string, boolean> = {};
export async function isAdmin(uid?: string | null): Promise<boolean> {
  if (!uid) return false;
  if (uid in adminCache) return adminCache[uid];
  try {
    adminCache[uid] = (await get(ref(db(), `config/admins/${uid}`))).val() === true;
  } catch {
    adminCache[uid] = false;
  }
  return adminCache[uid];
}

// ---------- users ----------
export interface PublicUser { uid: string; name: string; avatarUrl?: string; bio?: string; createdAt?: number }

export async function fetchUser(uid: string): Promise<PublicUser> {
  try {
    const v = (await get(ref(db(), `users/${uid}`))).val() ?? {};
    return { uid, name: v.name || 'Reader', avatarUrl: v.avatarUrl || undefined, bio: v.bio || '', createdAt: v.createdAt };
  } catch {
    return { uid, name: 'Reader' };
  }
}

export async function saveMyProfile(name: string, bio: string) {
  const u = getAuth().currentUser;
  if (!u) throw new Error('Sign in first.');
  await update(ref(db(), `users/${u.uid}`), { name: name.trim().slice(0, 40) || 'Reader', bio: bio.trim().slice(0, 160) });
}

// ---------- posts ----------
const toPost = (id: string, v: any): Post | null => {
  if (!v || typeof v !== 'object' || !v.story || typeof v.story.title !== 'string') return null;
  const st = v.story as Story;
  return {
    id,
    creatorUid: v.creatorUid ?? '',
    creatorName: v.creatorName || st.creatorName || 'Reader',
    creatorAvatar: v.creatorAvatar || undefined,
    createdAt: v.createdAt ?? 0,
    caption: v.caption || '',
    likeCount: v.likeCount ?? 0,
    featured: v.featured === true,
    story: {
      ...st,
      genres: st.genres ?? [],
      characters: st.characters ?? [],
      episodes: st.episodes ?? [],
      likeCount: st.likeCount ?? 0,
      playCount: st.playCount ?? 0,
      highlight: st.highlight ?? st.title.split(' ')[0],
      readMin: st.readMin ?? 6,
      creatorName: st.creatorName ?? v.creatorName ?? 'Reader',
      createdAt: st.createdAt ?? v.createdAt ?? 0,
      cover: st.cover ?? ['#2A2230', '#5A3A4A'],
      postId: id,
      fromCommunity: true,
    },
  };
};

const toList = (val: Record<string, any> | null): Post[] =>
  Object.entries(val ?? {}).map(([id, v]) => toPost(id, v)).filter((p): p is Post => !!p).sort((a, b) => b.createdAt - a.createdAt);

/** The newest posts, newest first. */
export async function fetchPosts(limit = 30): Promise<Post[]> {
  const snap = await get(query(ref(db(), 'posts'), orderByChild('createdAt'), limitToLast(limit)));
  return toList(snap.val());
}

export async function fetchUserPosts(uid: string): Promise<Post[]> {
  const snap = await get(query(ref(db(), 'posts'), orderByChild('creatorUid'), equalTo(uid)));
  return toList(snap.val());
}

export async function createPost(story: Story, caption: string): Promise<Post> {
  const u = getAuth().currentUser;
  if (!u) throw new Error('Sign in to post a story.');
  const me = await fetchUser(u.uid);
  const key = push(ref(db(), 'posts')).key!;
  const now = Date.now();
  const storyId = `${story.id.replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 40) || 'story'}-${key.slice(-5).toLowerCase()}`;
  const full: Story = {
    ...story, id: storyId, creatorName: me.name, creatorUid: u.uid, fromCommunity: true, postId: key,
    createdAt: now, likeCount: 0, playCount: 0,
  };
  const post = {
    creatorUid: u.uid, creatorName: me.name, creatorAvatar: me.avatarUrl ?? u.photoURL ?? '',
    createdAt: now, caption: caption.trim().slice(0, 200), story: full, likeCount: 0, featured: false,
  };
  await set(ref(db(), `posts/${key}`), clean(post));
  return toPost(key, post)!;
}

/** Creator or admin removes a post. A story that was on the Home page goes away with it. */
export async function deletePost(post: Post) {
  await update(ref(db()), { [`posts/${post.id}`]: null, [`stories/${post.story.id}`]: null });
}

/** Admin only: copy the story to the Home page list (or take it off again). */
export async function setFeatured(post: Post, on: boolean) {
  const home = on ? clean({ ...post.story, fromCommunity: true, postId: post.id, creatorUid: post.creatorUid, featuredAt: Date.now() }) : null;
  await update(ref(db()), { [`posts/${post.id}/featured`]: on, [`stories/${post.story.id}`]: home });
}

export async function myPostLikes(): Promise<Record<string, boolean>> {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return {};
  try { return (await get(ref(db(), `users/${uid}/postLikes`))).val() ?? {}; } catch { return {}; }
}

export async function isPostLiked(postId: string): Promise<boolean> {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return false;
  try { return (await get(ref(db(), `users/${uid}/postLikes/${postId}`))).exists(); } catch { return false; }
}

/** One write changes the user's like flag and the post counter together. */
export async function setPostLiked(postId: string, liked: boolean) {
  const uid = getAuth().currentUser?.uid;
  if (!uid) throw new Error('Sign in to like posts.');
  await update(ref(db()), {
    [`users/${uid}/postLikes/${postId}`]: liked ? true : null,
    [`posts/${postId}/likeCount`]: increment(liked ? 1 : -1),
  });
}

export async function reportPost(post: Post, reason: string) {
  const uid = getAuth().currentUser?.uid;
  if (!uid) throw new Error('Sign in to report a post.');
  await set(push(ref(db(), 'reports')), { targetType: 'post', targetId: post.id, storyId: post.story.id, reason, reporterUid: uid, createdAt: Date.now() });
}

// ---------- story checks ----------
const BLOCKED = ['porn', 'rape', 'incest', 'nude', 'sex scene', 'hentai', 'molest', 'pedo', 'cp video'];
const PALETTE: Record<string, [string, string]> = {
  Romance: ['#5B1E3E', '#E0486F'], Thriller: ['#101828', '#C2323F'], Horror: ['#10201F', '#4B6B63'],
  Fantasy: ['#241A4D', '#2FB7A0'], Campus: ['#3B2A1C', '#D6893F'],
};
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'story';
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const strList = (v: unknown, max = 12) => (Array.isArray(v) ? v.map(str).filter(Boolean).slice(0, max) : []);

export interface Checked { story?: Story; errors: string[]; warnings: string[] }

/** Checks a story object (from JSON or the form) and returns a clean Story or a list of problems in plain words. */
export function checkStory(input: any): Checked {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { errors: ['The story must be one JSON object.'], warnings };

  const title = str(input.title);
  const logline = str(input.logline);
  if (!title) errors.push('title is missing.');
  if (!logline) errors.push('logline is missing.');
  const language = input.language;
  if (!['en', 'bn', 'hi'].includes(language)) errors.push('language must be "en", "bn" or "hi".');
  const genres = strList(input.genres).filter((g) => GENRES.includes(g));
  if (!genres.length) errors.push(`genres needs at least one of: ${GENRES.join(', ')}.`);

  const chars = Array.isArray(input.characters) ? input.characters : [];
  if (!chars.length) errors.push('characters needs at least one character.');
  const characters = chars.map((c: any, i: number) => {
    const name = str(c?.name); const role = str(c?.role);
    if (!name || !role) errors.push(`character ${i + 1} needs a name and a role.`);
    const age = typeof c?.age === 'number' ? c.age : undefined;
    if (age !== undefined && age < 18) errors.push(`${name || `character ${i + 1}`} is under 18. Every character must be 18 or older.`);
    return {
      name, role, age, gender: c?.gender === 'male' || c?.gender === 'female' ? c.gender : undefined,
      appearance: str(c?.appearance) || undefined, personality: strList(c?.personality, 6), languageStyle: str(c?.languageStyle) || undefined,
      speechHabits: strList(c?.speechHabits, 6), wants: str(c?.wants) || undefined, fears: str(c?.fears) || undefined,
      secret: str(c?.secret) || undefined, flaw: str(c?.flaw) || undefined, relationshipToUser: str(c?.relationshipToUser) || undefined,
      exampleDialogue: strList(c?.exampleDialogue, 6),
    };
  });

  const eps = Array.isArray(input.episodes) ? input.episodes : [];
  if (!eps.length) errors.push('episodes needs at least one episode with a goal.');
  const episodes = eps.map((e: any, i: number) => {
    const goal = str(e?.goal);
    if (!goal) errors.push(`episode ${i + 1} needs a goal.`);
    return { goal, title: str(e?.title) || undefined, scene: str(e?.scene) || undefined, hook: str(e?.hook) || undefined };
  });

  if (!input.setting && !input.tone) warnings.push('No setting or tone. The story will feel generic. Use the master prompt to fill the story bible.');
  if (!input.characters?.some?.((c: any) => c?.exampleDialogue?.length)) warnings.push('No exampleDialogue on the characters, so their voices will sound alike.');

  const everything = JSON.stringify(input).toLowerCase();
  const hit = BLOCKED.find((w) => everything.includes(w));
  if (hit) errors.push('The story has words that are not allowed in One Fm (sexual or abusive content).');

  if (errors.length) return { errors, warnings };
  const highlightIn = str(input.highlight);
  const story: Story = {
    id: slug(str(input.id) || title),
    title, logline, language, genres,
    highlight: highlightIn && title.includes(highlightIn) ? highlightIn : title.split(' ')[0],
    characters, episodes,
    setting: str(input.setting) || undefined, tone: str(input.tone) || undefined, centralQuestion: str(input.centralQuestion) || undefined,
    openingLine: str(input.openingLine) || undefined,
    plotBeats: strList(input.plotBeats), endings: strList(input.endings, 4), rules: strList(input.rules), secrets: strList(input.secrets, 6),
    creatorName: str(input.creatorName) || 'Reader', likeCount: 0, playCount: 0, createdAt: Date.now(),
    readMin: typeof input.readMin === 'number' ? Math.min(30, Math.max(1, input.readMin)) : 6,
    messageLimit: typeof input.messageLimit === 'number' ? Math.min(80, Math.max(10, input.messageLimit)) : undefined,
    cover: Array.isArray(input.cover) && input.cover.length === 2 && input.cover.every((c: unknown) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c as string))
      ? [input.cover[0], input.cover[1]] : PALETTE[genres[0]] ?? ['#2A2230', '#5A3A4A'],
  };
  return { story: clean(story), errors, warnings };
}

/** Reads text pasted by the user (it may be wrapped in a ```json fence, or be an array with one story). */
export function parseStoryText(raw: string): Checked {
  let t = raw.trim();
  if (!t) return { errors: ['Paste the story JSON first.'], warnings: [] };
  t = t.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const a = t.search(/[\[{]/);
  const b = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if (a < 0 || b <= a) return { errors: ['That does not look like JSON.'], warnings: [] };
  try {
    let j = JSON.parse(t.slice(a, b + 1));
    if (Array.isArray(j)) j = j[0];
    return checkStory(j);
  } catch (e: any) {
    return { errors: [`The JSON could not be read: ${String(e?.message ?? e).slice(0, 120)}`], warnings: [] };
  }
}
