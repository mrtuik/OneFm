// Pure helpers for the tappable choice chips (no imports, so they are tested offline in tests/engine.test.js).
// The AI sometimes writes the chips in Hinglish ("Main call ka reason bataunga") inside a Banglish story. These helpers
// find such chips so the app can rewrite or replace them before the reader sees them.

export type ChoiceLang = 'en' | 'hi' | 'bn';

/** Words that are Hindi / Hinglish and are not used in Banglish. One hit is enough. */
const HINDI_STRONG = new Set((
  'mujhe mujhse mera meri mere hum hamara hamari hai hain nahi nahin kya kyun kyon kuch karunga karungi karoonga ' +
  'batauga bataunga batati batata samjhaunga samjhaungi puchunga poochunga pucchunga bolunga bolungi dekhunga dekhungi ' +
  'jaunga jaungi chalunga chalungi sunaunga sunaungi lekin woh usse unse apne apna apni tumhara tumhari tumhare ' +
  'pehle phir abhi sabko sabse isliye kyunki bataungi batao poocho puchho dikhao dikhaunga'
).split(' '));
/** Words that are common in Hinglish but also appear in other places ("main gate"). They only count together. */
const HINDI_WEAK = new Set('main ka ko se aur baat bhi toh tum'.split(' '));

/** Words that are Bangla / Banglish and are not used in Hinglish. One hit is enough. */
const BANGLA_STRONG = new Set((
  'ami amar amake amader tumi tomar tomake tomader korbo korchi korchhi bolbo bolchi bolchhi jabo jachhi dekhbo dekhchi ' +
  'jiggesh jigges jigesh kothay kotha keno achhe ache nei noy hobe holo kintu shudhu ekhon tarpor tahole ' +
  'jiggeshkorbo shunbo bujhbo janbo niye'
).split(' '));

const tokens = (s: string): string[] => s.toLowerCase().match(/[a-z]+/g) ?? [];

/** How many Hinglish markers a text has: strong words count 2, weak words count 1. */
function hindiScore(text: string): number {
  return tokens(text).reduce((n, w) => n + (HINDI_STRONG.has(w) ? 2 : HINDI_WEAK.has(w) ? 1 : 0), 0);
}
function banglaScore(text: string): number {
  return tokens(text).reduce((n, w) => n + (BANGLA_STRONG.has(w) ? 2 : 0), 0);
}

/**
 * True when a chip is in the wrong language for the story. A Banglish story must not have Hinglish chips, and a
 * Hinglish story must not have Banglish chips. English stories are not checked.
 */
export function isWrongLanguageChoice(lang: ChoiceLang, choice: string): boolean {
  if (lang === 'bn') return hindiScore(choice) >= 2 && banglaScore(choice) < 2;
  if (lang === 'hi') return banglaScore(choice) >= 2 && hindiScore(choice) < 2;
  return false;
}

/** Splits choices into the ones that are fine and the ones in the wrong language. Keeps the order. */
export function splitChoices(lang: ChoiceLang, choices: string[]): { good: string[]; bad: string[] } {
  const good: string[] = [];
  const bad: string[] = [];
  for (const c of choices) (isWrongLanguageChoice(lang, c) ? bad : good).push(c);
  return { good, bad };
}

/** Chips used only when nothing better is available (the AI gave wrong language chips and the rewrite failed). */
export const FALLBACK_CHOICES: Record<ChoiceLang, string[]> = {
  en: ['I ask what is really going on', 'I look around for a clue', 'I step closer and listen'],
  hi: ['Main poochta hoon asli baat kya hai', 'Main aas paas koi suraag dhoondhta hoon', 'Main thoda paas jaakar sunta hoon'],
  bn: ['Ami jiggesh kori asol byapar ta ki', 'Ami charidike kono clue khuji', 'Ami ektu kachhe giye shuni'],
};

/** Keeps the good chips and fills the rest from the fallback list, at most 3, no repeats. */
export function fillChoices(lang: ChoiceLang, good: string[]): string[] {
  const out = [...good];
  for (const f of FALLBACK_CHOICES[lang]) {
    if (out.length >= 3) break;
    if (!out.includes(f)) out.push(f);
  }
  return out.slice(0, 3);
}

/**
 * For chats saved before V3.1: chips already stored on the last reply may be in the wrong language. Wrong ones are
 * hidden and replaced, so the reader never sees a Hinglish chip in a Banglish story.
 */
export function displayChoices(lang: ChoiceLang, choices: string[]): string[] {
  if (!choices.length) return choices;
  const { good, bad } = splitChoices(lang, choices);
  return bad.length ? fillChoices(lang, good) : choices;
}
