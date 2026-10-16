// Chat completion: OpenAI-compatible clients (Groq, OpenRouter, any custom endpoint) and Gemma 4 on this phone.
import { localCompletion } from './local';

export type Preset = 'local' | 'groq' | 'openrouter' | 'custom';
export interface ProviderSettings { preset: Preset; baseUrl: string; model: string; summaryModel: string }

export const PRESETS: Record<Exclude<Preset, 'custom'>, ProviderSettings> = {
  // Groq shut down llama-3.3-70b-versatile and llama-3.1-8b-instant on 16 Aug 2026 (404 model not found). gpt-oss is the replacement.
  groq: { preset: 'groq', baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-120b', summaryModel: 'openai/gpt-oss-20b' },
  // Gemma 4 runs on the phone (src/ai/local.ts). No key and no URL.
  local: { preset: 'local', baseUrl: '', model: 'gemma-4-e2b', summaryModel: 'gemma-4-e2b' },
  openrouter: { preset: 'openrouter', baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini', summaryModel: 'openai/gpt-4o-mini' },
};
export const DEFAULT_PROVIDER: ProviderSettings = PRESETS.groq;

/** Models providers have shut down, and what to use instead. Applied to settings saved by older versions. */
export const RETIRED_MODELS: Record<string, string> = {
  'llama-3.3-70b-versatile': 'openai/gpt-oss-120b',
  'llama-3.1-8b-instant': 'openai/gpt-oss-20b',
  'qwen/qwen3-32b': 'openai/gpt-oss-120b',
  'meta-llama/llama-4-scout-17b-16e-instruct': 'openai/gpt-oss-120b',
};
export const migrateProvider = (p: ProviderSettings): ProviderSettings =>
  p.baseUrl.includes('groq.com')
    ? { ...p, model: RETIRED_MODELS[p.model] ?? p.model, summaryModel: RETIRED_MODELS[p.summaryModel] ?? p.summaryModel }
    : p;

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
  // gpt-oss models think before they answer and the thinking uses the token budget. Keep it short and leave room.
  const reasoning = /gpt-oss/i.test(model);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    return await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model, messages, temperature, max_tokens: reasoning ? maxTokens * 2 + 600 : maxTokens,
        ...(reasoning && cfg.baseUrl.includes('groq.com') ? { reasoning_effort: 'low' } : {}),
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
  if (args.cfg.preset === 'local') {
    try {
      return await localCompletion({ messages: args.messages, json: args.json, maxTokens: args.maxTokens, temperature: args.temperature });
    } catch (e: any) {
      throw new ProviderError(e?.code === 'no_model' ? 'no_key' : 'server', String(e?.message ?? 'The on-phone AI failed.'));
    }
  }
  if (!args.apiKey) throw new ProviderError('no_key', 'Add your AI provider key in Profile first.');
  let res = await post(args, !!args.json);
  // Some endpoints do not support JSON mode. Retry once without it.
  if (res.status === 400 && args.json) res = await post(args, false);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new ProviderError('auth', 'The API key was rejected. Check it in Profile.');
    if (res.status === 404) {
      let d = '';
      try { d = (await res.json())?.error?.message ?? ''; } catch {}
      throw new ProviderError('server', `${d || 'Model not found.'} Open Profile and pick a model your provider still offers (Groq: openai/gpt-oss-120b).`);
    }
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
