// OpenAI-compatible chat completion client (Groq, OpenRouter, or any custom endpoint).

export type Preset = 'groq' | 'openrouter' | 'custom';
export interface ProviderSettings { preset: Preset; baseUrl: string; model: string; summaryModel: string }

export const PRESETS: Record<Exclude<Preset, 'custom'>, ProviderSettings> = {
  groq: { preset: 'groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', summaryModel: 'llama-3.1-8b-instant' },
  openrouter: { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', summaryModel: 'openai/gpt-4o-mini' },
};
export const DEFAULT_PROVIDER: ProviderSettings = PRESETS.groq;

export class ProviderError extends Error {
  code: 'no_key' | 'auth' | 'rate' | 'network' | 'server' | 'bad_reply';
  constructor(code: ProviderError['code'], message: string) { super(message); this.code = code; }
}

export interface LlmMessage { role: 'system' | 'user' | 'assistant'; content: string }

interface CallArgs {
  cfg: ProviderSettings;
  apiKey: string;
  model: string;
  messages: LlmMessage[];
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
}

async function post(args: CallArgs, withJsonMode: boolean): Promise<Response> {
  const { cfg, apiKey, model, messages, maxTokens = 800, temperature = 0.8 } = args;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    return await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, messages, temperature, max_tokens: maxTokens,
        ...(withJsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: ctrl.signal,
    });
  } catch (e: any) {
    throw new ProviderError('network', e?.name === 'AbortError' ? 'The AI provider took too long to answer.' : 'Could not reach the AI provider. Check your internet connection.');
  } finally {
    clearTimeout(timer);
  }
}

export async function chatCompletion(args: CallArgs): Promise<string> {
  if (!args.apiKey) throw new ProviderError('no_key', 'Add your AI provider key in Profile first.');
  let res = await post(args, !!args.json);
  // Some endpoints do not support JSON mode. Retry once without it.
  if (res.status === 400 && args.json) res = await post(args, false);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new ProviderError('auth', 'The API key was rejected. Check it in Profile.');
    if (res.status === 429) throw new ProviderError('rate', 'The AI provider is rate limiting you. Wait a moment and retry.');
    let detail = '';
    try { detail = (await res.json())?.error?.message ?? ''; } catch {}
    throw new ProviderError('server', `The AI provider returned an error (${res.status}). ${detail}`.trim());
  }
  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) throw new ProviderError('bad_reply', 'The AI provider sent an empty reply.');
  return text;
}

export async function testConnection(cfg: ProviderSettings, apiKey: string): Promise<string> {
  const out = await chatCompletion({ cfg, apiKey, model: cfg.model, messages: [{ role: 'user', content: 'Reply with the word OK.' }], maxTokens: 8, temperature: 0 });
  return out.trim().slice(0, 40);
}
