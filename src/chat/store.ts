import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatState, Story } from '../types';

// Chats stay on this phone (PRD: chat messages, summaries and facts are local only).
const chatKey = (id: string) => `onefm.chat.${id}`;
const INDEX = 'onefm.chats.index';
const MAX_STORED_MESSAGES = 300;

export function newChat(story: Story): ChatState {
  return {
    storyId: story.id, title: story.title, genre: story.genres[0] ?? '', cover: story.cover[0], language: story.language,
    ep: 1, epCount: 0, messages: [], episodeSummaries: [], rollingSummary: '', facts: [],
    character: story.characters[0]?.name, updatedAt: Date.now(),
  };
}

export async function loadChat(id: string): Promise<ChatState | null> {
  try {
    const raw = await AsyncStorage.getItem(chatKey(id));
    return raw ? (JSON.parse(raw) as ChatState) : null;
  } catch { return null; }
}

async function readIndex(): Promise<string[]> {
  try { return JSON.parse((await AsyncStorage.getItem(INDEX)) ?? '[]'); } catch { return []; }
}

export async function saveChat(chat: ChatState): Promise<void> {
  const c: ChatState = { ...chat, messages: chat.messages.slice(-MAX_STORED_MESSAGES), updatedAt: Date.now() };
  try {
    await AsyncStorage.setItem(chatKey(c.storyId), JSON.stringify(c));
    const idx = (await readIndex()).filter((x) => x !== c.storyId);
    await AsyncStorage.setItem(INDEX, JSON.stringify([c.storyId, ...idx]));
  } catch {}
}

export async function deleteChat(id: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(chatKey(id));
    await AsyncStorage.setItem(INDEX, JSON.stringify((await readIndex()).filter((x) => x !== id)));
  } catch {}
}

/** Chats that have at least one message, newest first. */
export async function listChats(): Promise<ChatState[]> {
  const ids = await readIndex();
  const all = await Promise.all(ids.map(loadChat));
  return all.filter((c): c is ChatState => !!c && c.messages.length > 0).sort((a, b) => b.updatedAt - a.updatedAt);
}
