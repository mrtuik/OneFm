import { ChatMessage, ChatState, Story } from '../types';
import { ProviderError, ProviderSettings, chatCompletion } from '../ai/provider';
import { DEFAULT_MESSAGE_LIMIT, MIN_EPISODE_MESSAGES, Reply, TEMP, TurnMode, buildTurnMessages, currentState, mergeState, parseReply, qualityIssue, replyContext, similarity } from '../ai/prompts';
import { withRoleInfo } from './roles';
import { runMemoryPipeline } from '../ai/memory';
import { ensureLanguage } from '../ai/language';
import { saveChat } from './store';
import { cleanSpeech } from '../format';
import { uiText } from './uiText';

export interface TurnOptions {
  /** A new message from the user. */
  userText?: string;
  /** Open a new episode without a user message. */
  begin?: boolean;
  /** Drop the last AI reply and write it again. */
  regenerate?: boolean;
  /** Next: the story moves on by itself, the user writes nothing. */
  advance?: boolean;
  /** Next episode: write the closing beat now and end the episode. */
  closeEpisode?: boolean;
}

let counter = 0;
const mid = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

const REPEAT_LIMIT = 0.6;

async function askModel(story: Story, chat: ChatState, finalUser: string, history: ChatMessage[], mode: TurnMode, cfg: ProviderSettings, key: string): Promise<Reply> {
  const base = buildTurnMessages(story, chat, finalUser, history, mode);
  // The last few AI replies. A new reply that says almost the same thing is rejected and written again.
  const recent = history.filter((m) => m.role === 'ai').slice(-2).map((m) => m.text);
  const ctx = replyContext(story, chat, history);
  let lastRaw = '';
  let messages = base;
  // Structured reply. If parsing fails, the reply repeats an earlier one, or it does not follow the blueprint
  // (narration + labelled dialogue, enough length, concrete), retry (up to 3 tries), then show the best we have.
  let fallback: Reply | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    lastRaw = await chatCompletion({ cfg, apiKey: key, model: cfg.model, messages, json: true, maxTokens: 1600, temperature: attempt === 0 ? TEMP.chat : Math.min(1, TEMP.chat + 0.1) });
    const parsed = parseReply(lastRaw);
    if (!parsed) continue;
    const repeated = mode !== 'begin' && recent.some((t) => similarity(parsed.display_text, t) >= REPEAT_LIMIT);
    const issue = mode === 'close' ? null : qualityIssue(parsed.display_text, ctx);
    if (!repeated && !issue) return { ...parsed, display_text: await ensureLanguage(story.language, parsed.display_text, cfg, key) };
    if (!repeated || !fallback) fallback = parsed; // keep a reply that is only weak over one that repeats
    const last = base[base.length - 1];
    const note = repeated
      ? 'Your previous attempt repeated an earlier reply. Write a completely different reply that answers the user\'s message first and adds something new. Do not reuse the earlier opening line or scene description.'
      : `Your previous attempt was rejected because ${issue}. Write it again and follow the REPLY BLUEPRINT exactly: narration paragraphs in asterisks, dialogue lines written as Name: "words" from the story's own characters only, matching the length to the moment, at least two spoken lines, narration under half, and a different opening from earlier replies.`;
    messages = [...base.slice(0, -1), { ...last, content: `${last.content}\n\n[${note}]` }];
  }
  if (fallback) return { ...fallback, display_text: await ensureLanguage(story.language, fallback.display_text, cfg, key) };
  const plain = lastRaw.trim();
  if (!plain) throw new ProviderError('bad_reply', 'The AI sent a reply that could not be read.');
  return { speaker: 'Narrator', display_text: plain, speech_text: cleanSpeech(plain) || plain.replace(/\*/g, ''), choices: [], episode_complete: false };
}

/**
 * Runs one turn of the story. `commit` is called after every visible change so the screen can update.
 * Returns the final chat state. Throws ProviderError when the AI call fails (the user message is kept).
 */
export async function takeTurn(storyIn: Story, start: ChatState, opts: TurnOptions, cfg: ProviderSettings, key: string, commit: (c: ChatState) => void): Promise<ChatState> {
  // Fill in the full story bible (setting, tone, secrets, example dialogue) when the saved story only has the short version.
  const story = withRoleInfo(storyIn);
  let chat = start;
  const push = (c: ChatState) => { chat = c; commit(c); saveChat(c); };

  let msgs = [...chat.messages];
  let epCount = chat.epCount;

  if (opts.userText) {
    msgs.push({ id: mid(), role: 'user', text: opts.userText, ep: chat.ep, createdAt: Date.now() });
    epCount += 1;
  }
  if (opts.regenerate) {
    // Only the last AI reply is replaced. What came before it stays.
    const m = msgs[msgs.length - 1];
    if (m && m.role === 'ai') {
      msgs.pop();
      if (m.ep === chat.ep) epCount = Math.max(0, epCount - 1);
    }
  }
  push({ ...chat, messages: msgs, epCount });

  const limit = story.messageLimit ?? DEFAULT_MESSAGE_LIMIT;
  const tail = msgs[msgs.length - 1];
  // No user message to answer (Next button, or regenerating a Next reply): the story moves on by itself.
  const advance = !!opts.advance || (!opts.begin && !opts.closeEpisode && !opts.userText && !!tail && tail.role !== 'user');
  const begin = !!opts.begin || (!opts.closeEpisode && !advance && !tail);
  const mode: TurnMode = begin ? 'begin'
    : opts.closeEpisode ? 'close'
    : epCount >= limit - 1 ? 'close'
    : advance ? 'advance'
    : 'turn';

  let finalUser: string;
  let history: ChatMessage[];
  if (begin) {
    finalUser = chat.ep === 1 ? 'Begin the story.' : 'Begin the next episode.';
    history = msgs;
  } else if (advance || opts.closeEpisode) {
    finalUser = opts.closeEpisode ? 'End this episode now.' : 'Continue the story.';
    history = msgs;
  } else {
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== 'user') throw new ProviderError('bad_reply', 'There is no message to answer yet.');
    finalUser = last.text;
    history = msgs.slice(0, -1);
  }

  const reply = await askModel(story, chat, finalUser, history, mode, cfg, key);

  // Story state after this reply. It lives on the reply itself, so regenerating (which drops the reply) never duplicates events.
  const prevAi = [...history].reverse().find((m) => m.role === 'ai');
  const tapped = mode === 'turn' && prevAi?.choices?.includes(finalUser) ? finalUser : undefined;
  const state = mergeState(story, currentState(chat), reply.state, tapped);
  const ai: ChatMessage = {
    id: mid(), role: 'ai', speaker: reply.speaker, text: reply.display_text, speech: reply.speech_text,
    choices: reply.choices, state, ep: chat.ep, createdAt: Date.now(),
  };
  epCount += 1;
  push({ ...chat, messages: [...chat.messages, ai], epCount });

  const finished = mode === 'close' || (reply.episode_complete && epCount >= MIN_EPISODE_MESSAGES);
  if (!finished) return chat;

  // Episode over: write the end card first so the user sees it, then update memory in the background of this call.
  const finishedEp = chat.ep;
  const endCard: ChatMessage = { id: mid(), role: 'episode_end', text: uiText(story.language).episodeDone(finishedEp), ep: finishedEp, createdAt: Date.now() };
  push({ ...chat, messages: [...chat.messages, endCard] });

  const withMemory = await runMemoryPipeline(cfg, key, story, chat, finishedEp);
  push({ ...withMemory, ep: finishedEp + 1, epCount: 0 });
  return chat;
}
