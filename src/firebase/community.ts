import { getDatabase, ref, get, set, update, push, remove, query, orderByChild, equalTo, limitToLast, increment, runTransaction } from '@react-native-firebase/database';
import { getAuth } from '@react-native-firebase/auth';
import { GENRES, Gender, Post, Story, Visibility } from '../types';

const db = () => getDatabase();
/** Realtime Database refuses `undefined`, so every object is cleaned before it is written. */
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// ---------- admin ----------
// The only admin is the owner account below. Admin status is decided by the signed-in email, nothing is shown in Profile for anyone else.
const ADMIN_EMAILS = ['xrdk95@gmail.com'];
export async function isAdmin(uid?: string | null): Promise<boolean> {
  if (!uid) return false;
  const u = getAuth().currentUser;
  if (!u || u.uid !== uid) return false;
  return !!u.email && u.emailVerified !== false && ADMIN_EMAILS.includes(u.email.toLowerCase());
}

// ---------- users ----------
export interface PublicUser { uid: string; name: string; username?: string; gender?: Gender; avatarUrl?: string; bio?: string; createdAt?: number }

const toUser = (uid: string, v: any): PublicUser => ({
  uid,
  name: v?.name || 'Reader',
  username: v?.username || undefined,
  gender: v?.gender === 'male' || v?.gender === 'female' ? v.gender : undefined,
  avatarUrl: v?.avatarUrl || undefined,
  bio: v?.bio || '',
  createdAt: v?.createdAt,
});

/** Reads a profile and throws when the database cannot be reached. */
const readUser = async (uid: string): Promise<PublicUser> => toUser(uid, (await get(ref(db(), `users/${uid}`))).val() ?? {});

export async function fetchUser(uid: string): Promise<PublicUser> {
  try { return await readUser(uid); } catch { return { uid, name: 'Reader' }; }
}

// ---------- usernames ----------
// usernames/<name> = uid keeps every @username unique. The claim is a transaction, so two readers cannot get the same one.
export const cleanUsername = (v: string) => v.trim().toLowerCase().replace(/^@+/, '');

/** Returns a plain-words problem with the username, or null when it is fine. */
export function usernameProblem(v: string): string | null {
  if (v.length < 3) return 'Use at least 3 characters.';
  if (v.length > 20) return 'Use at most 20 characters.';
  if (!/^[a-z0-9_.]+$/.test(v)) return 'Only small letters, numbers, dot and underscore.';
  if (/^[._]|[._]$/.test(v)) return 'It cannot start or end with a dot or underscore.';
  if (/[._]{2}/.test(v)) return 'No two dots or underscores in a row.';
  return null;
}

export async function isUsernameFree(name: string): Promise<boolean> {
  const mine = getAuth().currentUser?.uid;
  const v = (await get(ref(db(), `usernames/${name}`))).val();
  return v == null || v === mine;
}

async function claimUsername(name: string, uid: string): Promise<boolean> {
  const res = await runTransaction(ref(db(), `usernames/${name}`), (cur: any) => (cur == null || cur === uid ? uid : undefined));
  return res.committed;
}

const claiming = new Set<string>();
/** Gives a reader who has no username yet one made from their email (or name), with a number added if it is taken. */
export async function ensureUsername(uid: string, seed: string) {
  if (claiming.has(uid)) return;
  claiming.add(uid);
  try {
    let base = seed.toLowerCase().replace(/[^a-z0-9_.]/g, '').replace(/^[._]+|[._]+$/g, '').slice(0, 14);
    if (base.length < 3) base = (base + 'reader').slice(0, 8);
    for (let i = 0; i < 6; i++) {
      const name = i === 0 ? base : `${base}${Math.floor(100 + Math.random() * 900)}`;
      if (await claimUsername(name, uid)) {
        await update(ref(db(), `users/${uid}`), { username: name });
        return;
      }
    }
  } catch {} finally { claiming.delete(uid); }
}

export interface ProfileInput { name: string; username: string; bio: string; gender: Gender | null }

/** Saves name, username, bio and gender. A new username is claimed first, the old one is let go after the save. */
export async function saveMyProfile(p: ProfileInput) {
  const u = getAuth().currentUser;
  if (!u) throw new Error('Sign in first.');
  const name = p.name.trim().slice(0, 40);
  if (!name) throw new Error('Write your name.');
  const username = cleanUsername(p.username);
  const bad = usernameProblem(username);
  if (bad) throw new Error(bad);

  const before = ((await get(ref(db(), `users/${u.uid}/username`))).val() as string | null) ?? '';
  if (before !== username && !(await claimUsername(username, u.uid))) throw new Error('That username is already taken. Try another one.');

  await update(ref(db(), `users/${u.uid}`), { name, username, bio: p.bio.trim().slice(0, 160), ...(p.gender ? { gender: p.gender } : {}) });

  if (before && before !== username) {
    try { if ((await get(ref(db(), `usernames/${before}`))).val() === u.uid) await remove(ref(db(), `usernames/${before}`)); } catch {}
  }
}

/** Stores the reader's gender on their profile so it follows them to a new phone. Skipped for guests. */
export async function saveMyGender(g: Gender) {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return;
  try { await update(ref(db(), `users/${uid}`), { gender: g }); } catch {}
}

// ---------- posts ----------
const toPost = (id: string, v: any, visibility: Visibility = 'public'): Post | null => {
  if (!v || typeof v !== 'object' || !v.story || typeof v.story.title !== 'string') return null;
  const st = v.story as Story;
  return {
    id,
    creatorUid: v.creatorUid ?? '',
    creatorName: v.creatorName || st.creatorName || 'Reader',
    creatorUsername: v.creatorUsername || undefined,
    creatorAvatar: v.creatorAvatar || undefined,
    createdAt: v.createdAt ?? 0,
    caption: v.caption || '',
    likeCount: v.likeCount ?? 0,
    featured: v.featured === true,
    visibility,
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

const toList = (val: Record<string, any> | null, visibility: Visibility = 'public'): Post[] =>
  Object.entries(val ?? {}).map(([id, v]) => toPost(id, v, visibility)).filter((p): p is Post => !!p).sort((a, b) => b.createdAt - a.createdAt);

/** Puts each creator's current name, @username and picture on their posts (a post only stores a copy from the day it was made). */
async function withCreators(list: Post[]): Promise<Post[]> {
  const uids = Array.from(new Set(list.map((p) => p.creatorUid).filter(Boolean)));
  const found = new Map<string, PublicUser>();
  await Promise.all(uids.map(async (id) => { try { found.set(id, await readUser(id)); } catch {} }));
  return list.map((p) => {
    const c = found.get(p.creatorUid);
    return c ? { ...p, creatorName: c.name, creatorUsername: c.username ?? p.creatorUsername, creatorAvatar: c.avatarUrl ?? p.creatorAvatar } : p;
  });
}

/** The newest public posts, newest first. */
export async function fetchPosts(limit = 30): Promise<Post[]> {
  const snap = await get(query(ref(db(), 'posts'), orderByChild('createdAt'), limitToLast(limit)));
  return withCreators(toList(snap.val()));
}

/** A reader's public posts. */
export async function fetchUserPosts(uid: string): Promise<Post[]> {
  const snap = await get(query(ref(db(), 'posts'), orderByChild('creatorUid'), equalTo(uid)));
  return withCreators(toList(snap.val()));
}

/** My private posts. They live under private/<my uid>, which only I can read. */
export async function fetchMyPrivatePosts(): Promise<Post[]> {
  const uid = getAuth().currentUser?.uid;
  if (!uid) return [];
  const snap = await get(ref(db(), `private/${uid}`));
  return withCreators(toList(snap.val(), 'private'));
}

export async function createPost(story: Story, caption: string, visibility: Visibility = 'public'): Promise<Post> {
  const u = getAuth().currentUser;
  if (!u) throw new Error('Sign in to post a story.');
  const me = await fetchUser(u.uid);
  const base = visibility === 'private' ? `private/${u.uid}` : 'posts';
  const key = push(ref(db(), base)).key!;
  const now = Date.now();
  const storyId = `${story.id.replace(/[^a-z0-9-]/gi, '').toLowerCase().slice(0, 40) || 'story'}-${key.slice(-5).toLowerCase()}`;
  const full: Story = {
    ...story, id: storyId, creatorName: me.name, creatorUid: u.uid, fromCommunity: true, postId: key,
    createdAt: now, likeCount: 0, playCount: 0,
  };
  const post = {
    creatorUid: u.uid, creatorName: me.name, creatorUsername: me.username ?? '', creatorAvatar: me.avatarUrl ?? u.photoURL ?? '',
    createdAt: now, caption: caption.trim().slice(0, 200), story: full, likeCount: 0, featured: false,
  };
  await set(ref(db(), `${base}/${key}`), clean(post));
  return toPost(key, post, visibility)!;
}

/** Owner only: moves a post between Public (Community) and Private (only me). Going private also takes it off the Home page. */
export async function setPostVisibility(post: Post, to: Visibility) {
  const uid = getAuth().currentUser?.uid;
  if (!uid || post.creatorUid !== uid) throw new Error('Only the owner can change this.');
  if ((post.visibility ?? 'public') === to) return;
  const body = clean({
    creatorUid: post.creatorUid, creatorName: post.creatorName, creatorUsername: post.creatorUsername ?? '', creatorAvatar: post.creatorAvatar ?? '',
    createdAt: post.createdAt, caption: post.caption ?? '', story: post.story, likeCount: post.likeCount, featured: false,
  });
  const from = to === 'private' ? `posts/${post.id}` : `private/${uid}/${post.id}`;
  const dest = to === 'private' ? `private/${uid}/${post.id}` : `posts/${post.id}`;
  await update(ref(db()), { [from]: null, [dest]: body, ...(to === 'private' ? { [`stories/${post.story.id}`]: null } : {}) });
}

/** Creator or admin removes a post. A story that was on the Home page goes away with it. */
export async function deletePost(post: Post) {
  if (post.visibility === 'private') {
    await update(ref(db()), { [`private/${post.creatorUid}/${post.id}`]: null });
    return;
  }
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
