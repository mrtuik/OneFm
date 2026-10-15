import { Lang } from '../types';

/**
 * Last step before the voice reads a text.
 *  1. normalizeSpeech: numbers become Bangla words (the voice cannot read digits).
 *  2. emotionTags / applyEmotion: sentence endings keep ! ? and ... so the native player can change speed,
 *     pause and loudness per sentence. The model itself never sees these marks (the native side turns them back into a full stop).
 */

const ONES = [
  'শূন্য', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়',
  'দশ', 'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ',
  'বিশ', 'একুশ', 'বাইশ', 'তেইশ', 'চব্বিশ', 'পঁচিশ', 'ছাব্বিশ', 'সাতাশ', 'আটাশ', 'ঊনত্রিশ',
  'ত্রিশ', 'একত্রিশ', 'বত্রিশ', 'তেত্রিশ', 'চৌত্রিশ', 'পঁয়ত্রিশ', 'ছত্রিশ', 'সাঁইত্রিশ', 'আটত্রিশ', 'ঊনচল্লিশ',
  'চল্লিশ', 'একচল্লিশ', 'বিয়াল্লিশ', 'তেতাল্লিশ', 'চুয়াল্লিশ', 'পঁয়তাল্লিশ', 'ছেচল্লিশ', 'সাতচল্লিশ', 'আটচল্লিশ', 'ঊনপঞ্চাশ',
  'পঞ্চাশ', 'একান্ন', 'বায়ান্ন', 'তিপ্পান্ন', 'চুয়ান্ন', 'পঞ্চান্ন', 'ছাপ্পান্ন', 'সাতান্ন', 'আটান্ন', 'ঊনষাট',
  'ষাট', 'একষট্টি', 'বাষট্টি', 'তেষট্টি', 'চৌষট্টি', 'পঁয়ষট্টি', 'ছেষট্টি', 'সাতষট্টি', 'আটষট্টি', 'ঊনসত্তর',
  'সত্তর', 'একাত্তর', 'বাহাত্তর', 'তিয়াত্তর', 'চুয়াত্তর', 'পঁচাত্তর', 'ছিয়াত্তর', 'সাতাত্তর', 'আটাত্তর', 'ঊনআশি',
  'আশি', 'একাশি', 'বিরাশি', 'তিরাশি', 'চুরাশি', 'পঁচাশি', 'ছিয়াশি', 'সাতাশি', 'অষ্টাশি', 'ঊননব্বই',
  'নব্বই', 'একানব্বই', 'বিরানব্বই', 'তিরানব্বই', 'চুরানব্বই', 'পঁচানব্বই', 'ছিয়ানব্বই', 'সাতানব্বই', 'আটানব্বই', 'নিরানব্বই',
];

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';

function words(n: number): string {
  if (n < 100) return ONES[n];
  const out: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  const hundred = Math.floor(n / 100); n %= 100;
  if (crore) out.push(`${words(crore)} কোটি`);
  if (lakh) out.push(`${ONES[lakh]} লাখ`);
  if (thousand) out.push(`${ONES[thousand]} হাজার`);
  if (hundred) out.push(`${ONES[hundred]}শো`);
  if (n) out.push(ONES[n]);
  return out.join(' ');
}

const digitByDigit = (s: string) => s.split('').map((d) => ONES[Number(d)]).join(' ');

/** "25" -> পঁচিশ, "2024" -> দুই হাজার চব্বিশ. Phone-like numbers (leading 0, or 9+ digits) are read digit by digit. */
function numberWords(s: string): string {
  if ((s.length > 1 && s[0] === '0') || s.length >= 9) return digitByDigit(s);
  return words(Number(s));
}

/** Makes a Bangla voice text readable: Bengali digits to plain digits, then every number to words. */
export function normalizeBn(text: string): string {
  let t = text.replace(/[\u09E6-\u09EF]/g, (d) => String(BN_DIGITS.indexOf(d)));
  t = t.replace(/\d{1,3}(?:,\d{2,3})+(?!\d)/g, (m) => m.replace(/,/g, '')); // 1,000 and 1,50,000 -> plain number
  t = t.replace(/\b(\d{1,2}):(\d{2})\b/g, (_m, h: string, m: string) => (Number(m) === 0 ? `${words(Number(h))}টা` : `${words(Number(h))}টা ${words(Number(m))}`));
  t = t.replace(/(\d+)\.(\d+)/g, (_m, a: string, b: string) => `${numberWords(a)} দশমিক ${digitByDigit(b)}`);
  t = t.replace(/\d+/g, (m) => numberWords(m));
  return t.replace(/\s+/g, ' ').trim();
}

/** Only Bangla is normalized here (Hindi and English voices already read their own digits or have them as words). */
export function normalizeSpeech(lang: Lang, text: string): string {
  return lang === 'bn' ? normalizeBn(text) : text;
}

// ---- Emotion marks ----
// '.' normal, '!' excited (faster and louder), '?' question (a little longer pause), '…' hesitant (slower and softer, longer pause)
export type Mark = '.' | '!' | '?' | '\u2026';

// A sentence ends at . ! ? or danda followed by a space or the end of the text.
const SENT = /([\s\S]+?)([.!?\u0964\u0965]+)(?=\s|$)/g;

export function countSentences(text: string): number {
  let n = 0;
  text.replace(SENT, (m) => { n++; return m; });
  return n;
}

/**
 * One mark per sentence of the Latin voice source (the text before conversion to Bengali script).
 * "..." inside a sentence does not end it, because cleanSpeech turns it into a comma, but it makes the whole sentence hesitant.
 */
export function emotionTags(latinSource: string): Mark[] {
  const marked = latinSource
    .replace(/[^A-Za-z0-9\u00C0-\u024F\u0900-\u097F\u0980-\u09FF\u200C\u200D\s,.!?\u0964\u0965\u2026]/g, ' ') // quotes, stars, emoji: same as cleanSpeech
    .replace(/\n/g, ' ')
    .replace(/\u2026|\.{2,}/g, '\u2026');
  const tags: Mark[] = [];
  marked.replace(SENT, (m, body: string, term: string) => {
    tags.push(term.includes('!') ? '!' : term.includes('?') ? '?' : body.includes('\u2026') ? '\u2026' : '.');
    return m;
  });
  return tags;
}

/** Puts the marks back on the converted text. If the sentence count does not match, the text is returned unchanged (neutral voice). */
export function applyEmotion(text: string, tags: Mark[]): string {
  if (!tags.length || tags.every((t) => t === '.')) return text;
  if (countSentences(text) !== tags.length) return text;
  let i = 0;
  return text.replace(SENT, (m, body: string) => {
    const t = tags[i++];
    return t === '.' ? m : `${body}${t}`;
  });
}
