import { ChatMessage, ChatState, Story } from '../types';
import { ProviderError, ProviderSettings, chatCompletion } from '../ai/provider';
import { DEFAULT_MESSAGE_LIMIT, MIN_EPISODE_MESSAGES, Reply, TEMP, TurnMode, buildTurnMessages, parseReply } from '../ai/prompts';
import { runMemoryPipeline } from '../ai/memory';
import { ensureSpeech } from '../ai/speech';
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

async function askModel(story: Story, chat: ChatState, finalUser: string, history: ChatMessage[], mode: TurnMode, cfg: ProviderSettings, key: string): Promise<Reply> {
  const messages = buildTurnMessages(story, chat, finalUser, history, mode);
  let lastRaw = '';
  // Structured reply. If parsing fails, retry once, then show the plain text.
  for (let attempt = 0; attempt < 2; attempt++) {
    lastRaw = await chatCompletion({ cfg, apiKey: key, model: cfg.model, messages, json: true, maxTokens: 1000, temperature: TEMP.chat });
    const parsed = parseReply(lastRaw);
    if (parsed) return { ...parsed, speech_text: await ensureSpeech(story.language, parsed.display_text, parsed.speech_text, cfg, key) };
  }
  const plain = lastRaw.trim();
  if (!plain) throw new ProviderError('bad_reply', 'The AI sent a reply that could not be read.');
  return { speaker: 'Narrator', display_text: plain, speech_text: await ensureSpeech(story.language, plain, cleanSpeech(plain) || plain.replace(/\*/g, ''), cfg, key), choices: [], episode_complete: false };
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
  const endCard: ChatMessage = { id: mid(), role: 'episode_end', text: uiText(story.language).episodeDone(finishedEp), ep: finishedEp, createdAt: Date.now() };
  push({ ...chat, messages: [...chat.messages, endCard] });

  const withMemory = await runMemoryPipeline(cfg, key, story, chat, finishedEp);
  push({ ...withMemory, ep: finishedEp + 1, epCount: 0 });
  return chat;
}
