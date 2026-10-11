import * as Speech from 'expo-speech';
import { Linking } from 'react-native';
import { Lang } from '../types';

/**
 * Voice engine interface. The app talks only to this file.
 * Today it uses the Android text-to-speech voices installed on the phone (expo-speech).
 * A sherpa-onnx engine can replace the functions below without touching any screen.
 */
export interface VoiceInfo { id: string; name: string; language: string }

const LOCALE: Record<Lang, string> = { en: 'en-IN', bn: 'bn-IN', hi: 'hi-IN' };

const norm = (l: string) => l.toLowerCase().replace('_', '-');

export async function listVoices(lang: Lang): Promise<VoiceInfo[]> {
  try {
    const all = await Speech.getAvailableVoicesAsync();
    return all
      .filter((v) => norm(v.language).startsWith(lang))
      .map((v) => ({ id: v.identifier, name: v.name || v.identifier, language: v.language }))
      .sort((a, b) => (norm(a.language).endsWith('in') ? -1 : 0) - (norm(b.language).endsWith('in') ? -1 : 0) || a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

/** English always works through the default engine. Bangla and Hindi need an installed voice. */
export async function hasVoice(lang: Lang): Promise<boolean> {
  if (lang === 'en') return true;
  return (await listVoices(lang)).length > 0;
}

export function openVoiceSettings() {
  Linking.sendIntent('com.android.settings.TTS_SETTINGS').catch(() => Linking.openSettings().catch(() => {}));
}

// ---- One player for the whole app: only one message speaks at a time ----
type Listener = (id: string | null) => void;
let current: string | null = null;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach((l) => l(current));

export const subscribePlaying = (l: Listener) => { listeners.add(l); l(current); return () => { listeners.delete(l); }; };
export const nowPlaying = () => current;

export function stopSpeaking() {
  Speech.stop();
  current = null;
  emit();
}

export function speak(id: string, text: string, lang: Lang, voiceId?: string) {
  Speech.stop();
  current = id;
  emit();
  const done = () => { if (current === id) { current = null; emit(); } };
  Speech.speak(text, {
    language: LOCALE[lang],
    voice: voiceId || undefined,
    rate: 1,
    onDone: done,
    onStopped: done,
    onError: done,
  });
}

/** Rough length of a spoken text, for the duration label on the voice chip. */
export function estimateSeconds(text: string): number {
  return Math.max(2, Math.round(text.replace(/\s+/g, ' ').length / 14));
}
