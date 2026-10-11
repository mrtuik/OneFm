import { Lang } from '../types';
import { createStreamingTTS, type StreamingTtsEngine, type TtsStreamController } from 'react-native-sherpa-onnx/tts';
import { ModelCategory, deleteModel, ensureModel, getModelPath } from 'react-native-sherpa-onnx/download';

/**
 * Voice engine. The app talks only to this file.
 * It runs sherpa-onnx text-to-speech fully on the phone. A voice is a model that is
 * downloaded once (Profile > Voice, or the first time you tap a voice chip) and then works offline.
 * The device's own text-to-speech voices are not used.
 */

export interface VoiceInfo {
  /** Model id in the sherpa-onnx tts-models release. */
  id: string;
  name: string;
  lang: Lang;
  /** Download size in MB (about). */
  sizeMB: number;
  /** Speaker number inside the model. */
  sid: number;
}

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

// ---- Download state (shared by the chip, Profile and Chat) ----
export type VoiceState = 'unknown' | 'missing' | 'downloading' | 'ready';
export interface VoiceStatus { state: VoiceState; percent: number; error?: string }
const UNKNOWN: VoiceStatus = { state: 'unknown', percent: 0 };

const statuses = new Map<string, VoiceStatus>();
const statusListeners = new Set<() => void>();
const setStatus = (id: string, st: VoiceStatus) => { statuses.set(id, st); statusListeners.forEach((l) => l()); };

export const getVoiceStatus = (id: string): VoiceStatus => statuses.get(id) ?? UNKNOWN;
export const subscribeVoiceStatus = (l: () => void) => { statusListeners.add(l); return () => { statusListeners.delete(l); }; };

/** Looks on disk and updates the status. Safe to call often. */
export async function refreshVoiceStatus(id: string): Promise<VoiceStatus> {
  if (getVoiceStatus(id).state === 'downloading') return getVoiceStatus(id);
  try {
    const path = await getModelPath(ModelCategory.Tts, id);
    setStatus(id, { state: path ? 'ready' : 'missing', percent: path ? 100 : 0 });
  } catch {
    setStatus(id, { state: 'missing', percent: 0 });
  }
  return getVoiceStatus(id);
}

export async function isVoiceReady(lang: Lang, voiceId?: string): Promise<boolean> {
  const v = resolveVoice(lang, voiceId);
  return (await refreshVoiceStatus(v.id)).state === 'ready';
}

export async function downloadVoice(id: string): Promise<boolean> {
  if (getVoiceStatus(id).state === 'downloading') return false;
  setStatus(id, { state: 'downloading', percent: 0 });
  try {
    await ensureModel(ModelCategory.Tts, id, {
      onProgress: (p: { percent?: number }) => {
        const pct = Math.max(0, Math.min(99, Math.round(p?.percent ?? 0)));
        setStatus(id, { state: 'downloading', percent: pct });
      },
    });
    setStatus(id, { state: 'ready', percent: 100 });
    return true;
  } catch (e: any) {
    setStatus(id, { state: 'missing', percent: 0, error: String(e?.message ?? e) });
    return false;
  }
}

export async function removeVoice(id: string) {
  if (loaded?.id === id) await unloadEngine();
  try { await deleteModel(ModelCategory.Tts, id); } catch { /* already gone */ }
  setStatus(id, { state: 'missing', percent: 0 });
}

// ---- One engine in memory at a time (a model is 60 to 100 MB of RAM) ----
let loaded: { id: string; tts: StreamingTtsEngine } | null = null;
let loading: Promise<StreamingTtsEngine> | null = null;
let loadingId: string | null = null;

async function unloadEngine() {
  const old = loaded;
  loaded = null;
  if (old) { try { await old.tts.destroy(); } catch { /* ignore */ } }
}

async function getEngine(voice: VoiceInfo): Promise<StreamingTtsEngine> {
  if (loaded?.id === voice.id) return loaded.tts;
  if (loading && loadingId === voice.id) return loading;
  // Wait for a load of another voice, then replace it.
  if (loading) { try { await loading; } catch { /* ignore */ } }
  loadingId = voice.id;
  loading = (async () => {
    const path = await getModelPath(ModelCategory.Tts, voice.id);
    if (!path) throw new Error('Voice is not downloaded.');
    await unloadEngine();
    const tts = await createStreamingTTS({
      modelPath: { type: 'file', path },
      modelType: 'auto',
      numThreads: 2,
    });
    loaded = { id: voice.id, tts };
    return tts;
  })();
  try { return await loading; } finally { loading = null; loadingId = null; }
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
let active: { tts: StreamingTtsEngine; controller: TtsStreamController | null } | null = null;
let lastError: string | null = null;
export const lastVoiceError = () => lastError;

async function haltPlayer() {
  const a = active;
  active = null;
  if (!a) return;
  try { await a.controller?.cancel(); } catch { /* ignore */ }
  try { await a.tts.stopPcmPlayer(); } catch { /* ignore */ }
}

export function stopSpeaking() {
  token++;
  emit({ id: null, loading: false });
  haltPlayer();
}

/** Speaks `text` (native script for Bangla and Hindi). Downloads nothing: call downloadVoice first. */
export function speak(id: string, text: string, lang: Lang, voiceId?: string) {
  const my = ++token;
  const voice = resolveVoice(lang, voiceId);
  lastError = null;
  emit({ id, loading: true });
  const finish = () => { if (my === token) emit({ id: null, loading: false }); };

  (async () => {
    await haltPlayer();
    if (my !== token) return;
    const tts = await getEngine(voice);
    if (my !== token) return;
    const sampleRate = await tts.getSampleRate();
    await tts.startPcmPlayer(sampleRate, 1);
    if (my !== token) { await tts.stopPcmPlayer(); return; }
    active = { tts, controller: null };
    let first = true;
    const controller = await tts.generateSpeechStream(text, { sid: voice.sid, speed: 1.0 }, {
      onChunk: (chunk: { samples: number[] }) => {
        if (my !== token) return;
        if (first) { first = false; emit({ id, loading: false }); }
        if (chunk.samples.length > 0) tts.writePcmChunk(chunk.samples);
      },
      onEnd: async () => {
        try { await tts.stopPcmPlayer(); } catch { /* ignore */ }
        if (active?.tts === tts) active = null;
        finish();
      },
      onError: async (e: { message?: string }) => {
        lastError = e?.message ?? 'Voice failed.';
        try { await tts.stopPcmPlayer(); } catch { /* ignore */ }
        if (active?.tts === tts) active = null;
        finish();
      },
    });
    if (my === token && active?.tts === tts) active.controller = controller;
    else { try { await controller.cancel(); } catch { /* ignore */ } }
  })().catch((e: any) => {
    lastError = String(e?.message ?? e);
    finish();
  });
}

/** Rough length of a spoken text, for the duration label on the voice chip. */
export function estimateSeconds(text: string): number {
  return Math.max(2, Math.round(text.replace(/\s+/g, ' ').length / 14));
}
