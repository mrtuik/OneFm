import { Lang } from '../types';
import { ProviderSettings, chatCompletion } from './provider';
import { cleanSpeech } from '../format';
import { Mark, applyEmotion, countSentences, emotionTags } from './speechPolish';

const SCRIPT: Record<'hi' | 'bn', string> = {
  hi: 'Devanagari script (हिन्दी)',
  bn: 'Bengali script (বাংলা)',
};

const wordCount = (t: string) =>
  t.replace(/\*/g, ' ').replace(/^\s*[A-Za-z][A-Za-z .'-]{0,24}:\s+/gm, '')
    .split(/\s+/).filter((w) => /[A-Za-z0-9\u0900-\u097F\u0980-\u09FF]/.test(w)).length;


// ---- Speaker names: the voice says who is talking ("Tanima bolche, ...") before each spoken line ----
const SPEAKER_LINE = /^\s*([A-Za-z][A-Za-z .'-]{0,24}):\s*(\S.*)$/;
const SAYS: Record<Lang, string> = { bn: 'bolche', hi: 'ne kaha', en: 'says' };

const isNarrator = (name: string) => /^(narrator|narration)$/i.test(name.trim());

/** True when the message has at least one line spoken by a named character ("Tanima: ..."). */
export function hasSpeakerLines(display: string): boolean {
  return display.split('\n').some((l) => { const m = l.match(SPEAKER_LINE); return !!m && !isNarrator(m[1]); });
}

/**
 * The text the voice should read, still in English letters: every line spoken by a character starts with
 * the name and a short "says", e.g. "Tanima bolche, ekta kotha bolbo". Narration lines stay as they are.
 * This text then goes through the normal native-script conversion.
 */
export function spokenSource(display: string, lang: Lang): string {
  const out: string[] = [];
  for (const raw of display.replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const m = line.match(SPEAKER_LINE);
    let piece = line.replace(/(\d)\s*%/g, '$1 percent');
    if (m && !isNarrator(m[1])) piece = `${m[1].trim()} ${SAYS[lang]}, ${m[2].replace(/(\d)\s*%/g, '$1 percent')}`;
    else if (m) piece = m[2].replace(/(\d)\s*%/g, '$1 percent');
    const core = piece.replace(/["\u201C\u201D*\s]+$/, '');
    out.push(/[.!?\u0964\u2026]$/.test(core) ? piece : `${core}.`);
  }
  return out.join('\n');
}

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
  const source = cleanSpeech(spokenSource(display, lang));
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

// Google Input Tools: the same service behind Google's Bangla/Hindi typing keyboards. It turns Latin letters
// (Banglish, Hinglish) into native script word by word, in a fraction of a second, with no API key.
// It is an unofficial endpoint, so any failure just falls through to the AI conversion below.
const ITC: Record<'hi' | 'bn', string> = { hi: 'hi-t-i0-und', bn: 'bn-t-i0-und' };

async function googleTransliterate(lang: 'hi' | 'bn', text: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const url = `https://inputtools.google.com/request?text=${encodeURIComponent(text)}&itc=${ITC[lang]}&num=1&cp=0&cs=1&ie=utf-8&oe=utf-8&app=demopage`;
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) return '';
    const j: any = await r.json();
    if (!Array.isArray(j) || j[0] !== 'SUCCESS' || !Array.isArray(j[1])) return '';
    return (j[1] as any[])
      .map((it) => String(it?.[1]?.[0] ?? it?.[0] ?? ''))
      .join(' ')
      .replace(/\s+([,.!?\u0964])/g, '$1')
      .trim();
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

async function convertPart(lang: 'hi' | 'bn', seg: string, cfg: ProviderSettings, key: string): Promise<string> {
  const quick = cleanSpeech(await googleTransliterate(lang, seg));
  if (quick && covers(seg, quick) && latinShare(quick) < 0.1) return quick;
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
  const latin = spokenSource(display, lang);
  const source = cleanSpeech(latin);
  if (lang === 'en') return [Promise.resolve(source)];
  const segs = splitForSpeech(source);
  // One emotion mark per sentence (! ? ...). They are put back only when the sentence count still matches, otherwise the voice stays neutral.
  const tags = emotionTags(latin);
  const counts = segs.map(countSentences);
  const aligned = tags.length === counts.reduce((a, b) => a + b, 0);
  let at = 0;
  return segs.map((seg, i) => {
    const mine: Mark[] = aligned ? tags.slice(at, at + counts[i]) : [];
    at += counts[i];
    return convertPart(lang, seg, cfg, key).then((t) => (t ? applyEmotion(t, mine) : t)).catch(() => '');
  });
}
