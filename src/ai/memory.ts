import { ChatMessage, ChatState, Fact, Story } from '../types';
import { chatCompletion, ProviderSettings } from './provider';
import { FACTS_SYSTEM, MERGE_SYSTEM, SUMMARY_SYSTEM, factsPrompt, mergePrompt, summaryPrompt } from './prompts';

const MERGE_EVERY = 10; // episodes
const MAX_FACTS = 200;

const transcript = (msgs: ChatMessage[]) =>
  msgs.filter((m) => m.role !== 'episode_end').map((m) => `${m.role === 'user' ? 'USER' : (m.speaker ?? 'AI')}: ${m.text}`).join('\n').slice(-9000);

async function summarize(cfg: ProviderSettings, key: string, story: Story, ep: number, text: string, fallback: string): Promise<string> {
  try {
    const out = await chatCompletion({
      cfg, apiKey: key, model: cfg.summaryModel,
      messages: [{ role: 'system', content: SUMMARY_SYSTEM }, { role: 'user', content: summaryPrompt(story.title, ep, text) }],
      maxTokens: 220, temperature: 0.3,
    });
    return out.trim();
  } catch {
    return fallback;
  }
}

async function extractFacts(cfg: ProviderSettings, key: string, story: Story, ep: number, text: string): Promise<Fact[]> {
  try {
    const out = await chatCompletion({
      cfg, apiKey: key, model: cfg.summaryModel,
      messages: [{ role: 'system', content: FACTS_SYSTEM }, { role: 'user', content: factsPrompt(story.title, ep, text) }],
      maxTokens: 400, temperature: 0.2,
    });
    const a = out.indexOf('[');
    const b = out.lastIndexOf(']');
    if (a < 0 || b <= a) return [];
    const arr = JSON.parse(out.slice(a, b + 1));
    return (Array.isArray(arr) ? arr : [])
      .filter((x: any) => x && typeof x.fact === 'string' && x.fact.trim())
      .slice(0, 6)
      .map((x: any) => ({ text: String(x.fact).trim(), importance: Math.min(5, Math.max(1, Math.round(Number(x.importance) || 3))), ep }));
  } catch {
    return [];
  }
}

async function mergeRolling(cfg: ProviderSettings, key: string, story: Story, chat: ChatState): Promise<string> {
  try {
    const out = await chatCompletion({
      cfg, apiKey: key, model: cfg.summaryModel,
      messages: [{ role: 'system', content: MERGE_SYSTEM }, { role: 'user', content: mergePrompt(story.title, chat.rollingSummary, chat.episodeSummaries) }],
      maxTokens: 450, temperature: 0.3,
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
  const text = transcript(epMsgs);
  const lastAi = [...epMsgs].reverse().find((m) => m.role === 'ai');
  const fallback = lastAi ? `Episode ${finishedEp} ended with: ${lastAi.text.replace(/\*/g, '').slice(0, 280)}` : `Episode ${finishedEp} finished.`;

  const [summary, newFacts] = await Promise.all([
    summarize(cfg, key, story, finishedEp, text, fallback),
    extractFacts(cfg, key, story, finishedEp, text),
  ]);

  let next: ChatState = {
    ...chat,
    episodeSummaries: [...chat.episodeSummaries, { ep: finishedEp, text: summary }],
    facts: [...chat.facts, ...newFacts].sort((a, b) => b.importance - a.importance || b.ep - a.ep).slice(0, MAX_FACTS),
  };

  if (next.episodeSummaries.length >= MERGE_EVERY) {
    const merged = await mergeRolling(cfg, key, story, next);
    if (merged) next = { ...next, rollingSummary: merged, episodeSummaries: [] };
  }
  return next;
}
