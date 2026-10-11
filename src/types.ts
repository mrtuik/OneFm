export type Lang = 'en' | 'bn' | 'hi';
export const LANG_LABEL: Record<Lang, string> = { en: 'English', bn: 'Bangla', hi: 'Hindi' };
export const LANGS: Lang[] = ['en', 'bn', 'hi'];

export interface Character { name: string; role: string }
export interface Story {
  id: string;
  title: string;
  highlight: string;
  logline: string;
  genres: string[];
  language: Lang;
  characters: Character[];
  episodes: { goal: string }[];
  creatorName: string;
  likeCount: number;
  playCount: number;
  createdAt: number;
  readMin: number;
  cover: [string, string];
  /** Max messages (yours and the AI's) inside one episode. Defaults to 40. */
  messageLimit?: number;
}
export const GENRES = ['Romance', 'Thriller', 'Horror', 'Fantasy', 'Campus'];

// ---- Chat, memory ----
export interface ChatMessage {
  id: string;
  role: 'user' | 'ai' | 'episode_end';
  /** Character name shown above an AI message. */
  speaker?: string;
  /** display_text: what is shown on screen. */
  text: string;
  /** speech_text: what is sent to the voice engine (native script for Bangla and Hindi). */
  speech?: string;
  choices?: string[];
  ep: number;
  createdAt: number;
}
export interface Fact { text: string; importance: number; ep: number }
export interface EpisodeSummary { ep: number; text: string }
export interface ChatState {
  storyId: string;
  title: string;
  genre: string;
  cover: string;
  language: Lang;
  ep: number;
  /** Messages (both sides) used in the current episode. */
  epCount: number;
  messages: ChatMessage[];
  /** Summaries of finished episodes that are not yet merged into the rolling summary. */
  episodeSummaries: EpisodeSummary[];
  rollingSummary: string;
  facts: Fact[];
  character?: string;
  updatedAt: number;
}
