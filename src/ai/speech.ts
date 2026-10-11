import { Lang } from '../types';
import { ProviderSettings, chatCompletion } from './provider';
import { cleanSpeech } from '../format';

const SCRIPT: Record<'hi' | 'bn', string> = {
  hi: 'Devanagari script (हिन्दी)',
  bn: 'Bengali script (বাংলা)',
};

const wordCount = (t: string) =>
  t.replace(/\*/g, ' ').replace(/^\s*[A-Za-z][A-Za-z .'-]{0,24}:\s+/gm, '')
    .split(/\s+/).filter((w) => /[A-Za-z0-9\u0900-\u097F\u0980-\u09FF]/.test(w)).length;

/** The voice text must cover (almost) every word of what the reader sees. */
const covers = (display: string, speech: string) => wordCount(speech) >= wordCount(display) * 0.85;

const latinShare = (t: string) => {
  const latin = (t.match(/[A-Za-z]/g) ?? []).length;
  const all = (t.match(/[A-Za-z\u0900-\u097F\u0980-\u09FF]/g) ?? []).length;
  return all ? latin / all : 0;
};

const RULES: Record<'hi' | 'bn', string> = {
  hi: `Rewrite the Hinglish text in Hindi, Devanagari script (हिन्दी), exactly as a native Hindi writer would spell it. Use correct matras, nukta (ज़, फ़) and conjuncts. Write chai as चाय, kahani as कहानी, hai as है, hain as हैं, nahin as नहीं. English loan words go in Devanagari too (phone as फ़ोन). No Latin letters and no digits (write numbers as words).`,
  bn: `Rewrite the Banglish text in Bengali script (বাংলা), exactly as a native Bengali writer would spell it. Use correct vowel signs, ya-phala, ref and juktakkhor (conjuncts). Write golpo as গল্প, bhalo as ভালো, ache as আছে, ami as আমি. English loan words go in Bengali script too. No Latin letters and no digits (write numbers as words).`,
};

/**
 * Final text for the voice. English is read straight from the display text.
 * Hindi and Bangla voices only pronounce native script well, and the small chat model spells it badly when it
 * writes it inside the story JSON at a high temperature. So the display text is converted again in a separate,
 * low-temperature call, word by word. The model's own speech_text is only the fallback.
 */
export async function ensureSpeech(lang: Lang, display: string, speech: string, cfg: ProviderSettings, key: string): Promise<string> {
  const source = cleanSpeech(display);
  if (lang === 'en') return source || speech;

  const current = cleanSpeech(speech);
  if (!source) return current;

  try {
    let fixed = '';
    // The voice only reads native script. If the first try still has English letters, try once more.
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await chatCompletion({
        cfg, apiKey: key, model: cfg.model, maxTokens: 900, temperature: attempt === 0 ? 0.1 : 0.3,
        messages: [
          { role: 'system', content: `You prepare text for a text-to-speech voice, so spelling decides how it sounds. ${RULES[lang]} Convert EVERY word, in the same order. Never translate, shorten, summarise, skip or add anything. Keep the commas and full stops. Output only the converted text.${attempt ? ' The previous answer still had English letters. Every word must be in the native script.' : ''}` },
          { role: 'user', content: source },
        ],
      });
      fixed = cleanSpeech(out);
      if (fixed && covers(display, fixed) && latinShare(fixed) < 0.1) return fixed;
    }
    if (current && covers(display, current) && latinShare(current) < 0.1) return current;
    return latinShare(fixed) <= latinShare(current) || !current ? fixed || current : current;
  } catch {
    return current || source;
  }
}
