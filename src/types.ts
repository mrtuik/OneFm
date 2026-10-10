export type Lang = 'en' | 'bn' | 'hi';
export const LANG_LABEL: Record<Lang, string> = { en: 'English', bn: 'Banglish', hi: 'Hinglish' };
export const LANGS: Lang[] = ['en', 'bn', 'hi'];

export const VOICES: Record<Lang, string[]> = {
  en: ['Aria (Indian English)', 'Dev (Indian English)'],
  bn: ['Anika (Bangla)', 'Arjun (Bangla)'],
  hi: ['Riya (Hindi)', 'Kabir (Hindi)'],
};

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
}
export const GENRES = ['Romance', 'Thriller', 'Horror', 'Fantasy', 'Campus'];
