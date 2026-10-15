import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth } from '@react-native-firebase/auth';
import { ChatState, Story } from '../types';

// Chats stay on this phone (PRD: chat messages, summaries and facts are local only).
// Every account has its own chats on the phone: the keys carry the signed-in user's id ('guest' when not signed in).
const uid = () => getAuth().currentUser?.uid ?? 'guest';
const chatKey = (id: string) => `onefm.chat.${uid()}.${id}`;
const indexKey = () => `onefm.chats.${uid()}.index`;
const MAX_STORED_MESSAGES = 300;

// Before this version every account on a phone shared one list (onefm.chat.<id> and onefm.chats.index).
// The first account that opens the app after the update takes those old chats, once.
const LEGACY_INDEX = 'onefm.chats.index';
const MIGRATED = 'onefm.chats.migrated.v1';
let migrating: Promise<void> | null = null;
function migrate(): Promise<void> {
  if (!migrating) {
    migrating = (async () => {
      try {
        if (await AsyncStorage.getItem(MIGRATED)) return;
        let ids: string[] = [];
        try { ids = JSON.parse((await AsyncStorage.getItem(LEGACY_INDEX)) ?? '[]'); } catch { ids = []; }
        for (const id of ids) {
          const raw = await AsyncStorage.getItem(`onefm.chat.${id}`);
          if (raw) { await AsyncStorage.setItem(chatKey(id), raw); await AsyncStorage.removeItem(`onefm.chat.${id}`); }
        }
        if (ids.length) await AsyncStorage.setItem(indexKey(), JSON.stringify(ids));
        await AsyncStorage.removeItem(LEGACY_INDEX);
        await AsyncStorage.setItem(MIGRATED, '1');
      } catch { migrating = null; } // try again next time
    })();
  }
  return migrating;
}

export function newChat(story: Story): ChatState {
  return {
    storyId: story.id, title: story.title, genre: story.genres[0] ?? '', cover: story.cover[0], language: story.language,
    ep: 1, epCount: 0, messages: [], episodeSummaries: [], rollingSummary: '', facts: [],
    character: story.characters[0]?.name, updatedAt: Date.now(),
  };
}

export async function loadChat(id: string): Promise<ChatState | null> {
  try {
    await migrate();
    const raw = await AsyncStorage.getItem(chatKey(id));
    return raw ? (JSON.parse(raw) as ChatState) : null;
  } catch { return null; }
}

async function readIndex(): Promise<string[]> {
  await migrate();
  try { return JSON.parse((await AsyncStorage.getItem(indexKey())) ?? '[]'); } catch { return []; }
}

export async function saveChat(chat: ChatState): Promise<void> {
  await migrate();
  const c: ChatState = { ...chat, messages: chat.messages.slice(-MAX_STORED_MESSAGES), updatedAt: Date.now() };
  try {
    await AsyncStorage.setItem(chatKey(c.storyId), JSON.stringify(c));
    const idx = (await readIndex()).filter((x) => x !== c.storyId);
    await AsyncStorage.setItem(indexKey(), JSON.stringify([c.storyId, ...idx]));
  } catch {}
}

export async function deleteChat(id: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(chatKey(id));
    await AsyncStorage.setItem(indexKey(), JSON.stringify((await readIndex()).filter((x) => x !== id)));
  } catch {}
}

/** Chats that have at least one message, newest first. */
export async function listChats(): Promise<ChatState[]> {
  const ids = await readIndex();
  const all = await Promise.all(ids.map(loadChat));
  return all.filter((c): c is ChatState => !!c && c.messages.length > 0).sort((a, b) => b.updatedAt - a.updatedAt);
}
