import * as SecureStore from 'expo-secure-store';

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
