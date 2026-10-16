// Gemma 4 on this phone: download manager and the llama.cpp engine (through llama.rn).
// Nothing here talks to a provider. Cloud providers stay in provider.ts.
import { useEffect, useState } from 'react';
import * as FS from 'expo-file-system/legacy';
import { Msg, fitMessages, foldSystem, looksLikeGguf, resumeOffset, stripThinking } from './localText';

export interface LocalModel {
  id: string;
  name: string;
  file: string;
  url: string;
  /** Rough size, shown to the reader and used for the free space check. */
  bytes: number;
  sizeLabel: string;
  minRamGb: number;
}

/** ggml-org is the llama.cpp team's own conversion of Google's Gemma 4 E2B (Apache-2.0). Q4_0 is about 2.84 GB. */
export const LOCAL_MODELS: LocalModel[] = [
  {
    id: 'gemma-4-e2b',
    name: 'Gemma 4 E2B',
    file: 'gemma-4-E2B-it-Q4_0.gguf',
    url: 'https://huggingface.co/ggml-org/gemma-4-E2B-it-GGUF/resolve/main/gemma-4-E2B-it-Q4_0.gguf',
    bytes: 2_840_000_000,
    sizeLabel: '2.8 GB',
    minRamGb: 6,
  },
];
export const DEFAULT_LOCAL = LOCAL_MODELS[0];

/** Context window. Gemma 4 E2B keeps its memory small, so 8k is fine on a 6 GB phone. */
export const N_CTX = 8192;
const MAX_REPLY_TOKENS = 700;
const TIMEOUT_MS = 4 * 60 * 1000;

const dir = () => `${FS.documentDirectory}models/`;
const finalUri = (m: LocalModel) => `${dir()}${m.file}`;
const partUri = (m: LocalModel) => `${dir()}${m.file}.part`;
const plain = (uri: string) => uri.replace(/^file:\/\//, '');

// ---------------- state, shared by the Profile panel and the chat ----------------

export type LocalPhase = 'none' | 'downloading' | 'paused' | 'ready';
export interface LocalState { phase: LocalPhase; received: number; total: number; error?: string }

let state: LocalState = { phase: 'none', received: 0, total: 0 };
const listeners = new Set<() => void>();
const setState = (p: Partial<LocalState>) => { state = { ...state, ...p }; listeners.forEach((f) => f()); };

export function useLocalState(): LocalState {
  const [s, setS] = useState(state);
  useEffect(() => {
    const f = () => setS(state);
    listeners.add(f);
    f();
    return () => { listeners.delete(f); };
  }, []);
  return s;
}

export async function isLocalReady(m: LocalModel = DEFAULT_LOCAL): Promise<boolean> {
  try { return (await FS.getInfoAsync(finalUri(m))).exists; } catch { return false; }
}

/** Looks at the files on disk and sets the phase (ready, paused with a partial file, or none). */
export async function refreshLocalState(m: LocalModel = DEFAULT_LOCAL): Promise<void> {
  if (dl) return; // a download is running, its own callbacks keep the state
  try {
    const fin = await FS.getInfoAsync(finalUri(m));
    if (fin.exists) { setState({ phase: 'ready', received: (fin as any).size ?? m.bytes, total: (fin as any).size ?? m.bytes, error: undefined }); return; }
    const part = await FS.getInfoAsync(partUri(m));
    const size = part.exists ? resumeOffset((part as any).size) : 0;
    setState(size ? { phase: 'paused', received: size, total: state.total || m.bytes } : { phase: 'none', received: 0, total: 0 });
  } catch {
    setState({ phase: 'none' });
  }
}

// ---------------- download (resumable, survives the app being closed) ----------------

let dl: FS.DownloadResumable | null = null;

export async function startDownload(m: LocalModel = DEFAULT_LOCAL): Promise<void> {
  if (dl) return;
  await FS.makeDirectoryAsync(dir(), { intermediates: true }).catch(() => {});
  const part = await FS.getInfoAsync(partUri(m));
  const offset = part.exists ? resumeOffset((part as any).size) : 0;
  const free = await FS.getFreeDiskStorageAsync().catch(() => Number.MAX_SAFE_INTEGER);
  const need = Math.max(0, m.bytes - offset) + 300_000_000;
  if (free < need) {
    setState({ error: `Not enough free space. You need about ${(need / 1e9).toFixed(1)} GB free.` });
    return;
  }
  const onProgress = (p: FS.DownloadProgressData) => {
    const total = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : m.bytes;
    setState({ phase: 'downloading', received: Math.min(p.totalBytesWritten, total), total });
  };
  setState({ phase: 'downloading', received: offset, total: state.total || m.bytes, error: undefined });
  dl = FS.createDownloadResumable(m.url, partUri(m), {}, onProgress, offset ? String(offset) : undefined);
  try {
    const res = offset ? await dl.resumeAsync() : await dl.downloadAsync();
    dl = null;
    if (!res || (res.status !== 200 && res.status !== 206)) throw new Error(`The download server answered ${res?.status ?? 'nothing'}.`);
    const done = await FS.getInfoAsync(partUri(m));
    const size = done.exists ? (done as any).size ?? 0 : 0;
    if (size < 2_500_000_000) throw new Error('The file is too small. Resume the download.');
    const head = await FS.readAsStringAsync(partUri(m), { encoding: FS.EncodingType.Base64, position: 0, length: 4 });
    if (!looksLikeGguf(head)) {
      await FS.deleteAsync(partUri(m), { idempotent: true });
      throw new Error('The downloaded file is not a model file. Start the download again.');
    }
    await FS.deleteAsync(finalUri(m), { idempotent: true });
    await FS.moveAsync({ from: partUri(m), to: finalUri(m) });
    setState({ phase: 'ready', received: size, total: size, error: undefined });
  } catch (e: any) {
    // Paused by the user: pauseDownload already set the state.
    if (!dl && state.phase === 'paused') return;
    dl = null;
    await refreshLocalState(m);
    setState({ error: String(e?.message ?? e) });
  }
}

export async function pauseDownload(m: LocalModel = DEFAULT_LOCAL): Promise<void> {
  const d = dl;
  if (!d) return;
  dl = null;
  setState({ phase: 'paused' });
  try { await d.pauseAsync(); } catch {}
  await refreshLocalState(m);
}

/** Deletes the partial file and starts over next time. */
export async function cancelDownload(m: LocalModel = DEFAULT_LOCAL): Promise<void> {
  await pauseDownload(m);
  await FS.deleteAsync(partUri(m), { idempotent: true }).catch(() => {});
  setState({ phase: 'none', received: 0, total: 0, error: undefined });
}

export async function deleteLocalModel(m: LocalModel = DEFAULT_LOCAL): Promise<void> {
  await releaseLocal();
  await FS.deleteAsync(finalUri(m), { idempotent: true }).catch(() => {});
  await FS.deleteAsync(partUri(m), { idempotent: true }).catch(() => {});
  setState({ phase: 'none', received: 0, total: 0, error: undefined });
}

// ---------------- engine ----------------

class LocalError extends Error {
  code: 'no_model' | 'load' | 'fail';
  constructor(code: LocalError['code'], message: string) { super(message); this.code = code; }
}

let ctx: any = null;
let loading: Promise<any> | null = null;

async function loadCtx(): Promise<any> {
  if (ctx) return ctx;
  if (loading) return loading;
  loading = (async () => {
    if (!(await isLocalReady())) throw new LocalError('no_model', 'Download the on-phone AI in Profile > AI brain first.');
    let initLlama: any;
    try { initLlama = require('llama.rn').initLlama; } catch { throw new LocalError('load', 'The on-phone AI engine is missing from this build.'); }
    try {
      ctx = await initLlama({ model: plain(finalUri(DEFAULT_LOCAL)), n_ctx: N_CTX, n_gpu_layers: 0, use_mlock: false });
      return ctx;
    } catch (e: any) {
      throw new LocalError('load', `The model could not start. This phone may not have enough free memory. ${String(e?.message ?? e)}`.trim());
    }
  })();
  try { return await loading; } finally { loading = null; }
}

/** Loads the model in the background so the first reply does not wait for it. */
export function warmLocal(): void { loadCtx().catch(() => {}); }

export async function releaseLocal(): Promise<void> {
  const c = ctx;
  ctx = null;
  try { await c?.release?.(); } catch {}
}

export interface LocalArgs { messages: Msg[]; json?: boolean; maxTokens?: number; temperature?: number }

async function run(a: LocalArgs): Promise<string> {
  const c = await loadCtx();
  const nPredict = Math.min(a.maxTokens ?? MAX_REPLY_TOKENS, MAX_REPLY_TOKENS);
  const messages = foldSystem(fitMessages(a.messages, (N_CTX - nPredict - 400) * 3));
  const base: any = {
    messages, n_predict: nPredict, temperature: a.temperature ?? 0.9, top_p: 0.95, top_k: 64,
    jinja: true, enable_thinking: false,
  };
  const timer = setTimeout(() => { try { c.stopCompletion?.(); } catch {} }, TIMEOUT_MS);
  try {
    let r: any;
    try {
      r = await c.completion(a.json ? { ...base, response_format: { type: 'json_object' } } : base);
    } catch (e: any) {
      // JSON constrained output is not available: ask again without it (the app parses the JSON itself).
      if (!a.json) throw e;
      r = await c.completion(base);
    }
    const text = stripThinking(String(r?.content ?? r?.text ?? ''));
    if (!text) throw new LocalError('fail', 'The on-phone AI sent an empty reply.');
    return text;
  } catch (e: any) {
    if (e instanceof LocalError) throw e;
    throw new LocalError('fail', `The on-phone AI failed. ${String(e?.message ?? e)}`.trim());
  } finally {
    clearTimeout(timer);
  }
}

// One reply at a time: a phone has one model in memory and one set of cores.
let tail: Promise<unknown> = Promise.resolve();
export function localCompletion(a: LocalArgs): Promise<string> {
  const p = tail.then(() => run(a), () => run(a));
  tail = p.catch(() => {});
  return p;
}
