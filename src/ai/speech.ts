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

/** True when the voice text the story model wrote is already usable: native script, covers the whole message. */
export function speechIsGood(lang: Lang, display: string, speech: string): boolean {
  if (lang === 'en') return true;
  const t = cleanSpeech(speech);
  return !!t && covers(display, t) && latinShare(t) < 0.1;
}

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

/** Cuts the message into a short first part (so the voice can start early) and a few bigger parts for the rest. */
export function splitForSpeech(source: string): string[] {
  const sentences = source.match(/[^.!?\u0964]+[.!?\u0964]*\s*/g)?.map((x) => x.trim()).filter(Boolean) ?? [source];
  const parts: string[] = [];
  let cur = '';
  let limit = 110; // the first part is short: it is converted and spoken first
  for (const sen of sentences) {
    if (cur && cur.length + sen.length > limit) { parts.push(cur); cur = ''; limit = 320; }
    cur = cur ? `${cur} ${sen}` : sen;
    if (parts.length === 0 && cur.length >= 60) { parts.push(cur); cur = ''; limit = 320; }
  }
  if (cur) parts.push(cur);
  return parts.length ? parts : [source];
}

async function convertPart(lang: 'hi' | 'bn', seg: string, cfg: ProviderSettings, key: string): Promise<string> {
  let best = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const out = await chatCompletion({
      cfg, apiKey: key, model: cfg.model, maxTokens: 400, temperature: attempt === 0 ? 0.1 : 0.3,
      messages: [
        { role: 'system', content: `You prepare text for a text-to-speech voice, so spelling decides how it sounds. ${RULES[lang]} Convert EVERY word, in the same order. Never translate, shorten, summarise, skip or add anything. Keep the commas and full stops. Output only the converted text.${attempt ? ' The previous answer still had English letters. Every word must be in the native script.' : ''}` },
        { role: 'user', content: seg },
      ],
    });
    const fixed = cleanSpeech(out);
    if (fixed && !best) best = fixed;
    if (fixed && covers(seg, fixed) && latinShare(fixed) < 0.1) return fixed;
  }
  return best && latinShare(best) < 0.3 ? best : '';
}

/**
 * One promise per part of the message, all started at once. The first part is short, so it is ready in a second or two
 * and the voice starts while the rest is still being converted. A part that could not be converted resolves to ''.
 */
export function speechParts(lang: Lang, display: string, cfg: ProviderSettings, key: string): Promise<string>[] {
  const source = cleanSpeech(display);
  if (lang === 'en') return [Promise.resolve(source)];
  return splitForSpeech(source).map((seg) => convertPart(lang, seg, cfg, key).catch(() => ''));
}
