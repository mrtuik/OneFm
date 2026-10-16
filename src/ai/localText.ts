// Pure helpers for the on-phone model (no native imports, so they are tested offline in tests/engine.test.js).

export interface Msg { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * Gemma style chat templates are safest with no system role. All leading system messages are put in front of the
 * first user message instead. Anything after the first user or assistant message is left as it is.
 */
export function foldSystem(messages: Msg[]): Msg[] {
  const sys: string[] = [];
  let i = 0;
  while (i < messages.length && messages[i].role === 'system') { sys.push(messages[i].content); i++; }
  const rest = messages.slice(i);
  if (!sys.length) return rest;
  const head = sys.join('\n\n');
  if (rest.length && rest[0].role === 'user') return [{ role: 'user', content: `${head}\n\n${rest[0].content}` }, ...rest.slice(1)];
  return [{ role: 'user', content: head }, ...rest];
}

/** Removes a thinking block that some templates print before the answer. */
export function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/^[\s\S]*?<\/think>/i, '')
    .replace(/<\|channel\>thought[\s\S]*?<channel\|>/gi, '')
    .trim();
}

/**
 * Keeps the prompt inside the context window. System messages and the last message always stay. The oldest chat
 * messages are dropped first (in whole turns). `maxChars` is roughly (context tokens - reply tokens) * 3.
 */
export function fitMessages(messages: Msg[], maxChars: number): Msg[] {
  const size = (m: Msg[]) => m.reduce((n, x) => n + x.content.length, 0);
  let head = 0;
  while (head < messages.length && messages[head].role === 'system') head++;
  const sys = messages.slice(0, head);
  const body = messages.slice(head);
  if (body.length <= 1) return messages;
  const last = body[body.length - 1];
  let mid = body.slice(0, -1);
  while (mid.length && size([...sys, ...mid, last]) > maxChars) mid = mid.slice(1);
  // A chat must not start with an assistant message.
  while (mid.length && mid[0].role === 'assistant') mid = mid.slice(1);
  return [...sys, ...mid, last];
}

/** Bytes of a part file that can be resumed. Anything under 1 MB restarts from zero. */
export const resumeOffset = (size: number | undefined): number => (size && size > 1_000_000 ? Math.floor(size) : 0);

/** A GGUF file starts with the four letters GGUF, which is R0dVRg== in base64. */
export const looksLikeGguf = (base64Head: string): boolean => base64Head.startsWith('R0dVRg');
