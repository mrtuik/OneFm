export function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}

/**
 * Text for the voice engine: no markdown, no symbols, no emoji, no stage marks.
 * Only letters (Latin, Devanagari, Bengali, including the joiners ZWJ and ZWNJ that Bangla conjuncts need), digits, spaces and the pause marks , and . are kept.
 * ? and ! become a full stop so the voice never reads them out.
 */
export function cleanSpeech(text: string): string {
  return text
    .replace(/^\s*[A-Za-z][A-Za-z .'-]{0,24}:\s+/gm, '') // "Veer:" speaker labels
    .replace(/[?!\u0964\u0965]+/g, '.')
    .replace(/\u2026|\.{2,}/g, ',')
    .replace(/[^A-Za-z0-9\u00C0-\u024F\u0900-\u097F\u0980-\u09FF\u200C\u200D\s,.]/g, ' ') // symbols, quotes, brackets, emoji
    .replace(/\s*([,.])(?:\s*[,.])+/g, '$1')
    .replace(/\s+([,.])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
