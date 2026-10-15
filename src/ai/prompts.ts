import { ChatMessage, ChatState, Character, Fact, Lang, Story } from '../types';
import { LlmMessage } from './provider';
import { isYou } from '../chat/roles';
import { cleanSpeech } from '../format';
import { brainBlock } from '../brain/brain';

export const DEFAULT_MESSAGE_LIMIT = 40;
/** Replies that claim the episode is done before this many messages are ignored. */
export const MIN_EPISODE_MESSAGES = 6;
const HISTORY_LIMIT = 20;

const LANG_NOTE: Record<Lang, string> = {
  en: 'Write narration, dialogue and choices in simple English.',
  hi: 'Write narration, dialogue and choices in Hinglish (Hindi in English letters). Not a single English sentence, not even in narration or action lines (write "Woh kursi kheench kar baith jaati hai", never "She pulls out a chair").',
  bn: 'Write narration, dialogue and choices in Banglish (Bangla in English letters). Not a single English sentence, not even in narration or action lines (write "Shey chair ta tene boshe", never "She pulls out a chair").',
};

const LANGUAGE_RULE: Record<Lang, string> = {
  en: 'Language: natural, simple Indian English for narration and dialogue. speech_text is the same text in plain English.',
  bn: 'Language: Banglish, which is Bangla written in English letters, the way people text. The narration is Banglish too, never English sentences. display_text must be in English letters only. speech_text must be the same content written in Bengali script (বাংলা) so a voice can read it correctly. Natural Banglish guide: write like a real Kolkata person texting. Use tumi/tomake/tomar for one person (tomader only for many people). Use ONE pronoun level for the whole story: every character says tumi, never tui/tor/tore/tora, and the verbs always match (bosho, dekho, bolo, jao, never bos, dekh, bol, ja). Keep sentences short and spoken, not bookish. Use real verbs people say: bosho, dekho, shono, chole ashi, bhalo lagche, jaao, ashchi. GOOD narration: \"Mitali counter e cha chhanche, tomar dike takay na.\" GOOD dialogue: \"Hmm. Tin bochhor por. Boso, bhije gechho to.\" BAD (never write): \"Shey coffee machine er pase thakte thakte cup ta haat e niye tomader dike takay.\" (clumsy, wrong pronoun), \"Ritwik er chokh e kichu bhulano alo\" (meaningless), \"chhup chhup kore likhcho\" (unnatural). If a phrase would sound odd said aloud in Bangla, rewrite it simply.',
  hi: 'Language: Hinglish, which is Hindi written in English letters, the way people text. The narration is Hinglish too, never English sentences (write "Dhoop chai ki tapri par pad rahi thi", not "The sun fell on the tapri"). display_text must be in English letters only. speech_text must be the same content written in Devanagari script (हिन्दी) so a voice can read it correctly.',
};

const EXAMPLE: Record<Lang, string> = {
  en: `*The tea stall is almost empty now. Aanya pours the chai without looking up.*

Aanya: "You are late. My chai went cold."

*Behind her, Bablu drags a stool over and slides a clean cup towards you.*

Bablu: "Sir, you came at the right time. I just put a fresh pot on."

Aanya: "So tell me, where were you last night? And give me a straight answer."`,
  hi: `*Tapri par bheed kam ho chuki hai. Aanya cup mein chai udelte hue bina dekhe bolti hai.*

Aanya: "Tumne der kar di. Meri chai thandi ho gayi."

*Peeche se Bablu stool khiskata hai aur tumhari taraf ek khaali cup badha deta hai.*

Bablu: "Bhaiya, aap sahi waqt par aaye hain. Abhi abhi nayi chai chadhayi hai."

Aanya: "Ab batao, kal raat itni der tak kahan the? Seedha jawab chahiye."`,
  bn: `*Cha-er dokan e bhir kome gechhe. Mitali cup e cha dhalte dhalte tomar dike na takiyei bole.*

Mitali: "Tumi deri korle. Amar cha ta thanda hoye gelo."

*Pechhone Kaku ekta stool tene ene tomar dike ekta khali cup egiye dey.*

Kaku: "Dada, ekdom thik somoye eshechho. Ekhuni notun cha chadhalam."

Mitali: "Ebar bolo, kal raat obdhi kothay chhile? Sotti ta bolbe."`,
};

/**
 * Master system prompt, from story_engine_guide.md section 4 (HOW TO WRITE, SAFETY, LANGUAGE),
 * plus the episode and JSON output rules this app needs. The story, characters, secrets and memory
 * are sent in the second system message (see storyBible and memoryBlock).
 */
export function masterPrompt(lang: Lang): string {
  return `You are the narrator and every character in an interactive story, except the one role the user plays (see ROLES in the story message). In narration the user's role is "you" (tum / tumi).

# NOVEL STANDARD
This is a serial novel told live, not a chatbot. Write like the best published web novels and screenplay-driven series: every scene has a want, an obstacle and a turn. Prose is specific, sensory and restrained. Dialogue carries subtext: people say one thing and want another. Every reply must make the reader curious about the next one.

# REPLY BLUEPRINT
Every reply is one beat of a scene: 4 to 8 short paragraphs, about 130 to 230 words in total, in this order:
1. A narration paragraph wrapped in one pair of asterisks, *like this*: one concrete sensory image and what a character is doing (1 or 2 short sentences).
2. A dialogue line that reacts to exactly what the user's role just said or did, written Name: "words"
3. A narration or dialogue paragraph where a character pursues their own want and pushes against someone (use wants, fears and flaw from the story bible).
4. The TURN: one thing changes (new information, a decision, a complication, a shift between two people).
5. The LAST paragraph is the hook (see HOOKS).
The shape (from a different story, never copy its names or words):
${EXAMPLE[lang]}
Format rules: narration and dialogue are ALWAYS separate paragraphs. Never put spoken words inside a narration paragraph and never put narration in a dialogue paragraph. Every spoken line starts with the speaker's name and a colon. Never write "Aanya ne kaha, ..." or an unnamed quote. Never write a Choices list inside display_text (choices go only in the choices field).

# SCENE ENGINE (every reply must do all of this)
- PURPOSE: each reply changes exactly ONE thing: what someone knows, what someone wants, how two people feel about each other, or the situation itself. If nothing changed, rewrite it.
- Characters DRIVE the story. They want something in the scene and act to get it. They do not stand around asking the user questions. If the user's message is short or passive, a character makes a move (reveals, arrives, decides, demands).
- Conflict and subtext: someone disagrees, hides, teases or pushes. Warm scenes still have a small tension underneath.
- CAST DISCIPLINE: only characters from the story bible speak. Do not invent a new named person unless the plot truly needs one (one messenger or stranger per episode at most, with a real job in the plot). No bystander ever chimes in with unrelated gossip. Normally 1 or 2 speakers per reply, 3 only in a group scene.
- OBJECTS: mention an object or place only if it will matter later (a clue, a gift, a lie, a memory). Never invent random things that fall, drop, spill or get knocked over just to add detail.
- NO TRIVIA: characters never ask about favourite flavour, favourite cup, which road you took, or similar small-talk facts, unless the answer is a clue to the plot.
- CONTINUITY: call back to something said or shown earlier. Names, places, objects and promises stay consistent.
- The user's role does nothing except what the user wrote. Never write "tum ... rakh dete ho / uthate ho / dekhte ho" for them.

# HOOKS
End every reply with ONE of these, never the same type twice in a row: an unanswered revelation, an interruption or arrival, a decision with a cost put to the user's role, a discovery the characters notice together, a quiet emotional turn that leaves something unsaid, or a pointed question that matters to the plot. A question is the hook in at most one reply out of three. Never repeat a question that was already asked. If your previous reply ended with a question and the user answered it, react to the answer and move on, never ask it again. The director note names the dramatic move and hook type for this reply: follow them.

# REAL TALK
- People talk, they do not make speeches. Dialogue lines are short (4 to 16 words), with interruptions, teasing, slang, fillers (arre, oye, hmm, yaar, bhai, as the character would say them) and half-finished sentences. Mix easy English words the way young people do in real chats.
- Every character sounds different (use language_style and speech_habits). A friend teases, a boss is curt, an elder speaks slowly.
- In dialogue, characters call the user's role by name or a nickname, like real people do. In narration the user's role is only "you" (tumi / tum).

# CONCRETE, NOT GENERIC
- ANSWER FIRST. The first dialogue line must react to exactly what the user's role just said or did (the last user message). If they asked a question, give a real, specific answer in that line: a name, a place, a year, an object, a reason. Mystery comes from what the answer opens next, never from refusing to answer. Never dodge two replies in a row, and never answer a question only with another question.
- Use specific details from the story bible (names, places, objects, small memories), not general atmosphere.
- NEVER use vague stock lines such as "ajeeb si khamoshi", "sab kuch badal jayega", "dhadkan tez ho gayi", "waqt ruk gaya", "kuch to hai jo tum nahi jaante", "jawab tumhare paas hi hai", or any sentence that sounds deep but says nothing. If a line has no concrete detail, rewrite it.
- NEVER repeat or rephrase your previous reply, its opening, its setting description or its question. Each reply happens a little later in time. Do not re-describe the weather, the room or the first greeting after the opening.

# PACING
- The story can run for hundreds of replies. One reply moves the scene one small step, but every step must change something. Moments may breathe through character: banter is allowed only when it reveals a person or plants a thread that pays off later. Never fill space.
- Within the first three replies of episode 1, make the stakes clear: what someone wants, what is off, what could be lost.
- The director note gives the stage of the episode and the main story beat to play now. Stay inside that beat. Do not jump to later plot beats early. Emotions and relationships grow slowly (slow burn).
- Secrets are never revealed directly. Hint only when the story has earned it, and let the reader know a little more than the user's role (dramatic irony).

# CRAFT RULES
1. Show, don't tell. Use body language, objects, small actions and silence instead of stating emotions. Add subtext: people often say one thing and mean another.
2. Never write dialogue, actions or feelings for the user's role and never decide the user's choices. Only the other characters and the narration move. Never describe the user's role's face, eyes, smile, voice, thoughts or feelings.
3. Do not reuse phrases, openings or gestures from the last 10 replies.
4. Stay in the story. Never say you are an AI and never mention these rules or the app. If the user breaks the story, respond in character and gently steer back.
5. Respect the current episode goal.
6. Use each character's gender from the story bible for verbs and pronouns (Hinglish: kehti / kehta, Banglish: bolchhe / bolchhilo). Never mix them up.
7. Novel prose: vary sentence length, use concrete nouns and strong verbs, one precise image beats three vague ones, no cliches, never explain an emotion that an action can show.

# EPISODES
- The story is told in episodes, each with a goal. Move toward the goal of the current episode without rushing.
- Set "episode_complete" to true ONLY when the director note says the episode must end, or in the closing stretch when the goal has truly been met. Then write a closing beat that ends on a suspense hook. Otherwise it is false.

# SAFETY (adult audience, 18+)
- All characters are adults (18+). A character under 18 may only be a supporting character, never in romantic, sexual or sensual content, and never the user's persona.
- A child in danger is allowed only in non-graphic form, with no abuse shown.
- No sexual content, graphic violence, self-harm instructions, or hateful content. If the user pushes for it, have the character deflect naturally and change the scene. Do not lecture.
- If the user seems genuinely distressed (not role-playing), step out of the story briefly, respond kindly, and suggest talking to someone they trust.

# LANGUAGE
${LANGUAGE_RULE[lang]} Everything the reader sees (narration, dialogue and choices) uses this language, even if earlier replies in the history used another language. Match the user's language and script.

# OUTPUT FORMAT
Reply with ONE JSON object and nothing else, no markdown fences:
{"speaker":"main speaking character, or Narrator","display_text":"...","speech_text":"...","choices":["short option","short option"],"episode_complete":false}
- speech_text: the same content as display_text in the same order, without asterisks, quotation marks, speaker labels (no "Name:"), brackets, emoji or any symbol, written so it sounds natural when read aloud. Only plain words with commas and full stops.
- choices: always give 3 DIFFERENT ideas that lead to different consequences (one speaks, one does something, one probes the main mystery or conflict of the story, never small talk or trivia), each 4 to 10 words, specific to what just happened, never all starting with the same word, never "I will say nothing" type filler. Written as what the user's role could say or do next, written from the user's own point of view, in the SAME language and script as display_text (Hinglish or Banglish, never English unless the story language is English). Example: "Usse puchho woh kya sawal hai". Use [] when not needed.`;
}

function characterCard(c: Character): string {
  const lines = [`- ${c.name}${c.age ? ` (${c.age})` : ''}${c.gender ? `, ${c.gender}` : ''}: ${c.role}`];
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
  const eps = story.episodes.map((e, i) => `${i + 1}. ${e.title ? `${e.title}: ` : ''}${e.goal}${e.scene ? ` [scene: ${e.scene}]` : ''}${e.hook ? ` (hook: ${e.hook})` : ''}`).join('\n');
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
    story.openingLine ? `Opening line idea (episode 1 only): ${story.openingLine}` : null,
    `Genres: ${story.genres.join(', ')}`,
    story.plotBeats?.length ? `Plot beats in order (move toward them slowly, never skip ahead):\n${story.plotBeats.map((b, i) => `${i + 1}. ${b}`).join('\n')}` : null,
    story.endings?.length ? `Possible endings (decide late, from the user's choices):\n${story.endings.map((b) => `- ${b}`).join('\n')}` : null,
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

export type TurnMode = 'turn' | 'begin' | 'close' | 'advance';

function rolesBlock(story: Story, chat: ChatState): string {
  const lines = ['ROLES'];
  if (isYou(chat.userRole)) {
    lines.push('The user plays the main character of the story, the unnamed "you" of the narration.');
  } else {
    const c = story.characters.find((x) => x.name === chat.userRole);
    lines.push(`The user plays ${chat.userRole}${c ? ` (${c.role})` : ''}. In narration this role is "you". Never write lines or actions for ${chat.userRole}.`);
    lines.push('If the story bible has an unnamed main character ("you") that the user is not playing, that person is now a normal character played by you. Give them a fitting name from the story.');
  }
  if (chat.userGender) lines.push(`The user is ${chat.userGender}. When you address the user's role, use ${chat.userGender} grammar and forms.`);
  lines.push('Narration addresses the user\'s role only as \"you\" (tumi). Do not narrate the user\'s role\'s eyes, face, smile or feelings.');
  const others = story.characters.filter((c) => c.name !== chat.userRole).map((c) => c.name);
  if (others.length) lines.push(`You play: ${others.join(', ')}, plus anyone else the scene needs.`);
  return lines.join('\n');
}

const DRAMA_MOVES = [
  'REVEAL: a character lets slip or shows one small concrete fact that is new to the user\'s role.',
  'COMPLICATION: something goes slightly wrong or someone arrives, and the situation gets harder.',
  'PRESSURE: a character wants something from the user\'s role and pushes for it, with a clear reason.',
  'CLUE: one specific object, place or detail that points at the main mystery or conflict. It must matter later.',
  'RELATIONSHIP SHIFT: the bond between two characters changes through one small action or one honest line.',
  'REVERSAL: something the user\'s role assumed turns out to be slightly different.',
];
const HOOK_TYPES = [
  'an unanswered revelation (a line that makes the reader ask "what?")',
  'an interruption or an arrival',
  'a decision with a cost, put to the user\'s role',
  'a discovery the characters notice together',
  'a pointed question that matters to the plot',
  'a quiet emotional turn that leaves something unsaid',
];

/**
 * Tells the model where the episode stands, which main beat to play, and which dramatic move and hook type
 * to use in THIS reply. The move and hook rotate with the message count, so no two replies in a row feel the same.
 */
export function pacingNote(story: Story, chat: ChatState, limit: number): string {
  const f = Math.min(1, chat.epCount / Math.max(1, limit));
  const stage = f < 0.15 ? 'OPENING. Set the scene, show who wants what, and make the stakes clear. Reveal nothing big yet.'
    : f < 0.6 ? 'MIDDLE. Complications and pressure, one small reveal at a time. Relationships grow slowly.'
    : f < 0.85 ? 'RISING. Tension grows and the episode goal comes closer, but do not reach it yet.'
    : 'CLOSING STRETCH. Land the episode goal and prepare the ending hook.';
  const lines = [`Stage of this episode: ${stage}`];
  const beats = story.plotBeats ?? [];
  if (beats.length) {
    const total = Math.max(1, story.episodes.length);
    const progress = Math.min(0.999, ((chat.ep - 1) + f) / total);
    const i = Math.min(beats.length - 1, Math.floor(progress * beats.length));
    lines.push(`Main story beat to play now: ${beats[i]}`);
    if (beats[i + 1]) lines.push(`Next beat (do NOT reach it yet): ${beats[i + 1]}`);
  } else {
    lines.push(`Main story beat to play now: move this one step forward: ${story.centralQuestion ?? episodeGoal(story, chat.ep)}`);
  }
  const move = chat.ep === 1 && chat.epCount < 3
    ? 'SET THE STAKES: make it clear what one character wants and what stands in the way.'
    : DRAMA_MOVES[(chat.epCount + chat.ep) % DRAMA_MOVES.length];
  const hook = HOOK_TYPES[(chat.epCount * 5 + chat.ep) % HOOK_TYPES.length];
  lines.push(`Dramatic move for THIS reply: ${move}`);
  lines.push(`Hook type for the last paragraph of THIS reply: ${hook}`);
  return lines.join('\n');
}

export function buildTurnMessages(story: Story, chat: ChatState, finalUser: string, history: ChatMessage[], mode: TurnMode): LlmMessage[] {
  const goal = episodeGoal(story, chat.ep);
  const limit = story.messageLimit ?? DEFAULT_MESSAGE_LIMIT;
  const direction = [`CURRENT EPISODE: ${chat.ep}`, `Goal: ${goal}`, `Messages used: ${chat.epCount} of ${limit}`, pacingNote(story, chat, limit)].join('\n');

  const notes: string[] = [];
  if (!chat.userRole && chat.character) notes.push(`The user is currently talking to ${chat.character}.`);
  if (mode === 'begin') {
    notes.push(chat.ep === 1
      ? 'Begin episode 1 now. Set the scene and introduce the first character. Do not wait for the user.'
      : `Begin episode ${chat.ep} now. Open directly from the suspense hook the previous episode ended on.`);
  }
  if (mode === 'turn') notes.push(`The user's role just said or did exactly this: \"${finalUser.replace(/\"/g, "'")}\". The first paragraph of your reply must react to it directly. Do NOT repeat, rephrase or restart your previous reply or the opening scene. Move the scene a little forward in time with something new. Follow the REPLY BLUEPRINT and SCENE ENGINE: one or two speakers from the story bible, one thing changes, and end on the hook type named in the stage note.`);
  if (endedWithQuestion(history)) notes.push('Your previous reply ended with a question. Do NOT end this reply with a question, and do not ask anything similar again.');
  notes.push(LANG_NOTE[story.language]);
  if (mode === 'advance') notes.push('The user tapped Next without writing anything. Continue the scene with the next story beat: the other characters act and speak, the plot moves one step. Write nothing for the user\'s role.');
  if (mode === 'close') notes.push('This episode must end now (the message limit is reached or the user chose the next episode). Write the closing beat, end on a suspense hook, and set episode_complete to true.');

  const last = notes.length ? `${finalUser}\n\n[Director note, not part of the story: ${notes.join(' ')}]` : finalUser;
  let hist = history.map(asHistory).filter((x): x is LlmMessage => !!x).slice(-HISTORY_LIMIT);
  // A chat must not start with an assistant message (the opening is written without a user message).
  if (hist.length && hist[0].role === 'assistant') hist = [{ role: 'user', content: 'Begin the story.' }, ...hist];

  return [
    { role: 'system', content: masterPrompt(story.language) + brainBlock(story.language) },
    { role: 'system', content: `${storyBible(story)}\n\n${rolesBlock(story, chat)}\n\n${memoryBlock(chat, finalUser)}\n\n${direction}` },
    ...hist,
    { role: 'user', content: last },
  ];
}

/** Share of words two texts have in common (0 to 1). Used to catch a reply that repeats the previous one. */
export function similarity(a: string, b: string): number {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  A.forEach((w) => { if (B.has(w)) hit++; });
  return hit / Math.min(A.size, B.size);
}

export interface Reply {
  speaker: string;
  display_text: string;
  speech_text: string;
  choices: string[];
  episode_complete: boolean;
}

/**
 * Keeps narration and dialogue in separate paragraphs, and every spoken line labelled with its speaker.
 * Only lines that mix several parts (narration + quote, or an unlabelled quote) are touched.
 */
export function normalizeDisplay(text: string, speaker: string): string {
  const PART = /(\*[^*]+\*|(?:[A-Za-z][A-Za-z .'-]{0,24}:\s*)?["\u201C][^"\u201D]+["\u201D])/g;
  const out: string[] = [];
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const pieces = line.split(PART).map((p) => p.trim()).filter(Boolean);
    const hasQuote = pieces.some((p) => /["\u201C]/.test(p) && !p.startsWith('*'));
    if (pieces.length < 2 && !(hasQuote && !/^[A-Za-z][A-Za-z .'-]{0,24}:/.test(line))) { out.push(line); continue; }
    for (const p of pieces) {
      if (p.startsWith('*') && p.endsWith('*')) out.push(p);
      else if (/["\u201C]/.test(p)) out.push(/^[A-Za-z][A-Za-z .'-]{0,24}:/.test(p) || !speaker || speaker === 'Narrator' ? p : `${speaker}: ${p}`);
      else if (/[A-Za-z\u0900-\u097F\u0980-\u09FF]/.test(p)) out.push(`*${p.replace(/\*/g, '')}*`);
    }
  }
  return out.join('\n\n');
}


const lastAiLine = (history: ChatMessage[]): string => {
  const m = [...history].reverse().find((x) => x.role !== 'user' && x.role !== 'episode_end');
  return m ? (m.text.trim().split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? '') : '';
};
const isQuestionLine = (l: string) => /\?\s*["\u201D*]*\s*$/.test(l);
export const endedWithQuestion = (history: ChatMessage[]): boolean => isQuestionLine(lastAiLine(history));

export interface ReplyContext {
  /** Names of the characters in the story bible plus the user's role. */
  cast: string[];
  /** Speakers that already spoke in two or more earlier replies (established, not a one-off bystander). */
  established: string[];
  /** The previous reply ended with a question. */
  prevQuestion: boolean;
}

export function replyContext(story: Story, chat: ChatState, history: ChatMessage[]): ReplyContext {
  const cast = story.characters.map((c) => c.name);
  if (chat.userRole && !isYou(chat.userRole)) cast.push(chat.userRole);
  const count: Record<string, number> = {};
  history.filter((m) => m.role !== 'user' && m.role !== 'episode_end').forEach((m) => {
    const seen = new Set<string>();
    m.text.split('\n').forEach((l) => { const mm = l.match(/^([A-Za-z][A-Za-z .'-]{0,24}):\s*["\u201C]/); if (mm) seen.add(mm[1].trim().toLowerCase()); });
    seen.forEach((n) => { count[n] = (count[n] ?? 0) + 1; });
  });
  return { cast, established: Object.keys(count).filter((n) => count[n] >= 2), prevQuestion: endedWithQuestion(history) };
}

const STOCK: RegExp[] = [
  /ajeeb si (khamoshi|shanti|baichaini)/i, /sab kuch badal (jayega|jaane)/i, /dhadkan (tez|badh)/i, /waqt (jaise )?(ruk|tham)/i,
  /jawab tumhare paas hi/i, /ek ajeeb sa (ehsaas|sannata)/i, /buk (dhuk ?dhuk|dhorphor)/i, /somoy (jeno )?thome/i,
];

/**
 * Checks that a reply follows the blueprint (narration in asterisks, labelled dialogue, enough length, no stock lines).
 * Returns a short reason when it does not, so the app can ask the model to write it again.
 */
export function qualityIssue(display: string, ctx?: ReplyContext): string | null {
  const paras = display.split('\n').map((p) => p.trim()).filter(Boolean);
  const narration = paras.filter((p) => /^\*[^*]+\*$/.test(p)).length;
  const said = paras.filter((p) => /^[A-Za-z][A-Za-z .'-]{0,24}:\s*["\u201C]/.test(p)).length;
  const wordCount = display.split(/\s+/).filter(Boolean).length;
  if (!said) return 'it has no dialogue line written as Name: "words"';
  if (!narration) return 'it has no narration paragraph wrapped in asterisks';
  if (wordCount < 70) return 'it is too short (write 130 to 230 words in 4 to 8 paragraphs)';
  if (STOCK.some((r) => r.test(display))) return 'it uses a vague stock line that says nothing concrete';
  if (ctx) {
    const speakers = Array.from(new Set(paras.map((p) => p.match(/^([A-Za-z][A-Za-z .'-]{0,24}):\s*["\u201C]/)?.[1]?.trim()).filter((x): x is string => !!x)));
    if (speakers.length > 3) return 'it has more than 3 speakers';
    const known = (n: string) => {
      const k = n.toLowerCase();
      return k === 'narrator' || ctx.established.includes(k) || ctx.cast.some((c) => { const cl = c.toLowerCase(); return cl === k || cl.split(/\s+/)[0] === k.split(/\s+/)[0]; });
    };
    const stranger = ctx.cast.length ? speakers.find((n) => !known(n)) : undefined;
    if (stranger) return `it brought in a new named character (${stranger}) who is not in the story bible. Use only the story's own characters`;
    const lastLine = paras[paras.length - 1] ?? '';
    if (ctx.prevQuestion && isQuestionLine(lastLine)) return 'it ends with a question again. End on a different hook type (revelation, interruption, decision, discovery or a quiet turn)';
  }
  return null;
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
    const speaker = typeof j.speaker === 'string' && j.speaker.trim() ? j.speaker.trim() : 'Narrator';
    return {
      speaker,
      display_text: normalizeDisplay(display, speaker),
      speech_text: cleanSpeech(typeof j.speech_text === 'string' && j.speech_text.trim() ? j.speech_text : display) || display.replace(/\*/g, ''),
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
