import { ChatMessage, ChatState, Fact, Story } from '../types';
import { chatCompletion, ProviderSettings } from './provider';
import { EP_SUMMARY_SYSTEM, FACTS_SYSTEM, MERGE_SYSTEM, SUMMARY_SYSTEM, TEMP, epSummaryPrompt, factsPrompt, mergePrompt, summaryPrompt } from './prompts';

const MERGE_EVERY = 10; // episodes
const MAX_FACTS = 200;

const transcript = (msgs: ChatMessage[]) =>
  msgs.filter((m) => m.role !== 'episode_end').map((m) => `${m.role === 'user' ? 'USER' : (m.speaker ?? 'AI')}: ${m.text}`).join('\n').slice(-9000);

async function summarize(cfg: ProviderSettings, key: string, story: Story, ep: number, text: string, fallback: string): Promise<string> {
  try {
    const out = await chatCompletion({
      cfg, apiKey: key, model: cfg.summaryModel,
      messages: [{ role: 'system', content: SUMMARY_SYSTEM }, { role: 'user', content: summaryPrompt(story.title, ep, text) }],
      maxTokens: 300, temperature: TEMP.summary,
    });
    return out.trim();
  } catch {
    return fallback;
  }
}

async function extractFacts(cfg: ProviderSettings, key: string, story: Story, ep: number, text: string, known: Fact[]): Promise<Fact[]> {
  try {
    const out = await chatCompletion({
      cfg, apiKey: key, model: cfg.summaryModel,
      messages: [{ role: 'system', content: FACTS_SYSTEM }, { role: 'user', content: factsPrompt(story.title, ep, text, known.slice(0, 40).map((f) => f.text)) }],
      maxTokens: 600, temperature: TEMP.facts,
    });
    // The guide asks for {"facts":[...]}. Also accept a bare array.
    const o1 = out.indexOf('{');
    const o2 = out.lastIndexOf('}');
    const a1 = out.indexOf('[');
    const a2 = out.lastIndexOf(']');
    let arr: any = [];
    if (o1 >= 0 && o2 > o1) {
      try { const j = JSON.parse(out.slice(o1, o2 + 1)); arr = Array.isArray(j) ? j : j.facts; } catch { /* try the array form */ }
    }
    if (!Array.isArray(arr) || !arr.length) {
      if (a1 < 0 || a2 <= a1) return [];
      arr = JSON.parse(out.slice(a1, a2 + 1));
    }
    return (Array.isArray(arr) ? arr : [])
      .map((x: any) => ({ ...x, text: x?.text ?? x?.fact }))
      .filter((x: any) => x && typeof x.text === 'string' && x.text.trim())
      .slice(0, 8)
      .map((x: any): Fact => ({
        text: String(x.text).trim(),
        importance: Math.min(5, Math.max(1, Math.round(Number(x.importance) || 3))),
        ep,
        type: typeof x.type === 'string' ? x.type : undefined,
        characters: Array.isArray(x.characters) ? x.characters.filter((c: unknown) => typeof c === 'string') : undefined,
      }));
  } catch {
    return [];
  }
}

async function mergeRolling(cfg: ProviderSettings, key: string, story: Story, chat: ChatState): Promise<string> {
  try {
    const out = await chatCompletion({
      cfg, apiKey: key, model: cfg.summaryModel,
      messages: [{ role: 'system', content: MERGE_SYSTEM }, { role: 'user', content: mergePrompt(story.title, chat.rollingSummary, chat.episodeSummaries) }],
      maxTokens: 450, temperature: TEMP.summary,
    });
    return out.trim();
  } catch {
    return '';
  }
}

/**
 * Runs after an episode ends: episode summary, facts, and (every 10 episodes) a merge into the rolling summary.
 * Never throws. If the provider fails the memory falls back to a plain excerpt so nothing is lost.
 */
export async function runMemoryPipeline(cfg: ProviderSettings, key: string, story: Story, chat: ChatState, finishedEp: number): Promise<ChatState> {
  const epMsgs = chat.messages.filter((m) => m.ep === finishedEp);
  // The transcript is cut to its last 9000 characters, so the running summary of the older part goes in front of it.
  const earlier = chat.epSummary && chat.epSummaryEp === finishedEp ? `[Earlier part of this episode, already summarized]\n${chat.epSummary}\n\n[Latest part, full text]\n` : '';
  const text = earlier + transcript(epMsgs);
  const lastAi = [...epMsgs].reverse().find((m) => m.role === 'ai');
  const fallback = lastAi ? `Episode ${finishedEp} ended with: ${lastAi.text.replace(/\*/g, '').slice(0, 280)}` : `Episode ${finishedEp} finished.`;

  const [summary, newFacts] = await Promise.all([
    summarize(cfg, key, story, finishedEp, text, fallback),
    extractFacts(cfg, key, story, finishedEp, text, chat.facts),
  ]);

  let next: ChatState = {
    ...chat,
    // The episode is over: its running summary is replaced by the real episode summary below.
    epSummary: '', epSummaryAt: 0, epSummaryEp: finishedEp + 1,
    episodeSummaries: [...chat.episodeSummaries, { ep: finishedEp, text: summary }],
    facts: [...chat.facts, ...newFacts].sort((a, b) => b.importance - a.importance || b.ep - a.ep).slice(0, MAX_FACTS),
  };

  if (next.episodeSummaries.length >= MERGE_EVERY) {
    const merged = await mergeRolling(cfg, key, story, next);
    if (merged) next = { ...next, rollingSummary: merged, episodeSummaries: [] };
  }
  return next;
}

/** How many of the newest messages of the episode are sent word for word (the same number the prompt builder keeps). */
export const keepWindow = (compact: boolean): number => (compact ? 10 : 20);
/** The running summary is refreshed in batches, so there is not a summary call after every message. */
export const SUMMARY_BATCH = 6;

/** How many messages of the current episode are older than the chat window and not summarized yet. */
export function pendingForSummary(chat: ChatState, compact: boolean): number {
  const cur = chat.messages.filter((m) => m.ep === chat.ep && m.role !== 'episode_end');
  const done = chat.epSummaryEp === chat.ep ? chat.epSummaryAt ?? 0 : 0;
  return Math.max(0, cur.length - keepWindow(compact) - done);
}

/**
 * Keeps a running summary of the current episode. Messages that are older than the chat window (10 on the phone,
 * 20 in the cloud) would be forgotten by the AI, so every few messages they are folded into a short summary that is
 * sent in the MEMORY block of every reply. Never throws; on a failure the old summary stays and it is tried again next time.
 */
export async function updateEpisodeSummary(cfg: ProviderSettings, key: string, story: Story, chat: ChatState, compact: boolean): Promise<ChatState> {
  if (pendingForSummary(chat, compact) < SUMMARY_BATCH) return chat;
  const cur = chat.messages.filter((m) => m.ep === chat.ep && m.role !== 'episode_end');
  const done = chat.epSummaryEp === chat.ep ? chat.epSummaryAt ?? 0 : 0;
  const upTo = cur.length - keepWindow(compact);
  const fresh = cur.slice(done, upTo);
  const who = (m: ChatMessage) => (m.role === 'user' ? `USER (${chat.userRole || 'you'})` : (m.speaker ?? 'AI'));
  const text = fresh.map((m) => `${who(m)}: ${m.text.replace(/\*/g, '')}`).join('\n').slice(-6000);
  const previous = chat.epSummaryEp === chat.ep ? chat.epSummary ?? '' : '';
  try {
    const out = (await chatCompletion({
      cfg, apiKey: key, model: cfg.summaryModel,
      messages: [{ role: 'system', content: EP_SUMMARY_SYSTEM }, { role: 'user', content: epSummaryPrompt(story.title, chat.ep, previous, text) }],
      maxTokens: compact ? 220 : 320, temperature: TEMP.summary,
    })).trim();
    if (!out) return chat;
    return { ...chat, epSummary: out.slice(0, 1400), epSummaryAt: upTo, epSummaryEp: chat.ep };
  } catch {
    return chat;
  }
}
