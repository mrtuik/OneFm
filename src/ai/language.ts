import { Lang } from '../types';
import { ProviderSettings, chatCompletion } from './provider';

// Common English words that Hinglish and Banglish almost never use.
const EN = new Set(('the and her his she he with that this is was are were at by from then you your they their its but of into around like while when what who which there where just only not').split(' '));

const stripLabel = (l: string) => l.replace(/^\s*[A-Za-z][A-Za-z .'-]{0,24}:\s+/, '').replace(/\*/g, ' ');

/** True when a line is written in English instead of Hinglish or Banglish. */
export function isEnglishLine(line: string): boolean {
  const words = stripLabel(line).toLowerCase().match(/[a-z']+/g) ?? [];
  if (words.length < 4) return false;
  const hits = words.filter((w) => EN.has(w)).length;
  return hits >= 2 && hits / words.length >= 0.2;
}

/**
 * Hindi and Bangla stories must be written in Hinglish / Banglish only. If the model slipped an English line into
 * the reply (narration usually), only those lines are rewritten in a small separate call. Good replies cost nothing.
 */
export async function ensureLanguage(lang: Lang, display: string, cfg: ProviderSettings, key: string): Promise<string> {
  if (lang === 'en') return display;
  const lines = display.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const bad = lines.filter(isEnglishLine);
  if (!bad.length) return display;

  const style = lang === 'hi' ? 'Hinglish (Hindi in English letters)' : 'Banglish (Bangla in English letters)';
  try {
    const out = await chatCompletion({
      cfg, apiKey: key, model: cfg.model, maxTokens: 900, temperature: 0.3,
      messages: [
        { role: 'system', content: `Some lines of this story text are in English. Rewrite ONLY the English lines in ${style}, the way people text, never English. Keep every other line exactly unchanged. Keep the same number of lines, the same order, the same asterisks and the same Name: labels. Do not translate names. Output only the text.` },
        { role: 'user', content: lines.join('\n') },
      ],
    });
    const fixed = out.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
    if (fixed.length !== lines.length || fixed.filter(isEnglishLine).length >= bad.length) return display;
    return fixed.join('\n\n');
  } catch {
    return display;
  }
}
