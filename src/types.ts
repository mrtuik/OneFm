export type Lang = 'en' | 'bn' | 'hi';
export const LANG_LABEL: Record<Lang, string> = { en: 'English', bn: 'Bangla', hi: 'Hindi' };
export const LANGS: Lang[] = ['en', 'bn', 'hi'];

/** Who the reader is. A male reader plays male roles, a female reader plays female roles. Set in Profile. */
export type Gender = 'male' | 'female';
export const GENDER_LABEL: Record<Gender, string> = { male: 'Male', female: 'Female' };

/** Name and role are required. The other fields come from the story_engine_guide character card and are optional. */
export interface Character {
  name: string;
  role: string;
  age?: number;
  /** Roles without a gender can be played by anyone. */
  gender?: Gender;
  appearance?: string;
  personality?: string[];
  languageStyle?: string;
  speechHabits?: string[];
  wants?: string;
  fears?: string;
  secret?: string;
  flaw?: string;
  relationshipToUser?: string;
  exampleDialogue?: string[];
}
export interface Story {
  id: string;
  title: string;
  highlight: string;
  logline: string;
  genres: string[];
  language: Lang;
  characters: Character[];
  episodes: { goal: string; title?: string; scene?: string; hook?: string }[];
  /** Story bible fields from the story_engine_guide. All optional. */
  setting?: string;
  tone?: string;
  centralQuestion?: string;
  rules?: string[];
  secrets?: string[];
  /** Main story turns in order, and the possible endings. Optional, from the story_engine_guide. */
  plotBeats?: string[];
  endings?: string[];
  openingLine?: string;
  creatorName: string;
  likeCount: number;
  playCount: number;
  createdAt: number;
  readMin: number;
  cover: [string, string];
  /** Cover picture as an https link or a small data: URI. Optional, the gradient is used without it. */
  image?: string;
  /** Set on stories that came from the Community tab. */
  creatorUid?: string;
  fromCommunity?: boolean;
  /** The community post this story belongs to. */
  postId?: string;
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
export interface Fact { text: string; importance: number; ep: number; type?: string; characters?: string[] }
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
  /** Old field: who the reader was talking to (V5 and earlier). Not used for new chats. */
  character?: string;
  /** The role the reader plays. 'You' means the unnamed main character. The AI plays every other role. */
  userRole?: string;
  /** Gender of the reader when the role was chosen. The AI uses it for Hindi grammar (gaya / gayi). */
  userGender?: Gender;
  updatedAt: number;
}

/** A story shared in the Community tab. The full story travels inside the post. */
export interface Post {
  id: string;
  creatorUid: string;
  creatorName: string;
  /** Unique @username of the creator. Filled from the creator's profile when posts are loaded. */
  creatorUsername?: string;
  creatorAvatar?: string;
  createdAt: number;
  caption?: string;
  story: Story;
  likeCount: number;
  /** True when the admin put the story on the Home page. */
  featured?: boolean;
  /** Public posts show in Community. Private posts are kept under private/<uid> and only the owner sees them. */
  visibility?: Visibility;
}
export type Visibility = 'public' | 'private';
