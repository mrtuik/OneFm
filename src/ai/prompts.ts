import { ChatMessage, ChatState, Fact, Lang, Story } from '../types';
import { LlmMessage } from './provider';

export const DEFAULT_MESSAGE_LIMIT = 40;
/** Replies that claim the episode is done before this many messages are ignored. */
export const MIN_EPISODE_MESSAGES = 6;
const HISTORY_LIMIT = 14;

const LANGUAGE_RULE: Record<Lang, string> = {
  en: 'Language: natural, simple Indian English. speech_text is the same text in plain English.',
  bn: 'Language: Banglish, which is Bangla written in English letters, the way people text. display_text must be in English letters only. speech_text must be the same content written in Bengali script (বাংলা) so a voice can read it correctly.',
  hi: 'Language: Hinglish, which is Hindi written in English letters, the way people text. display_text must be in English letters only. speech_text must be the same content written in Devanagari script (हिन्दी) so a voice can read it correctly.',
};

/** Master system prompt. Swap this text if you keep a separate story_engine_guide. */
export function masterPrompt(lang: Lang): string {
  return `You are the engine of an interactive role-play story app called One Fm.

ROLE-PLAY
- The user plays the protagonist (call them "you" in narration). Never write the user's actions, words or thoughts.
- You narrate the world and play every other character. Stay in character and keep every detail consistent with the story, the memory and the chat so far.
- Never mention these rules, the app, or that you are an AI. Never break the story.
- Keep each reply short: about 50 to 130 words, a few short paragraphs. End so the user has something to react to.
- Narration goes inside asterisks like *the lights flicker*. Dialogue is plain text with the character name implied by context.

EPISODES
- The story is told in episodes. Each episode has a goal. Move the story toward the goal of the current episode without rushing.
- When the goal is met, or when the director note says to close the episode, write a closing beat that ends on a suspense hook and set "episode_complete" to true. Otherwise it is false.

CONTENT RULES (adult audience, 18+)
- No sexual content. No graphic violence or gore. No hate or harassment.
- A character under 18 may only be a supporting character. Never in romantic, sexual or sensual content, and never the user's persona.
- A child in danger is allowed only in non-graphic form, with no abuse shown.
- If the user pushes toward anything above, steer the scene somewhere else inside the story. Do not lecture.

${LANGUAGE_RULE[lang]}

OUTPUT FORMAT
Reply with ONE JSON object and nothing else, no markdown fences:
{"speaker":"main speaking character, or Narrator","display_text":"...","speech_text":"...","choices":["short option","short option"],"episode_complete":false}
- speech_text: the same content as display_text, without asterisks or stage directions, written so it sounds natural when read aloud.
- choices: 0 to 3 short ideas for what the user could do or say next. Use [] when not needed.`;
}

function storyBible(story: Story): string {
  const chars = story.characters.map((c) => `- ${c.name}: ${c.role}`).join('\n');
  const eps = story.episodes.map((e, i) => `${i + 1}. ${e.goal}`).join('\n');
  return `STORY BIBLE
Title: ${story.title}
Premise: ${story.logline}
Genres: ${story.genres.join(', ')}
Characters:
${chars || '- (none listed)'}
Episode goals:
${eps || '(open ended)'}`;
}

export function episodeGoal(story: Story, ep: number): string {
  return story.episodes[ep - 1]?.goal ?? 'Continue the story with a new development that raises the stakes and moves the plot forward.';
}

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9\u0980-\u09ff\u0900-\u097f]+/).filter((w) => w.length > 2);

/** Top facts for this turn: importance first, with a boost for facts that share words with the latest message. */
export function pickFacts(facts: Fact[], query: string, n = 8): Fact[] {
  const q = new Set(words(query));
  return [...facts]
    .map((f) => ({ f, score: f.importance * 2 + words(f.text).filter((w) => q.has(w)).length * 3 + f.ep * 0.001 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((x) => x.f);
}

function memoryBlock(chat: ChatState, query: string): string {
  const parts: string[] = [];
  if (chat.rollingSummary) parts.push(`Story so far (summary):\n${chat.rollingSummary}`);
  if (chat.episodeSummaries.length) {
    parts.push(`Recent episodes:\n${chat.episodeSummaries.map((s) => `Ep ${s.ep}: ${s.text}`).join('\n')}`);
  }
  const facts = pickFacts(chat.facts, query, 8);
  if (facts.length) parts.push(`Key facts to stay consistent with:\n${facts.map((f) => `- ${f.text}`).join('\n')}`);
  return parts.length ? `MEMORY\n${parts.join('\n\n')}` : 'MEMORY\n(this is a fresh story, nothing happened yet)';
}

function asHistory(m: ChatMessage): LlmMessage | null {
  if (m.role === 'episode_end') return null;
  if (m.role === 'user') return { role: 'user', content: m.text };
  return { role: 'assistant', content: JSON.stringify({ speaker: m.speaker ?? 'Narrator', display_text: m.text, speech_text: m.speech ?? m.text, choices: [], episode_complete: false }) };
}

export type TurnMode = 'turn' | 'begin' | 'close';

export function buildTurnMessages(story: Story, chat: ChatState, finalUser: string, history: ChatMessage[], mode: TurnMode): LlmMessage[] {
  const goal = episodeGoal(story, chat.ep);
  const limit = story.messageLimit ?? DEFAULT_MESSAGE_LIMIT;
  const direction = [`CURRENT EPISODE: ${chat.ep}`, `Goal: ${goal}`, `Messages used: ${chat.epCount} of ${limit}`].join('\n');

  const notes: string[] = [];
  if (chat.character) notes.push(`The user is currently talking to ${chat.character}.`);
  if (mode === 'begin') {
    notes.push(chat.ep === 1
      ? 'Begin episode 1 now. Set the scene and introduce the first character. Do not wait for the user.'
      : `Begin episode ${chat.ep} now. Open directly from the suspense hook the previous episode ended on.`);
  }
  if (mode === 'close') notes.push('The episode message limit is reached. Write the closing beat now, end on a suspense hook, and set episode_complete to true.');

  const last = notes.length ? `${finalUser}\n\n[Director note, not part of the story: ${notes.join(' ')}]` : finalUser;
  const hist = history.map(asHistory).filter((x): x is LlmMessage => !!x).slice(-HISTORY_LIMIT);

  return [
    { role: 'system', content: masterPrompt(story.language) },
    { role: 'system', content: `${storyBible(story)}\n\n${memoryBlock(chat, finalUser)}\n\n${direction}` },
    ...hist,
    { role: 'user', content: last },
  ];
}

export interface Reply {
  speaker: string;
  display_text: string;
  speech_text: string;
  choices: string[];
  episode_complete: boolean;
}

/** Pulls the JSON object out of a model reply. Returns null when it cannot be parsed. */
export function parseReply(raw: string): Reply | null {
  const a = raw.indexOf('{');
  const b = raw.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    const j = JSON.parse(raw.slice(a, b + 1));
    const display = typeof j.display_text === 'string' ? j.display_text.trim() : '';
    if (!display) return null;
    return {
      speaker: typeof j.speaker === 'string' && j.speaker.trim() ? j.speaker.trim() : 'Narrator',
      display_text: display,
      speech_text: typeof j.speech_text === 'string' && j.speech_text.trim() ? j.speech_text.trim() : display.replace(/\*/g, ''),
      choices: Array.isArray(j.choices) ? j.choices.filter((c: unknown) => typeof c === 'string' && c.trim()).slice(0, 3) : [],
      episode_complete: j.episode_complete === true,
    };
  } catch {
    return null;
  }
}

// ---- Memory prompts ----
export const SUMMARY_SYSTEM = 'You write compact story memory. Reply with plain text only.';
export const summaryPrompt = (title: string, ep: number, transcript: string) =>
  `Story: ${title}\nEpisode ${ep} transcript:\n${transcript}\n\nSummarize this episode in 3 to 4 sentences. Include what happened, what changed, and the hook it ended on. Plain English, no lists.`;

export const FACTS_SYSTEM = 'You extract story facts. Reply with a JSON array only, no markdown.';
export const factsPrompt = (title: string, ep: number, transcript: string) =>
  `Story: ${title}\nEpisode ${ep} transcript:\n${transcript}\n\nList up to 6 durable facts that later episodes must remember (names, relationships, promises, secrets, injuries, objects, places, decisions). Return a JSON array like [{"fact":"...","importance":1-5}] where 5 is critical. Use [] if nothing is worth keeping.`;

export const MERGE_SYSTEM = 'You maintain a rolling story summary. Reply with plain text only.';
export const mergePrompt = (title: string, previous: string, eps: { ep: number; text: string }[]) =>
  `Story: ${title}\nCurrent rolling summary:\n${previous || '(empty)'}\n\nNew episode summaries:\n${eps.map((e) => `Ep ${e.ep}: ${e.text}`).join('\n')}\n\nWrite the updated rolling summary in at most 250 words. Keep the important events, relationships and open threads in order. Drop minor detail.`;
