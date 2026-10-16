import * as SecureStore from 'expo-secure-store';
import { isLocalReady } from './local';

// The API key lives in the Android Keystore through SecureStore. It is never logged and never sent to Firebase.
const KEY = 'onefm.ai.key';

export async function getApiKey(): Promise<string> {
  try { return (await SecureStore.getItemAsync(KEY)) ?? ''; } catch { return ''; }
}
export async function setApiKey(v: string): Promise<void> {
  const t = v.trim();
  if (!t) { await SecureStore.deleteItemAsync(KEY).catch(() => {}); return; }
  await SecureStore.setItemAsync(KEY, t);
}

/** The key to pass to the AI calls. The on-phone model needs no key, so any non-empty text works. */
export async function getAiKey(p: { preset: string }): Promise<string> {
  return p.preset === 'local' ? 'local' : getApiKey();
}
/** True when the chosen AI can answer right now (a key is saved, or the on-phone model is downloaded). */
export async function aiReady(p: { preset: string }): Promise<boolean> {
  return p.preset === 'local' ? isLocalReady() : !!(await getApiKey());
}
