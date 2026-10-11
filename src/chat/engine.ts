import { ChatMessage, ChatState, Story } from '../types';
import { ProviderError, ProviderSettings, chatCompletion } from '../ai/provider';
import { DEFAULT_MESSAGE_LIMIT, MIN_EPISODE_MESSAGES, Reply, TEMP, TurnMode, buildTurnMessages, parseReply } from '../ai/prompts';
import { runMemoryPipeline } from '../ai/memory';
import { saveChat } from './store';

export interface TurnOptions {
  /** A new message from the user. */
  userText?: string;
  /** Open a new episode without a user message. */
  begin?: boolean;
  /** Drop the last AI reply and write it again. */
  regenerate?: boolean;
}

let counter = 0;
const mid = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

async function askModel(story: Story, chat: ChatState, finalUser: string, history: ChatMessage[], mode: TurnMode, cfg: ProviderSettings, key: string): Promise<Reply> {
  const messages = buildTurnMessages(story, chat, finalUser, history, mode);
  let lastRaw = '';
  // Structured reply. If parsing fails, retry once, then show the plain text.
  for (let attempt = 0; attempt < 2; attempt++) {
    lastRaw = await chatCompletion({ cfg, apiKey: key, model: cfg.model, messages, json: true, maxTokens: 700, temperature: TEMP.chat });
    const parsed = parseReply(lastRaw);
    if (parsed) return parsed;
  }
  const plain = lastRaw.trim();
  if (!plain) throw new ProviderError('bad_reply', 'The AI sent a reply that could not be read.');
  return { speaker: 'Narrator', display_text: plain, speech_text: plain.replace(/\*/g, ''), choices: [], episode_complete: false };
}

/**
 * Runs one turn of the story. `commit` is called after every visible change so the screen can update.
 * Returns the final chat state. Throws ProviderError when the AI call fails (the user message is kept).
 */
export async function takeTurn(story: Story, start: ChatState, opts: TurnOptions, cfg: ProviderSettings, key: string, commit: (c: ChatState) => void): Promise<ChatState> {
  let chat = start;
  const push = (c: ChatState) => { chat = c; commit(c); saveChat(c); };

  let msgs = [...chat.messages];
  let epCount = chat.epCount;

  if (opts.userText) {
    msgs.push({ id: mid(), role: 'user', text: opts.userText, ep: chat.ep, createdAt: Date.now() });
    epCount += 1;
  }
  if (opts.regenerate) {
    while (msgs.length && msgs[msgs.length - 1].role !== 'user') {
      const m = msgs.pop();
      if (m && m.role === 'ai' && m.ep === chat.ep) epCount = Math.max(0, epCount - 1);
    }
  }
  push({ ...chat, messages: msgs, epCount });

  const limit = story.messageLimit ?? DEFAULT_MESSAGE_LIMIT;
  const mode: TurnMode = opts.begin ? 'begin' : epCount >= limit - 1 ? 'close' : 'turn';

  let finalUser: string;
  let history: ChatMessage[];
  if (opts.begin) {
    finalUser = chat.ep === 1 ? 'Begin the story.' : 'Begin the next episode.';
    history = msgs;
  } else {
    const last = msgs[msgs.length - 1];
    if (!last || last.role !== 'user') throw new ProviderError('bad_reply', 'There is no message to answer yet.');
    finalUser = last.text;
    history = msgs.slice(0, -1);
  }

  const reply = await askModel(story, chat, finalUser, history, mode, cfg, key);

  const ai: ChatMessage = {
    id: mid(), role: 'ai', speaker: reply.speaker, text: reply.display_text, speech: reply.speech_text,
    choices: reply.choices, ep: chat.ep, createdAt: Date.now(),
  };
  epCount += 1;
  push({ ...chat, messages: [...chat.messages, ai], epCount });

  const finished = mode === 'close' || (reply.episode_complete && epCount >= MIN_EPISODE_MESSAGES);
  if (!finished) return chat;

  // Episode over: write the end card first so the user sees it, then update memory in the background of this call.
  const finishedEp = chat.ep;
  const endCard: ChatMessage = { id: mid(), role: 'episode_end', text: `Episode ${finishedEp} complete`, ep: finishedEp, createdAt: Date.now() };
  push({ ...chat, messages: [...chat.messages, endCard] });

  const withMemory = await runMemoryPipeline(cfg, key, story, chat, finishedEp);
  push({ ...withMemory, ep: finishedEp + 1, epCount: 0 });
  return chat;
}
