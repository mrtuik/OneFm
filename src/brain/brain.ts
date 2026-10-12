// The "brain": story knowledge the app learns from.
// Admin adds novels (as text) -> they are stored in Realtime Database in small pages (brain/sources, brain/pages).
// Now and then the app reads 2 or 3 pages, asks the AI for craft lessons (technique only, no copied text),
// and saves them in brain/lessons. Every story chat then gets a few of those lessons in its prompt.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase, ref, get, set, update, push, remove, increment } from '@react-native-firebase/database';
import { chatCompletion, ProviderSettings } from '../ai/provider';
import { Lang } from '../types';

const db = () => getDatabase();
export const PAGE_CHARS = 1800;
const MAX_LESSONS = 60;
const PROMPT_LESSONS = 8;
const STUDY_EVERY_MS = 4 * 3600 * 1000;
const CACHE_KEY = 'onefm.brain.lessons.v1';
const LAST_KEY = 'onefm.brain.lastStudy';

export interface Source { id: string; title: string; language: Lang; pageCount: number; charCount: number; addedAt: number; studyCount: number; lastStudiedAt?: number }
export interface Lesson { id: string; text: string; tag: string; scope: 'all' | Lang; sourceTitle?: string; createdAt: number }

// ---------- lessons in memory (used by the story prompt) ----------
let LESSONS: Lesson[] = [];
const SESSION = Math.random().toString(36).slice(2);
const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

/** A short block for the master prompt. Empty when nothing was learned yet. Always safe to call. */
export function brainBlock(lang: Lang): string {
  const pool = LESSONS.filter((l) => l.scope === 'all' || l.scope === lang);
  if (!pool.length) return '';
  const picked = [...pool].sort((a, b) => hash(a.id + SESSION) - hash(b.id + SESSION)).slice(0, PROMPT_LESSONS);
  return `\n\n# CRAFT NOTES (techniques learned from studying published serial stories. Use the technique, never copy any text, names or plot)\n${picked.map((l) => `- ${l.text}`).join('\n')}`;
}

const toLessons = (v: Record<string, any> | null): Lesson[] =>
  Object.entries(v ?? {})
    .filter(([, x]) => x && typeof x.text === 'string')
    .map(([id, x]) => ({ id, text: x.text, tag: x.tag ?? 'craft', scope: x.scope ?? 'all', sourceTitle: x.sourceTitle, createdAt: x.createdAt ?? 0 }))
    .sort((a, b) => b.createdAt - a.createdAt);

/** The admin bumps this number every time lessons change. Every phone checks it (a tiny read) when the app opens. */
async function remoteVersion(): Promise<number | null> {
  const v = (await get(ref(db(), 'brain/meta/updatedAt'))).val();
  return typeof v === 'number' ? v : null;
}
const touch = () => set(ref(db(), 'brain/meta/updatedAt'), Date.now()).catch(() => {});
const saveCache = (items: Lesson[], ver: number | null) =>
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), ver, items })).catch(() => {});

export async function fetchLessons(): Promise<Lesson[]> {
  const ver = await remoteVersion().catch(() => null);
  const list = toLessons((await get(ref(db(), 'brain/lessons'))).val());
  LESSONS = list;
  saveCache(list, ver);
  return list;
}

/**
 * Loads the lessons from the phone's cache at once. Then it asks the database for the lesson version number:
 * when the admin changed anything, the new lessons are downloaded now. Without that number the cache is refreshed every 12 hours.
 */
export async function warmBrain() {
  try {
    let cached: { at?: number; ver?: number | null } = {};
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (Array.isArray(c.items)) LESSONS = c.items;
      cached = c;
    }
    const ver = await remoteVersion();
    if (ver !== null) {
      if (cached.ver !== ver) await fetchLessons();
    } else if (Date.now() - (cached.at ?? 0) > 12 * 3600 * 1000) {
      await fetchLessons();
    }
  } catch {}
}

/** Admin: write a lesson by hand. It reaches every phone the next time the app opens. */
export async function addLesson(text: string, scope: 'all' | Lang): Promise<Lesson> {
  const t = text.trim();
  if (t.length < 20 || t.length > 260) throw new Error('A lesson needs 20 to 260 characters.');
  const node = { text: t, tag: 'manual', scope, sourceTitle: 'Added by admin', createdAt: Date.now() };
  const k = push(ref(db(), 'brain/lessons'));
  await set(k, node);
  await touch();
  const lesson: Lesson = { id: k.key!, ...node };
  LESSONS = [lesson, ...LESSONS];
  saveCache(LESSONS, null);
  return lesson;
}

export async function deleteLesson(id: string) {
  await remove(ref(db(), `brain/lessons/${id}`));
  await touch();
  LESSONS = LESSONS.filter((l) => l.id !== id);
  saveCache(LESSONS, null);
}

// ---------- sources ----------
/** Cuts a long text into pages of about PAGE_CHARS, always at a paragraph or sentence end. */
export function splitPages(text: string): string[] {
  const paras = text.replace(/\r/g, '').split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const pages: string[] = [];
  let cur = '';
  const push_ = () => { if (cur.trim()) pages.push(cur.trim()); cur = ''; };
  for (const p of paras) {
    if (p.length > PAGE_CHARS) {
      const sentences = p.match(/[^.!?\u0964]+[.!?\u0964]*\s*/g) ?? [p];
      for (const s of sentences) { if (cur.length + s.length > PAGE_CHARS) push_(); cur += s; }
      cur += '\n';
      continue;
    }
    if (cur.length + p.length > PAGE_CHARS) push_();
    cur += p + '\n';
  }
  push_();
  return pages;
}

export async function listSources(): Promise<Source[]> {
  const v = (await get(ref(db(), 'brain/sources'))).val() as Record<string, any> | null;
  return Object.entries(v ?? {}).map(([id, x]) => ({
    id, title: x.title ?? 'Untitled', language: x.language ?? 'bn', pageCount: x.pageCount ?? 0, charCount: x.charCount ?? 0,
    addedAt: x.addedAt ?? 0, studyCount: x.studyCount ?? 0, lastStudiedAt: x.lastStudiedAt,
  })).sort((a, b) => b.addedAt - a.addedAt);
}

export async function addSource(input: { title: string; language: Lang; text: string }, onProgress?: (done: number, total: number) => void): Promise<Source> {
  const pages = splitPages(input.text);
  if (pages.length < 2) throw new Error('The text is too short. Add at least a few pages of the novel.');
  const id = push(ref(db(), 'brain/sources')).key!;
  const meta = { title: input.title.trim().slice(0, 80) || 'Untitled', language: input.language, pageCount: pages.length, charCount: input.text.length, addedAt: Date.now(), studyCount: 0 };
  // Pages first, then the source entry, so a half-written source never shows up in the list.
  const BATCH = 60;
  for (let i = 0; i < pages.length; i += BATCH) {
    const obj: Record<string, string> = {};
    pages.slice(i, i + BATCH).forEach((p, k) => { obj[`p${i + k}`] = p; });
    await update(ref(db(), `brain/pages/${id}`), obj);
    onProgress?.(Math.min(pages.length, i + BATCH), pages.length);
  }
  await set(ref(db(), `brain/sources/${id}`), meta);
  return { id, ...meta };
}

export async function deleteSource(id: string) {
  await update(ref(db()), { [`brain/sources/${id}`]: null, [`brain/pages/${id}`]: null });
}

// ---------- studying ----------
const words = (s: string) => s.toLowerCase().split(/[^a-z0-9\u0980-\u09ff\u0900-\u097f]+/).filter((w) => w.length > 2);
function overlap(a: string, b: string) {
  const A = new Set(words(a)); const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let hit = 0; A.forEach((w) => { if (B.has(w)) hit++; });
  return hit / Math.min(A.size, B.size);
}

const LANG_NAME: Record<Lang, string> = { en: 'English', bn: 'Bangla', hi: 'Hindi' };
const STUDY_SYSTEM = 'You are a fiction editor who studies published serial stories and writes short, reusable craft lessons for another writer. Reply with JSON only, no markdown.';
const studyPrompt = (title: string, lang: Lang, pages: string, known: string[]) =>
  `These are ${pages.split('\n\n').length} consecutive pages from a published ${LANG_NAME[lang]} serial story ("${title}").

Find 3 or 4 specific techniques that make these pages work: how scenes open, pacing, dialogue rhythm, subtext, small physical detail, how a hook is built, how emotion is shown, how natural spoken ${lang === 'en' ? 'English' : lang === 'bn' ? 'Bangla/Banglish' : 'Hindi/Hinglish'} phrasing sounds.

Rules for each lesson:
- One instruction, written as advice to a writer ("Open a scene with...", "Let a character answer a question with..."), 20 to 220 characters.
- Describe the TECHNIQUE only. Never quote a sentence from the pages, never use any character name, place or plot detail from them.
- It must be useful for any story, not only this one.
- Do not repeat these lessons we already have: ${known.length ? known.join(' | ') : '(none yet)'}

Output JSON only: {"lessons":[{"text":"","tag":"dialogue|pacing|hook|voice|detail|emotion|language","scope":"all|language"}]}
Use scope "language" only for lessons about how words and sentences sound in ${LANG_NAME[lang]}. Everything else is "all".

PAGES:
${pages}`;

export interface StudyResult { added: Lesson[]; source: string; pages: number }

/** Reads 2 or 3 pages of one source and saves new lessons. Throws a readable error when it cannot. */
export async function studyOnce(cfg: ProviderSettings, apiKey: string): Promise<StudyResult> {
  const sources = (await listSources()).filter((s) => s.pageCount >= 2);
  if (!sources.length) throw new Error('Add a source (a novel) first.');
  // Sources studied less often are chosen more often.
  const weights = sources.map((s) => 1 / (1 + s.studyCount));
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  let src = sources[0];
  for (let i = 0; i < sources.length; i++) { r -= weights[i]; if (r <= 0) { src = sources[i]; break; } }

  const count = Math.min(src.pageCount, Math.random() < 0.5 ? 2 : 3);
  const start = Math.floor(Math.random() * (src.pageCount - count + 1));
  const snaps = await Promise.all(Array.from({ length: count }, (_, i) => get(ref(db(), `brain/pages/${src.id}/p${start + i}`))));
  const text = snaps.map((s) => (typeof s.val() === 'string' ? (s.val() as string) : '')).filter(Boolean).join('\n\n');
  if (text.length < 300) throw new Error('Could not read the pages of this source.');

  const known = LESSONS.filter((l) => l.scope === 'all' || l.scope === src.language).slice(0, 14).map((l) => l.text);
  const raw = await chatCompletion({
    cfg, apiKey, model: cfg.model, json: true, maxTokens: 700, temperature: 0.3,
    messages: [{ role: 'system', content: STUDY_SYSTEM }, { role: 'user', content: studyPrompt(src.title, src.language, text, known) }],
  });
  const a = raw.indexOf('{'); const b = raw.lastIndexOf('}');
  let list: any[] = [];
  try { list = JSON.parse(raw.slice(a, b + 1)).lessons ?? []; } catch { throw new Error('The AI answer could not be read. Try again.'); }

  const added: Lesson[] = [];
  const have = [...LESSONS.map((l) => l.text)];
  for (const x of list) {
    const t = typeof x?.text === 'string' ? x.text.trim() : '';
    if (t.length < 20 || t.length > 260) continue;
    if (have.some((h) => overlap(h, t) >= 0.6)) continue;
    const scope: Lesson['scope'] = x.scope === 'language' ? src.language : 'all';
    const node = { text: t, tag: typeof x.tag === 'string' ? x.tag.slice(0, 20) : 'craft', scope, sourceTitle: src.title, createdAt: Date.now() };
    const k = push(ref(db(), 'brain/lessons'));
    await set(k, node);
    added.push({ id: k.key!, ...node });
    have.push(t);
  }
  await update(ref(db(), `brain/sources/${src.id}`), { studyCount: increment(1), lastStudiedAt: Date.now() });
  AsyncStorage.setItem(LAST_KEY, String(Date.now())).catch(() => {});

  // Keep the list small: the oldest lessons go first.
  if (added.length) await touch();
  const all = await fetchLessons();
  if (all.length > MAX_LESSONS) {
    const drop = all.slice(MAX_LESSONS);
    await update(ref(db()), Object.fromEntries(drop.map((l) => [`brain/lessons/${l.id}`, null])));
    await touch();
    LESSONS = all.slice(0, MAX_LESSONS);
  }
  return { added, source: src.title, pages: count };
}

/** Called when the admin opens the app. Studies at most once every few hours, silently. */
export async function maybeStudy(cfg: ProviderSettings, apiKey: string) {
  try {
    if (!apiKey) return;
    const last = Number((await AsyncStorage.getItem(LAST_KEY)) ?? 0);
    if (Date.now() - last < STUDY_EVERY_MS) return;
    await AsyncStorage.setItem(LAST_KEY, String(Date.now()));
    await studyOnce(cfg, apiKey);
  } catch {}
}
