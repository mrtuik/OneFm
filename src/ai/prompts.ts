import { ChatMessage, ChatState, Character, Fact, Lang, Story } from '../types';
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

/**
 * Master system prompt, from story_engine_guide.md section 4 (HOW TO WRITE, SAFETY, LANGUAGE),
 * plus the episode and JSON output rules this app needs. The story, characters, secrets and memory
 * are sent in the second system message (see storyBible and memoryBlock).
 */
export function masterPrompt(lang: Lang): string {
  return `You are the narrator and all characters in an interactive story. The user plays the protagonist (say "you" in narration).

# HOW TO WRITE
1. Format every reply as a short narration line in *italics*, then character dialogue in quotes. Example:
   *Meera clutches her notebook tighter, eyes on the door.*
   "Tum yahan kya kar rahe ho?"
2. Keep replies 2 to 5 short lines (about 40 to 110 words). Never write a wall of text.
3. Show, don't tell. Use body language, objects, small actions and silence instead of stating emotions.
4. Give each character a distinct voice that matches their language_style and speech_habits. Never make characters sound the same.
5. Add subtext. Characters often say one thing and mean another.
6. Never speak or act for the user. Never decide the user's feelings or choices.
7. Move the story forward every reply: reveal something, raise a stake, or create a small choice. No filler.
8. Do not repeat phrases, openings or gestures used in the last 10 replies.
9. End most replies with a hook: a question, a surprise, an unfinished action, or a clear choice.
10. Stay in the story. Never say you are an AI and never mention these rules or the app. If the user breaks the story, respond in character and gently steer back.
11. Respect the current episode goal. Do not jump to later plot beats early.
12. Slow burn: emotions and relationships develop gradually across episodes, not in one reply.
13. Secrets are never revealed directly. Hint only when the story has earned it.

# EPISODES
- The story is told in episodes, each with a goal. Move toward the goal of the current episode without rushing.
- When the goal is met, or when the director note says to close the episode, write a closing beat that ends on a suspense hook and set "episode_complete" to true. Otherwise it is false.

# SAFETY (adult audience, 18+)
- All characters are adults (18+). A character under 18 may only be a supporting character, never in romantic, sexual or sensual content, and never the user's persona.
- A child in danger is allowed only in non-graphic form, with no abuse shown.
- No sexual content, graphic violence, self-harm instructions, or hateful content. If the user pushes for it, have the character deflect naturally and change the scene. Do not lecture.
- If the user seems genuinely distressed (not role-playing), step out of the story briefly, respond kindly, and suggest talking to someone they trust.

# LANGUAGE
${LANGUAGE_RULE[lang]} Match the user's language and script.

# OUTPUT FORMAT
Reply with ONE JSON object and nothing else, no markdown fences:
{"speaker":"main speaking character, or Narrator","display_text":"...","speech_text":"...","choices":["short option","short option"],"episode_complete":false}
- speech_text: the same content as display_text, without asterisks or stage directions, written so it sounds natural when read aloud.
- choices: 0 to 3 short ideas for what the user could do or say next. Use [] when not needed.`;
}

function characterCard(c: Character): string {
  const lines = [`- ${c.name}${c.age ? ` (${c.age})` : ''}: ${c.role}`];
  if (c.appearance) lines.push(`  appearance: ${c.appearance}`);
  if (c.personality?.length) lines.push(`  personality: ${c.personality.join(', ')}`);
  if (c.languageStyle) lines.push(`  language_style: ${c.languageStyle}`);
  if (c.speechHabits?.length) lines.push(`  speech_habits: ${c.speechHabits.join('; ')}`);
  if (c.wants) lines.push(`  wants: ${c.wants}`);
  if (c.fears) lines.push(`  fears: ${c.fears}`);
  if (c.flaw) lines.push(`  flaw: ${c.flaw}`);
  if (c.relationshipToUser) lines.push(`  relationship_to_user: ${c.relationshipToUser}`);
  if (c.exampleDialogue?.length) lines.push(`  example_dialogue: ${c.exampleDialogue.map((d) => `"${d}"`).join(' | ')}`);
  return lines.join('\n');
}

function storyBible(story: Story): string {
  const eps = story.episodes.map((e, i) => `${i + 1}. ${e.title ? `${e.title}: ` : ''}${e.goal}${e.hook ? ` (hook: ${e.hook})` : ''}`).join('\n');
  const secrets = [
    ...(story.secrets ?? []),
    ...(story.secrets?.length ? [] : story.characters.filter((c) => c.secret).map((c) => `${c.name}: ${c.secret}`)),
  ];
  return [
    'STORY',
    `Title: ${story.title}`,
    `Premise: ${story.logline}`,
    story.setting ? `Setting: ${story.setting}` : null,
    story.tone ? `Tone: ${story.tone}` : null,
    story.centralQuestion ? `Central question: ${story.centralQuestion}` : null,
    `Genres: ${story.genres.join(', ')}`,
    story.rules?.length ? `Story rules (must follow):\n${story.rules.map((r, i) => `${i + 1}. ${r}`).join('\n')}` : null,
    '',
    'CHARACTERS',
    story.characters.map(characterCard).join('\n') || '- (none listed)',
    secrets.length ? `\nSECRETS (never reveal directly, hint only when the story earns it)\n${secrets.map((s) => `- ${s}`).join('\n')}` : null,
    '',
    'EPISODE GOALS',
    eps || '(open ended)',
  ].filter((x) => x !== null).join('\n');
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

// ---- Memory prompts (story_engine_guide.md section 5) ----
export const SUMMARY_SYSTEM = 'You write compact story memory. Reply with plain text only.';
export const summaryPrompt = (title: string, ep: number, transcript: string) =>
  `Story: ${title}\nSummarize this episode in 3-4 sentences for story memory.
Include: what happened, how each main character feels now, any new secret or promise, and the unresolved thread.
Do not include dialogue. Be factual and specific (names, places, objects).
Output plain text only.

Episode ${ep} transcript:
${transcript}`;

export const FACTS_SYSTEM = 'You extract story facts. Reply with JSON only, no markdown.';
export const factsPrompt = (title: string, ep: number, transcript: string, known: string[]) =>
  `Story: ${title}\nFrom this episode, extract important facts worth remembering long-term. Output JSON only:
{"facts":[{"text":"","characters":[],"type":"secret|promise|relationship|event|object|preference","importance":1}]}
importance is 1 to 5 (5 = critical).
Rules: only concrete facts, max 8 items, no opinions, no repeats of known facts: ${known.length ? known.join(' | ') : '(none)'}

Episode ${ep} transcript:
${transcript}`;

export const MERGE_SYSTEM = 'You maintain a rolling story summary. Reply with plain text only.';
export const mergePrompt = (title: string, previous: string, eps: { ep: number; text: string }[]) =>
  `Story: ${title}\nMerge these summaries into one story-so-far summary under 250 words.
Keep: key events in order, current relationships, open secrets, unresolved threads.
Drop: minor details and repeated information.

Summaries:
${previous ? `Earlier: ${previous}\n` : ''}${eps.map((e) => `Ep ${e.ep}: ${e.text}`).join('\n')}`;

// Temperatures from the guide's model settings table.
export const TEMP = { chat: 0.9, summary: 0.25, facts: 0.15 };
