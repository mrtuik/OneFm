import * as FS from 'expo-file-system/legacy';
import { requireNativeModule } from 'expo';
import { Lang } from '../types';

/**
 * Voice engine. The app talks only to this file.
 * Runs sherpa-onnx text-to-speech fully on the phone through the local native module
 * `modules/onefm-voice` (same design as the SHEETMD sheet-tts module).
 * A voice is a model archive from the sherpa-onnx `tts-models` release. It is downloaded once,
 * extracted into the app's private storage, and then works offline.
 */

export interface VoiceInfo {
  /** Model name in the sherpa-onnx tts-models release (also the folder name on the phone). */
  id: string;
  name: string;
  lang: Lang;
  /** Download size in MB (about). */
  sizeMB: number;
  /** Speaker number inside the model. */
  sid: number;
}

const RELEASE = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models';
export const voiceUrl = (id: string) => `${RELEASE}/${id}.tar.bz2`;

// First voice of each language is the default. Hindi and Bangla voices are trained on native script,
// which is why every AI reply carries a speech_text field in Devanagari or Bengali script.
export const VOICES: VoiceInfo[] = [
  { id: 'vits-piper-en_US-lessac-medium', name: 'Lessac (female)', lang: 'en', sizeMB: 64, sid: 0 },
  { id: 'vits-piper-en_US-ryan-medium', name: 'Ryan (male)', lang: 'en', sizeMB: 64, sid: 0 },
  { id: 'vits-piper-hi_IN-priyamvada-medium', name: 'Priyamvada (female)', lang: 'hi', sizeMB: 64, sid: 0 },
  { id: 'vits-piper-hi_IN-pratham-medium', name: 'Pratham (male)', lang: 'hi', sizeMB: 64, sid: 0 },
  { id: 'vits-piper-hi_IN-rohan-medium', name: 'Rohan (male)', lang: 'hi', sizeMB: 64, sid: 0 },
  { id: 'vits-coqui-bn-custom_female', name: 'Bangla (female)', lang: 'bn', sizeMB: 103, sid: 0 },
  { id: 'vits-mimic3-bn-multi_low', name: 'Bangla (multi voice)', lang: 'bn', sizeMB: 76, sid: 0 },
];

export const voicesFor = (lang: Lang) => VOICES.filter((v) => v.lang === lang);

/** The chosen voice if it belongs to this language, otherwise the first voice of the language. */
export function resolveVoice(lang: Lang, voiceId?: string): VoiceInfo {
  const list = voicesFor(lang);
  return list.find((v) => v.id === voiceId) ?? list[0];
}

// ---- Native module (null in Expo Go or a build without the module) ----
const Native: any = (() => {
  try { return requireNativeModule('OneFmVoice'); } catch { return null; }
})();

const ROOT = () => `${FS.documentDirectory}voices/`;
const dirOf = (id: string) => `${ROOT()}${id}/`;
const partOf = (id: string) => `${ROOT()}${id}.tar.bz2.part`;
// Kotlin's java.io.File needs a plain path, not a file:// URI
const np = (uri: string) => uri.replace(/^file:\/\//, '');

// ---- Download state (shared by the chip, Profile and Chat) ----
export type VoiceState = 'unknown' | 'missing' | 'downloading' | 'ready';
export interface VoiceStatus { state: VoiceState; percent: number; error?: string; phase?: string }
const UNKNOWN: VoiceStatus = { state: 'unknown', percent: 0 };

const statuses = new Map<string, VoiceStatus>();
const statusListeners = new Set<() => void>();
const setStatus = (id: string, st: VoiceStatus) => { statuses.set(id, st); statusListeners.forEach((l) => l()); };

export const getVoiceStatus = (id: string): VoiceStatus => statuses.get(id) ?? UNKNOWN;
export const subscribeVoiceStatus = (l: () => void) => { statusListeners.add(l); return () => { statusListeners.delete(l); }; };

const existsOnDisk = async (id: string): Promise<boolean> => {
  try { return (await FS.getInfoAsync(`${dirOf(id)}tokens.txt`)).exists; } catch { return false; }
};

/** Looks on disk and updates the status. Safe to call often. */
export async function refreshVoiceStatus(id: string): Promise<VoiceStatus> {
  if (getVoiceStatus(id).state === 'downloading') return getVoiceStatus(id);
  const ok = await existsOnDisk(id);
  const prev = getVoiceStatus(id);
  setStatus(id, { state: ok ? 'ready' : 'missing', percent: ok ? 100 : 0, error: ok ? undefined : prev.error });
  return getVoiceStatus(id);
}

export async function isVoiceReady(lang: Lang, voiceId?: string): Promise<boolean> {
  const v = resolveVoice(lang, voiceId);
  return (await refreshVoiceStatus(v.id)).state === 'ready';
}

const fail = (id: string, msg: string) => { setStatus(id, { state: 'missing', percent: 0, error: msg }); return false; };

export async function downloadVoice(id: string): Promise<boolean> {
  if (getVoiceStatus(id).state === 'downloading') return false;
  if (!Native?.extractTarBz2) return fail(id, 'This build has no voice engine. Install the latest APK.');
  const v = VOICES.find((x) => x.id === id);
  if (!v) return fail(id, 'Unknown voice.');

  setStatus(id, { state: 'downloading', percent: 0, phase: 'Downloading' });
  try {
    await FS.makeDirectoryAsync(ROOT(), { intermediates: true }).catch(() => {});
    await FS.deleteAsync(partOf(id), { idempotent: true }).catch(() => {});

    let ok = false;
    let err = '';
    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      try {
        const total = v.sizeMB * 1024 * 1024;
        const job = FS.createDownloadResumable(voiceUrl(id), partOf(id), {}, (p) => {
          const t = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : total;
          const pct = Math.max(0, Math.min(95, Math.round((p.totalBytesWritten / t) * 95)));
          setStatus(id, { state: 'downloading', percent: pct, phase: 'Downloading' });
        });
        const r: any = await job.downloadAsync();
        if (r && r.status === 200) ok = true;
        else err = `Download failed (HTTP ${r?.status ?? '?'}). Check your internet and try again.`;
      } catch (e: any) {
        err = `Download failed: ${String(e?.message ?? e)}`;
      }
      if (!ok) await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
    if (!ok) { await FS.deleteAsync(partOf(id), { idempotent: true }).catch(() => {}); return fail(id, err); }

    const info: any = await FS.getInfoAsync(partOf(id));
    if (!info?.exists || (info.size ?? 0) < 1_000_000) {
      await FS.deleteAsync(partOf(id), { idempotent: true }).catch(() => {});
      return fail(id, 'The downloaded file is damaged. Try again.');
    }

    setStatus(id, { state: 'downloading', percent: 97, phase: 'Preparing' });
    let extracted = false;
    try { extracted = await Native.extractTarBz2(np(partOf(id)), np(dirOf(id))); } catch { extracted = false; }
    await FS.deleteAsync(partOf(id), { idempotent: true }).catch(() => {});
    if (!extracted || !(await existsOnDisk(id))) {
      await FS.deleteAsync(dirOf(id), { idempotent: true }).catch(() => {});
      return fail(id, 'Could not unpack the voice. Try again.');
    }
    setStatus(id, { state: 'ready', percent: 100 });
    return true;
  } catch (e: any) {
    return fail(id, String(e?.message ?? e));
  }
}

export async function removeVoice(id: string) {
  if (loadedId === id) { loadedId = null; try { Native?.release(); } catch { /* ignore */ } }
  await FS.deleteAsync(dirOf(id), { idempotent: true }).catch(() => {});
  setStatus(id, { state: 'missing', percent: 0 });
}

// ---- One model in memory at a time (a model is 60 to 100 MB of RAM) ----
let loadedId: string | null = null;

let loading: { id: string; p: Promise<void> } | null = null;

async function ensureLoaded(voice: VoiceInfo): Promise<void> {
  if (!Native) throw new Error('This build has no voice engine. Install the latest APK.');
  if (loading && loading.id !== voice.id) await loading.p.catch(() => {});
  if (loadedId === voice.id && Native.isReady()) return;
  // Warm-up and play share one load: the model is never started twice.
  if (loading && loading.id === voice.id) return loading.p;
  const p = (async () => {
    loadedId = null;
    const ok = await Native.init(np(dirOf(voice.id)));
    if (!ok) throw new Error('The voice could not start. Remove it and download it again.');
    loadedId = voice.id;
  })();
  loading = { id: voice.id, p };
  p.then(() => { if (loading?.p === p) loading = null; }, () => { if (loading?.p === p) loading = null; });
  return p;
}

/** Loads the voice model in the background (it takes several seconds) so the first message starts fast. */
export async function warmVoice(lang: Lang, voiceId?: string): Promise<void> {
  try {
    const v = resolveVoice(lang, voiceId);
    if ((await refreshVoiceStatus(v.id)).state !== 'ready') return;
    if (state.id) return; // something is playing: do not disturb it
    await ensureLoaded(v);
  } catch { /* the real error shows when the voice is played */ }
}

// ---- One player for the whole app: only one message speaks at a time ----
export interface PlayState { id: string | null; loading: boolean }
type Listener = (s: PlayState) => void;
let state: PlayState = { id: null, loading: false };
const listeners = new Set<Listener>();
const emit = (next: PlayState) => { state = next; listeners.forEach((l) => l(state)); };

export const subscribePlaying = (l: Listener) => { listeners.add(l); l(state); return () => { listeners.delete(l); }; };
export const nowPlaying = () => state.id;

let token = 0;
let jobCounter = 0;
let activeJob = -1;
let lastError: string | null = null;
export const lastVoiceError = () => lastError;

const idle = () => emit({ id: null, loading: false });

// ---- Voice problem shown under the voice chip of the message that failed ----
let voiceError: { id: string; message: string } | null = null;
let activeMsg: string | null = null;
const errorListeners = new Set<() => void>();

// ---- Timing numbers shown under the voice (where the waiting time goes) ----
let infoFor: { id: string; text: string } | null = null;
let callAt = 0;
let loadMs = 0;
let firstMs = 0;
export const getVoiceInfo = (id: string): string | null => (infoFor && infoFor.id === id ? infoFor.text : null);
const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
export const getVoiceError = (id: string): string | null => (voiceError && voiceError.id === id ? voiceError.message : null);
export const subscribeVoiceError = (l: () => void) => { errorListeners.add(l); return () => { errorListeners.delete(l); }; };
const setVoiceError = (id: string | null, message: string | null) => {
  voiceError = id && message ? { id, message } : null;
  errorListeners.forEach((l) => l());
};

if (Native?.addListener) {
  Native.addListener('onStart', ({ id }: { id: number }) => { if (id === activeJob && state.id) { firstMs = Date.now() - callAt; emit({ id: state.id, loading: false }); } });
  Native.addListener('onInfo', ({ id, gen, audio, raw, peak }: { id: number; gen: number; audio: number; raw: number; peak: number }) => {
    if (id !== activeJob || !activeMsg) return;
    infoFor = { id: activeMsg, text: `model ${loadMs ? sec(loadMs) : 'ready'} · first sound ${sec(firstMs)} · ${audio.toFixed(1)}s audio made in ${sec(gen)} · level ${raw.toFixed(3)} to ${peak.toFixed(2)}` };
    errorListeners.forEach((l) => l());
  });
  Native.addListener('onDone', ({ id }: { id: number }) => { if (id === activeJob) { activeJob = -1; idle(); } });
  Native.addListener('onStopped', ({ id }: { id: number }) => { if (id === activeJob) { activeJob = -1; idle(); } });
  Native.addListener('onError', ({ id, message }: { id: number; message: string }) => {
    if (id === activeJob) { activeJob = -1; lastError = message || 'Voice failed.'; if (activeMsg) setVoiceError(activeMsg, lastError); idle(); }
  });
}

export function stopSpeaking() {
  token++;
  activeJob = -1;
  try { Native?.stop(); } catch { /* ignore */ }
  idle();
}

/** Short stable key for a message voice: the same voice and text always map to the same saved audio file. */
function cacheKeyOf(voiceId: string, text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${voiceId}_v4_${h.toString(36)}_${text.length}`;
}

/** Speaks `text` (native script for Bangla and Hindi). Call downloadVoice first. */
export function speak(id: string, text: string, lang: Lang, voiceId?: string) {
  const my = ++token;
  const voice = resolveVoice(lang, voiceId);
  callAt = Date.now(); loadMs = 0; firstMs = 0; infoFor = null;
  lastError = null;
  activeMsg = id;
  setVoiceError(null, null);
  try { Native?.stop(); } catch { /* ignore */ }
  activeJob = -1;

  // Hindi and Bangla voices read only native script. English letters would come out as silence, so say so.
  if (lang !== 'en') {
    const latin = (text.match(/[A-Za-z]/g) ?? []).length;
    const native = (text.match(/[\u0900-\u097F\u0980-\u09FF]/g) ?? []).length;
    if (latin > native) {
      lastError = 'The voice text came out in English letters, so this voice cannot read it. Tap Abar to write the reply again.';
      setVoiceError(id, lastError);
      idle();
      return;
    }
  }
  emit({ id, loading: true });

  const key = cacheKeyOf(voice.id, text);
  (async () => {
    // A message that was played before is saved as audio: no model needed, it starts at once.
    let cached = false;
    try { cached = !!Native?.hasCache?.(key); } catch { cached = false; }
    if (!cached) { const l0 = Date.now(); await ensureLoaded(voice); loadMs = Date.now() - l0 < 50 ? 0 : Date.now() - l0; }
    if (my !== token) return;
    activeJob = ++jobCounter;
    Native.speak(activeJob, text, 1.0, voice.sid, key);
  })().catch((e: any) => {
    if (my !== token) return;
    lastError = String(e?.message ?? e);
    setVoiceError(id, lastError);
    idle();
  });
}

/** Rough length of a spoken text, for the duration label on the voice chip. */
export function estimateSeconds(text: string): number {
  return Math.max(2, Math.round(text.replace(/\s+/g, ' ').length / 14));
}
